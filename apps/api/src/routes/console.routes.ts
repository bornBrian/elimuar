import { Router } from "express";
import { and, asc, desc, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import {
  createAcademicClassRequestSchema,
  createAcademicSubjectRequestSchema,
  platformAcademicSchema,
  platformDashboardSchema,
  platformLogPageSchema,
  platformSchoolDetailSchema,
  platformSchoolListSchema,
  platformUserListSchema,
  updateAcademicRegisterEntryRequestSchema,
} from "@elimuar/shared";
import { db } from "../db/client.js";
import {
  arActivities,
  arActivityRuns,
  auditEvents,
  classes,
  districts,
  gradeLevels,
  lessons,
  memberships,
  regions,
  schools,
  studentEnrollments,
  subjects,
  teacherAssignments,
  users,
} from "../db/schema.js";
import { insertReturning, updateReturning } from "../db/helpers.js";
import { recordAudit } from "../lib/audit.js";
import { HttpError, asyncHandler, parse, sendData } from "../lib/http.js";
import {
  isPlatformStaff,
  requireAuth,
  requireRole,
  requireSchoolManager,
  resolveSchoolId,
  type AuthedRequest,
} from "../middleware/auth.js";

export const consoleRouter = Router();

consoleRouter.use(requireAuth);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 24 * 60 * 60 * 1000;

const PERIODS = [7, 30, 90, 365];

function clampPeriod(raw: unknown): number {
  const parsed = Number.parseInt(String(raw ?? "30"), 10);
  return PERIODS.includes(parsed) ? parsed : 30;
}

function dayLabel(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function formSpan(grades: string[]): string {
  if (grades.length === 0) return "No classes yet";
  const ordered = [...grades].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (ordered.length === 1) return ordered[0];
  return `${ordered[0]} – ${ordered[ordered.length - 1]}`;
}

function num(value: unknown): number {
  return Number(value ?? 0);
}

consoleRouter.get(
  "/platform/console/dashboard",
  requireRole("platform_admin"),
  asyncHandler(async (req, res) => {
    const days = clampPeriod(req.query.days);
    const since = new Date(Date.now() - days * DAY_MS);

    const [schoolRows, lessonRows, classRows, memberRows, sessionRows] = await Promise.all([
      db
        .select({ id: schools.id, name: schools.name, status: schools.status, createdAt: schools.createdAt })
        .from(schools)
        .orderBy(asc(schools.name)),
      db
        .select({ id: lessons.id, status: lessons.status, subject: lessons.subject, createdAt: lessons.createdAt })
        .from(lessons),
      db.select({ id: classes.id, gradeLevel: classes.gradeLevel }).from(classes),
      db
        .select({
          role: memberships.role,
          status: memberships.status,
          schoolId: memberships.schoolId,
          claimedAt: users.claimedAt,
          memberCreatedAt: memberships.startedAt,
        })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id)),
      db
        .select({
          studentId: arActivityRuns.userId,
          startedAt: arActivityRuns.playedAt,
          completed: sql<boolean>`${arActivityRuns.status} in ('completed', 'mastered')`,
          assignmentId: arActivityRuns.assignmentId,
          subject: sql<string>`coalesce(${arActivities.subject}, 'Other')`,
        })
        .from(arActivityRuns)
        .leftJoin(arActivities, eq(arActivityRuns.activityKey, arActivities.activityKey))
        .where(gte(arActivityRuns.playedAt, since)),
    ]);

    const buckets = Array.from({ length: days }, (_, index) => {
      const date = new Date(Date.now() - (days - 1 - index) * DAY_MS);
      return {
        label: dayLabel(date),
        start: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
        learners: new Set<string>(),
        sessions: 0,
        submissions: 0,
        ar: 0,
      };
    });

    const bucketAt = (time: number) => {
      const index = Math.floor((time - buckets[0].start) / DAY_MS);
      return index >= 0 && index < buckets.length ? buckets[index] : null;
    };

    const subjectRuns = new Map<string, number>();
    for (const row of sessionRows) {
      const bucket = bucketAt(row.startedAt.getTime());
      if (bucket) {
        bucket.learners.add(row.studentId);
        bucket.sessions += 1;
        if (Number(row.completed) && row.assignmentId) bucket.submissions += 1;
        bucket.ar += 1;
      }
      subjectRuns.set(row.subject, (subjectRuns.get(row.subject) ?? 0) + 1);
    }

    const population = (role: string) => {
      const rows = memberRows.filter((row) => row.role === role);
      const activated = rows.filter((row) => row.claimedAt !== null).length;
      return {
        total: rows.length,
        active: rows.filter((row) => row.status === "active").length,
        pending: rows.length - activated,
      };
    };

    const students = population("student");
    const teachers = population("teacher");

    const trendOf = (counts: number[], currentTotal: number) => {
      const total = counts.reduce((sum, value) => sum + value, 0);
      const points = counts.reduce<number[]>((acc, _, index) => {
        const cumulative = counts.slice(0, index + 1).reduce((sum, value) => sum + value, 0);
        return [...acc, cumulative];
      }, []);
      const cumulativeAt = (index: number) =>
        counts.slice(0, index + 1).reduce((sum, value) => sum + value, 0);
      const before = currentTotal - cumulativeAt(counts.length - 1);
      return { delta: total, previous: Math.max(0, before), points };
    };

    const joinTrend = (
      rows: Array<{ createdAt: Date | null }>,
      bucketCount: number
    ) => {
      const counts = Array.from({ length: bucketCount }, () => 0);
      for (const row of rows) {
        if (!row.createdAt) continue;
        const index = Math.floor((row.createdAt.getTime() - since.getTime()) / DAY_MS);
        if (index >= 0 && index < bucketCount) counts[index] += 1;
      }
      return trendOf(counts, rows.length);
    };

    const schoolTrend = joinTrend(
      schoolRows.map((row) => ({ createdAt: row.createdAt })),
      days
    );
    const studentTrend = joinTrend(
      memberRows
        .filter((row) => row.role === "student")
        .map((row) => ({ createdAt: row.memberCreatedAt ?? row.claimedAt })),
      days
    );
    const teacherTrend = joinTrend(
      memberRows
        .filter((row) => row.role === "teacher")
        .map((row) => ({ createdAt: row.memberCreatedAt ?? row.claimedAt })),
      days
    );
    const contentTrend = joinTrend(
      lessonRows.map((row) => ({ createdAt: row.createdAt })),
      days
    );

    const publishedLessons = lessonRows.filter((row) => row.status === "published");
    const draftLessons = lessonRows.filter((row) => row.status === "draft");
    const reviewLessons = lessonRows.filter((row) => row.status === "in_review");

    const headlessSchools = schoolRows.filter(
      (school) =>
        !memberRows.some(
          (member) => member.role === "school_admin" && member.schoolId === school.id && member.status === "active"
        )
    );
    const suspendedSchools = schoolRows.filter((school) => school.status === "suspended");
    const unclaimedTeachers = memberRows.filter((row) => row.role === "teacher" && row.claimedAt === null);

    const nameList = (names: string[]) =>
      names.length === 0 ? "None" : names.length === 1 ? names[0] : `${names[0]} and ${names.length - 1} more`;

    const needsAttention = [
      suspendedSchools.length > 0 && {
        id: "schools-inactive",
        count: suspendedSchools.length,
        title: "School inactive",
        detail: nameList(suspendedSchools.map((s) => s.name)),
        href: "/admin/schools?status=suspended",
      },
      headlessSchools.length > 0 && {
        id: "heads-pending",
        count: headlessSchools.length,
        title: "School-head pending",
        detail: nameList(headlessSchools.map((s) => s.name)),
        href: "/admin/schools",
      },
      unclaimedTeachers.length > 0 && {
        id: "teachers-pending",
        count: unclaimedTeachers.length,
        title: "Teacher pending",
        detail:
          unclaimedTeachers.length === 1
            ? `1 teacher has not claimed their account`
            : `${unclaimedTeachers.length} teachers have not claimed their accounts`,
        href: "/admin/users?role=teacher",
      },
      reviewLessons.length + draftLessons.length > 0 && {
        id: "content-review",
        count: reviewLessons.length + draftLessons.length,
        title: "AR practicals need review",
        detail: `${draftLessons.length} draft · ${reviewLessons.length} in review`,
        href: "/admin/registry?status=draft",
      },
    ].filter(Boolean) as Array<{
      id: string;
      count: number;
      title: string;
      detail: string;
      href: string;
    }>;

    const subjectRunsTop = [...subjectRuns.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([subject, value]) => ({ subject, value }));

    const bySubject = [...new Set(lessonRows.map((row) => row.subject))]
      .map((subject) => ({
        subject,
        count: publishedLessons.filter((row) => row.subject === subject).length,
      }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);

    const registeredSubjects = new Set<string>([
      ...lessonRows.map((row) => row.subject),
    ]);

    sendData(
      res,
      platformDashboardSchema.parse({
        periodDays: days,
        activityLabels: buckets.map((bucket) => bucket.label),
        activity: [
          {
            key: "learners",
            label: "Active learners",
            color: "#0EA5E9",
            values: buckets.map((bucket) => bucket.learners.size),
          },
          { key: "sessions", label: "Practice sessions", color: "#12A150", values: buckets.map((b) => b.sessions) },
          {
            key: "submissions",
            label: "Assignment submissions",
            color: "#2F7BF6",
            values: buckets.map((b) => b.submissions),
          },
          { key: "ar", label: "AR sessions", color: "#7C3AED", values: buckets.map((b) => b.ar) },
        ],
        trends: {
          schools: schoolTrend,
          students: studentTrend,
          teachers: teacherTrend,
          content: contentTrend,
        },
        schools: {
          total: schoolRows.length,
          active: schoolRows.filter((row) => row.status === "active").length,
          suspended: suspendedSchools.length,
          pending: schoolRows.filter((row) => row.status === "pending").length,
        },
        students,
        teachers,
        content: {
          total: lessonRows.length,
          published: publishedLessons.length,
          draft: draftLessons.length,
          needsReview: reviewLessons.length,
        },
        needsAttention,
        onboarding: [
          {
            key: "heads",
            label: "School Heads",
            activated: memberRows.filter((row) => row.role === "school_admin" && row.claimedAt !== null).length,
            total: memberRows.filter((row) => row.role === "school_admin").length,
            pending: memberRows.filter((row) => row.role === "school_admin" && row.claimedAt === null).length,
          },
          {
            key: "teachers",
            label: "Teachers",
            activated: teachers.total - teachers.pending,
            total: teachers.total,
            pending: teachers.pending,
          },
          {
            key: "students",
            label: "Students",
            activated: students.total - students.pending,
            total: students.total,
            pending: students.pending,
          },
        ],
        bySubject,
        academic: {
          classes: classRows.length,
          subjects: registeredSubjects.size,
          formsCovered: formSpan([...new Set(classRows.map((row) => row.gradeLevel))]),
          topSubjects: subjectRunsTop,
        },
      })
    );
  })
);


const ACTION_LABELS: Record<string, string> = {
  "account.email_change": "Changed email",
  "account.password_change": "Changed password",
  "account.sessions_revoked": "Revoked sessions",
  "ar_activity.upload": "Uploaded AR activity",
  "ar_activity.import": "Imported AR activities",
  "ar_activity.delete": "Deleted AR activity",
  "assignment.create": "Set an assignment",
  "academic.class_subject": "Changed a class subject",
  "academic.subject.create": "Added a subject",
  "branding.reset": "Reset branding",
  "branding.update": "Updated branding",
  "class.create": "Created class",
  "credential.staff_password_reset": "Reset staff password",
  "credential.student_pin_reset": "Reset learner PIN",
  "credential.student_pin_set": "Set learner PIN",
  "district.create": "Created district",
  "enrollment.create": "Enrolled student",
  "enrollment.update": "Updated enrollment",
  "membership.invite": "Invited member",
  "membership.invite_resent": "Resent invitation",
  "membership.update": "Updated member",
  "outbox.flush": "Flushed notification outbox",
  "region.create": "Created region",
  "roster.import": "Imported users (batch)",
  "school.academic_year": "Moved academic year",
  "school.create": "Created school",
  "school.head_handover": "Handed over school head",
  "school.settings": "Updated school settings",
  "school.status": "Changed school status",
  "teacher.assign": "Gave a teacher a subject",
  "teacher.unassign": "Removed teacher",
};

function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const [, verb] = action.split(".");
  const word = (verb ?? action).replace(/_/g, " ");
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function logDetail(row: {
  entity: string;
  metadata: Record<string, unknown> | null;
  schoolName: string | null;
}): string {
  const metadata = row.metadata ?? {};
  const preferred = [
    "title",
    "lessonTitle",
    "assignmentTitle",
    "materialTitle",
    "studentName",
    "fullName",
    "name",
    "className",
    "label",
    "email",
    "code",
    "status",
  ];
  for (const key of preferred) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number") return String(value);
  }
  const students = metadata.students;
  if (typeof students === "number" && students > 0) {
    const teachers = typeof metadata.teachers === "number" ? metadata.teachers : 0;
    return `${students} students, ${teachers} teachers`;
  }
  if (row.schoolName) return row.schoolName;
  return row.entity.replace(/_/g, " ");
}

consoleRouter.get(
  "/platform/console/logs",
  requireRole("platform_admin"),
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(5, Number.parseInt(String(req.query.pageSize ?? "8"), 10) || 8));
    const action = typeof req.query.action === "string" && req.query.action !== "all" ? req.query.action : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const from = typeof req.query.from === "string" && req.query.from ? new Date(req.query.from) : undefined;
    const to = typeof req.query.to === "string" && req.query.to ? new Date(req.query.to) : undefined;

    const conditions: SQL[] = [
      ...(action ? [eq(auditEvents.action, action)] : []),
      ...(from ? [gte(auditEvents.createdAt, from)] : []),
      ...(to ? [lte(auditEvents.createdAt, to)] : []),
      ...(q
        ? [
            or(
              sql`${users.firstName} like ${`%${q}%`}`,
              sql`${users.lastName} like ${`%${q}%`}`,
              sql`${schools.name} like ${`%${q}%`}`,
              sql`${auditEvents.action} like ${`%${q}%`}`,
              sql`${auditEvents.entity} like ${`%${q}%`}`
            )!,
          ]
        : []),
    ];
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        entity: auditEvents.entity,
        metadata: auditEvents.metadata,
        ip: auditEvents.ip,
        createdAt: auditEvents.createdAt,
        actorName: sql<string | null>`concat(${users.firstName}, ' ', ${users.lastName})`,
        actorRole: sql<string | null>`(
          select m.role from ${memberships} m
          where m.user_id = ${auditEvents.actorId}
          order by case m.role
            when 'platform_admin' then 1
            when 'school_admin' then 2
            when 'academic_master' then 3
            when 'secretary' then 4
            when 'teacher' then 5
            else 6
          end
          limit 1
        )`,
        schoolName: schools.name,
      })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.actorId, users.id))
      .leftJoin(schools, eq(auditEvents.schoolId, schools.id))
      .where(where)
      .orderBy(desc(auditEvents.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [totals] = await db
      .select({ value: sql<number>`count(*)` })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.actorId, users.id))
      .leftJoin(schools, eq(auditEvents.schoolId, schools.id))
      .where(where);

    const actionRows = await db
      .select({ key: auditEvents.action, total: sql<number>`count(*)` })
      .from(auditEvents)
      .groupBy(auditEvents.action)
      .orderBy(desc(sql`count(*)`));

    sendData(
      res,
      platformLogPageSchema.parse({
        rows: rows.map((row) => ({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          actorName: row.actorName?.trim() ? row.actorName : null,
          actorRole: row.actorRole ?? null,
          action: row.action,
          actionLabel: actionLabel(row.action),
          detail: logDetail({ entity: row.entity, metadata: row.metadata ?? null, schoolName: row.schoolName ?? null }),
          schoolName: row.schoolName ?? null,
          ip: row.ip ?? null,
        })),
        total: num(totals?.value),
        actions: actionRows.map((row) => ({ key: row.key, label: actionLabel(row.key) })),
      })
    );
  })
);

function schoolFromRequest(req: AuthedRequest): string {
  if (isPlatformStaff(req.auth!.role)) return req.params.schoolId || resolveSchoolId(req);
  return resolveSchoolId(req);
}

consoleRouter.get(
  "/schools/:schoolId/activity",
  requireSchoolManager(),
  asyncHandler(async (req: AuthedRequest, res) => {
    const schoolId = schoolFromRequest(req);
    const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
    const pageSize = Math.min(100, Math.max(5, Number.parseInt(String(req.query.pageSize ?? "10"), 10) || 10));
    const action = typeof req.query.action === "string" && req.query.action !== "all" ? req.query.action : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const from = typeof req.query.from === "string" && req.query.from ? new Date(req.query.from) : undefined;

    const where = and(
      eq(auditEvents.schoolId, schoolId),
      ...(action ? [eq(auditEvents.action, action)] : []),
      ...(from ? [gte(auditEvents.createdAt, from)] : []),
      ...(q
        ? [
            or(
              sql`${users.firstName} like ${`%${q}%`}`,
              sql`${users.lastName} like ${`%${q}%`}`,
              sql`${auditEvents.action} like ${`%${q}%`}`,
              sql`${auditEvents.entity} like ${`%${q}%`}`
            )!,
          ]
        : [])
    );

    const rows = await db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        entity: auditEvents.entity,
        metadata: auditEvents.metadata,
        createdAt: auditEvents.createdAt,
        actorName: sql<string | null>`concat(${users.firstName}, ' ', ${users.lastName})`,
        actorRole: sql<string | null>`(
          select m.role from ${memberships} m
          where m.user_id = ${auditEvents.actorId}
          order by case m.role
            when 'platform_admin' then 1
            when 'school_admin' then 2
            when 'academic_master' then 3
            when 'secretary' then 4
            when 'teacher' then 5
            else 6
          end
          limit 1
        )`,
      })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.actorId, users.id))
      .where(where)
      .orderBy(desc(auditEvents.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [totals] = await db
      .select({ value: sql<number>`count(*)` })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.actorId, users.id))
      .where(where);

    const actionRows = await db
      .select({ key: auditEvents.action, total: sql<number>`count(*)` })
      .from(auditEvents)
      .where(eq(auditEvents.schoolId, schoolId))
      .groupBy(auditEvents.action)
      .orderBy(desc(sql`count(*)`));

    sendData(
      res,
      platformLogPageSchema.parse({
        rows: rows.map((row) => ({
          id: row.id,
          createdAt: row.createdAt.toISOString(),
          actorName: row.actorName?.trim() ? row.actorName : null,
          actorRole: row.actorRole ?? null,
          action: row.action,
          actionLabel: actionLabel(row.action),
          detail: logDetail({ entity: row.entity, metadata: row.metadata ?? null, schoolName: null }),
          schoolName: null,
          ip: null,
        })),
        total: num(totals?.value),
        actions: actionRows.map((row) => ({ key: row.key, label: actionLabel(row.key) })),
      })
    );
  })
);

consoleRouter.get(
  "/platform/console/academic",
  requireRole("platform_admin"),
  asyncHandler(async (_req, res) => {
    const [formRows, subjectRows, classRows, enrollmentRows, lessonRows] = await Promise.all([
      db
        .select({
          id: gradeLevels.id,
          name: gradeLevels.name,
          position: gradeLevels.position,
          status: gradeLevels.status,
        })
        .from(gradeLevels)
        .orderBy(asc(gradeLevels.position), asc(gradeLevels.name)),
      db.select({ id: subjects.id, name: subjects.name, code: subjects.code, status: subjects.status }).from(subjects).orderBy(asc(subjects.name)),
      db
        .select({
          id: classes.id,
          schoolId: classes.schoolId,
          gradeLevel: classes.gradeLevel,
          status: classes.status,
        })
        .from(classes),
      db
        .select({ classId: studentEnrollments.classId, studentId: studentEnrollments.studentId })
        .from(studentEnrollments)
        .where(eq(studentEnrollments.status, "active")),
      db.select({ subject: lessons.subject, gradeLevel: lessons.gradeLevel }).from(lessons),
    ]);

    const gradeOfClass = new Map(classRows.map((row) => [row.id, row.gradeLevel]));
    const studentsPerForm = new Map<string, Set<string>>();
    for (const row of enrollmentRows) {
      const form = gradeOfClass.get(row.classId);
      if (!form) continue;
      const seen = studentsPerForm.get(form) ?? new Set<string>();
      seen.add(row.studentId);
      studentsPerForm.set(form, seen);
    }

    const lessonsBySubject = new Map<string, (typeof lessonRows)[number][]>();
    for (const row of lessonRows) {
      const list = lessonsBySubject.get(row.subject) ?? [];
      list.push(row);
      lessonsBySubject.set(row.subject, list);
    }

    const lessonsByForm = new Map<string, number>();
    for (const row of lessonRows) {
      lessonsByForm.set(row.gradeLevel, (lessonsByForm.get(row.gradeLevel) ?? 0) + 1);
    }

    sendData(
      res,
      platformAcademicSchema.parse({
        classes: formRows.map((row) => ({
          id: row.id,
          name: row.name,
          position: row.position,
          status: row.status,
          lessonCount: lessonsByForm.get(row.name) ?? 0,
          studentCount: studentsPerForm.get(row.name)?.size ?? 0,
        })),
        subjects: subjectRows.map((row) => ({
          id: row.id,
          name: row.name,
          code: row.code ?? null,
          status: row.status,
          lessonCount: (lessonsBySubject.get(row.name) ?? []).length,
        })),
      })
    );
  })
);

consoleRouter.post(
  "/platform/console/academic/classes",
  requireRole("platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(createAcademicClassRequestSchema, req.body);

    const [clash] = await db.select({ id: gradeLevels.id }).from(gradeLevels).where(eq(gradeLevels.name, body.name)).limit(1);
    if (clash) throw HttpError.conflict(`${body.name} is already in the class register.`);

    const [tail] = await db.select({ highest: sql<number>`coalesce(max(${gradeLevels.position}), 0)` }).from(gradeLevels);

    const row = await insertReturning(gradeLevels, {
      name: body.name,
      position: body.position ?? num(tail?.highest) + 1,
    });

    await recordAudit({
      actorId: req.auth!.userId,
      action: "academic.class.create",
      entity: "grade_level",
      entityId: row.id,
      metadata: { name: row.name, position: row.position },
      ip: req.ip,
    });

    sendData(res, { id: row.id, name: row.name, position: row.position, status: row.status }, 201);
  })
);

consoleRouter.patch(
  "/platform/console/academic/classes/:id",
  requireRole("platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(updateAcademicRegisterEntryRequestSchema, req.body);

    const row = await updateReturning(
      gradeLevels,
      {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
      eq(gradeLevels.id, req.params.id)
    );
    if (!row) throw HttpError.notFound("No class with that id is in the register.");

    await recordAudit({
      actorId: req.auth!.userId,
      action: "academic.class.update",
      entity: "grade_level",
      entityId: row.id,
      metadata: { name: row.name, status: row.status },
      ip: req.ip,
    });

    sendData(res, { id: row.id, name: row.name, position: row.position, status: row.status });
  })
);

consoleRouter.post(
  "/platform/console/academic/subjects",
  requireRole("platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(createAcademicSubjectRequestSchema, req.body);

    const [clash] = await db.select({ id: subjects.id }).from(subjects).where(eq(subjects.name, body.name)).limit(1);
    if (clash) throw HttpError.conflict(`${body.name} is already in the subject register.`);

    const row = await insertReturning(subjects, { name: body.name, code: body.code ?? null });

    await recordAudit({
      actorId: req.auth!.userId,
      action: "academic.subject.create",
      entity: "subject",
      entityId: row.id,
      metadata: { name: row.name, code: row.code },
      ip: req.ip,
    });

    sendData(res, { id: row.id, name: row.name, code: row.code, status: row.status }, 201);
  })
);

consoleRouter.patch(
  "/platform/console/academic/subjects/:id",
  requireRole("platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(updateAcademicRegisterEntryRequestSchema, req.body);

    const row = await updateReturning(
      subjects,
      {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
      eq(subjects.id, req.params.id)
    );
    if (!row) throw HttpError.notFound("No subject with that id is in the register.");

    await recordAudit({
      actorId: req.auth!.userId,
      action: "academic.subject.update",
      entity: "subject",
      entityId: row.id,
      metadata: { name: row.name, status: row.status },
      ip: req.ip,
    });

    sendData(res, { id: row.id, name: row.name, code: row.code, status: row.status });
  })
);

consoleRouter.get(
  "/platform/console/schools",
  requireRole("platform_admin"),
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({
        id: schools.id,
        name: schools.name,
        code: schools.code,
        level: schools.level,
        status: schools.status,
        createdAt: schools.createdAt,
        regionName: regions.name,
        districtName: districts.name,
        studentCount: sql<number>`(
          select count(distinct ${studentEnrollments.studentId}) from ${studentEnrollments}
          where ${studentEnrollments.schoolId} = ${schools.id} and ${studentEnrollments.status} = 'active'
        )`,
        teacherCount: sql<number>`(
          select count(*) from ${memberships}
          where ${memberships.schoolId} = ${schools.id} and ${memberships.role} = 'teacher' and ${memberships.status} = 'active'
        )`,
        classCount: sql<number>`(
          select count(*) from ${classes}
          where ${classes.schoolId} = ${schools.id} and ${classes.status} = 'active'
        )`,
        headName: sql<string | null>`(
          select concat(u.first_name, ' ', u.last_name) from ${memberships} m
          join ${users} u on u.id = m.user_id
          where m.school_id = ${schools.id} and m.role = 'school_admin' and m.status = 'active'
          limit 1
        )`,
        headEmail: sql<string | null>`(
          select u.email from ${memberships} m
          join ${users} u on u.id = m.user_id
          where m.school_id = ${schools.id} and m.role = 'school_admin' and m.status = 'active'
          limit 1
        )`,
        lastLoginAt: sql<Date | null>`(
          select max(u.last_login_at) from ${memberships} m
          join ${users} u on u.id = m.user_id
          where m.school_id = ${schools.id}
        )`,
        lastSessionAt: sql<Date | null>`(
          select max(r.played_at) from ${arActivityRuns} r
          where r.school_id = ${schools.id}
        )`,
      })
      .from(schools)
      .innerJoin(districts, eq(schools.districtId, districts.id))
      .innerJoin(regions, eq(districts.regionId, regions.id))
      .orderBy(asc(schools.name));

    const list = rows.map((row) => {
      const candidates = [row.lastLoginAt, row.lastSessionAt].filter(Boolean) as Date[];
      const latest = candidates.length
        ? new Date(Math.max(...candidates.map((value) => new Date(value).getTime())))
        : null;
      return {
        id: row.id,
        name: row.name,
        code: row.code,
        regionName: row.regionName,
        districtName: row.districtName,
        level: row.level,
        status: row.status,
        headName: row.headName ?? null,
        headEmail: row.headEmail ?? null,
        studentCount: num(row.studentCount),
        teacherCount: num(row.teacherCount),
        classCount: num(row.classCount),
        lastActivityAt: latest ? latest.toISOString() : null,
        createdAt: row.createdAt,
      };
    });

    const auditRows = await db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        metadata: auditEvents.metadata,
        createdAt: auditEvents.createdAt,
        schoolName: schools.name,
      })
      .from(auditEvents)
      .leftJoin(schools, eq(auditEvents.schoolId, schools.id))
      .where(
        or(
          sql`${auditEvents.action} like 'school.%'`,
          sql`${auditEvents.action} like 'class.%'`,
          sql`${auditEvents.action} like 'membership.%'`,
          sql`${auditEvents.action} like 'enrollment.%'`,
          sql`${auditEvents.action} like 'credential.%'`
        )
      )
      .orderBy(desc(auditEvents.createdAt))
      .limit(6);

    sendData(
      res,
      platformSchoolListSchema.parse({
        rows: list.map(({ createdAt: _createdAt, ...rest }) => rest),
        total: list.length,
        active: list.filter((row) => row.status === "active").length,
        inactive: list.filter((row) => row.status === "suspended").length,
        pendingSetup: list.filter((row) => row.status === "pending").length,
        recent: auditRows.map((row) => ({
          id: row.id,
          title: actionLabel(row.action),
          detail: logDetail({ entity: "school", metadata: row.metadata ?? null, schoolName: row.schoolName ?? null }),
          at: row.createdAt.toISOString(),
        })),
      })
    );
  })
);

consoleRouter.get(
  "/platform/console/schools/:schoolId",
  requireRole("platform_admin"),
  asyncHandler(async (req, res) => {
    const schoolId = req.params.schoolId;

    const [detail] = await db
      .select({
        id: schools.id,
        name: schools.name,
        code: schools.code,
        level: schools.level,
        status: schools.status,
        regionName: regions.name,
        districtName: districts.name,
        headName: sql<string | null>`(
          select concat(u.first_name, ' ', u.last_name) from ${memberships} m
          join ${users} u on u.id = m.user_id
          where m.school_id = ${schools.id} and m.role = 'school_admin' and m.status = 'active'
          limit 1
        )`,
        headEmail: sql<string | null>`(
          select u.email from ${memberships} m
          join ${users} u on u.id = m.user_id
          where m.school_id = ${schools.id} and m.role = 'school_admin' and m.status = 'active'
          limit 1
        )`,
      })
      .from(schools)
      .innerJoin(districts, eq(schools.districtId, districts.id))
      .innerJoin(regions, eq(districts.regionId, regions.id))
      .where(eq(schools.id, schoolId))
      .limit(1);

    if (!detail) throw HttpError.notFound("School not found");

    const [classRows, memberRows, auditRows, sessionRows, contentRows] = await Promise.all([
      db
        .select({
          id: classes.id,
          schoolId: classes.schoolId,
          schoolName: schools.name,
          name: classes.name,
          gradeLevel: classes.gradeLevel,
          stream: classes.stream,
          subjectCount: sql<number>`(select count(*) from class_subjects cs where cs.class_id = ${classes.id})`,
          academicYear: classes.academicYear,
          status: classes.status,
          studentCount: sql<number>`(
            select count(*) from ${studentEnrollments}
            where ${studentEnrollments.classId} = ${classes.id}
              and ${studentEnrollments.status} = 'active'
          )`,
        })
        .from(classes)
        .innerJoin(schools, eq(classes.schoolId, schools.id))
        .where(eq(classes.schoolId, schoolId))
        .orderBy(asc(classes.gradeLevel), asc(classes.name)),
      db
        .select({
          membershipId: memberships.id,
          userId: users.id,
          fullName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
          email: users.email,
          role: memberships.role,
          status: memberships.status,
          lastLoginAt: users.lastLoginAt,
          claimedAt: users.claimedAt,
        })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(eq(memberships.schoolId, schoolId))
        .orderBy(asc(users.lastName), asc(users.firstName)),
      db
        .select({
          id: auditEvents.id,
          action: auditEvents.action,
          metadata: auditEvents.metadata,
          createdAt: auditEvents.createdAt,
        })
        .from(auditEvents)
        .where(eq(auditEvents.schoolId, schoolId))
        .orderBy(desc(auditEvents.createdAt))
        .limit(6),
      db
        .select({ startedAt: arActivityRuns.playedAt, studentId: arActivityRuns.userId })
        .from(arActivityRuns)
        .where(eq(arActivityRuns.schoolId, schoolId))
        .orderBy(desc(arActivityRuns.playedAt))
        .limit(5),
      db
        .select({
          lessonId: lessons.id,
          title: lessons.title,
          subject: lessons.subject,
          gradeLevel: lessons.gradeLevel,
          runs: sql<number>`count(*)`,
          students: sql<number>`count(distinct ${arActivityRuns.userId})`,
          lastRunAt: sql<Date | null>`max(${arActivityRuns.playedAt})`,
        })
        .from(arActivityRuns)
        .innerJoin(lessons, eq(lessons.modelKey, arActivityRuns.activityKey))
        .where(eq(arActivityRuns.schoolId, schoolId))
        .groupBy(lessons.id, lessons.title, lessons.subject, lessons.gradeLevel)
        .orderBy(desc(sql`count(*)`)),
    ]);

    const teacherNames = classRows.length
      ? await db
          .select({
            classId: teacherAssignments.classId,
            teacherName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
          })
          .from(teacherAssignments)
          .innerJoin(users, eq(teacherAssignments.teacherId, users.id))
          .where(inArray(teacherAssignments.classId, classRows.map((row) => row.id)))
      : [];

    const teachersByClass = new Map<string, string[]>();
    for (const row of teacherNames) {
      const list = teachersByClass.get(row.classId) ?? [];
      list.push(row.teacherName);
      teachersByClass.set(row.classId, list);
    }

    const lastLogin = memberRows
      .map((row) => row.lastLoginAt)
      .filter(Boolean)
      .map((value) => new Date(value as Date).getTime());
    const lastSession = sessionRows.length ? new Date(sessionRows[0].startedAt).getTime() : null;
    const stamps = [...lastLogin, ...(lastSession ? [lastSession] : [])];
    const latest = stamps.length ? new Date(Math.max(...stamps)) : null;

    sendData(
      res,
      platformSchoolDetailSchema.parse({
        school: {
          id: detail.id,
          name: detail.name,
          code: detail.code,
          regionName: detail.regionName,
          districtName: detail.districtName,
          level: detail.level,
          status: detail.status,
          headName: detail.headName ?? null,
          headEmail: detail.headEmail ?? null,
          studentCount: memberRows.filter((row) => row.role === "student" && row.status === "active").length,
          teacherCount: memberRows.filter((row) => row.role === "teacher" && row.status === "active").length,
          classCount: classRows.filter((row) => row.status === "active").length,
          lastActivityAt: latest ? latest.toISOString() : null,
        },
        classes: classRows.map((row) => ({
          ...row,
          stream: row.stream ?? null,
          subjectCount: num(row.subjectCount),
          studentCount: num(row.studentCount),
          teacherNames: teachersByClass.get(row.id) ?? [],
        })),
        content: contentRows.map((row) => ({
          lessonId: row.lessonId,
          title: row.title,
          subject: row.subject,
          gradeLevel: row.gradeLevel,
          runs: num(row.runs),
          students: num(row.students),
          lastRunAt: row.lastRunAt ? new Date(row.lastRunAt).toISOString() : null,
        })),
        members: memberRows.map((row) => ({
          membershipId: row.membershipId,
          userId: row.userId,
          fullName: row.fullName,
          email: row.email,
          role: row.role,
          status: row.status,
          lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
          claimedAt: row.claimedAt ? row.claimedAt.toISOString() : null,
        })),
        recent: [
          ...auditRows.map((row) => ({
            id: row.id,
            title: actionLabel(row.action),
            detail: logDetail({ entity: "school", metadata: row.metadata ?? null, schoolName: detail.name }),
            at: row.createdAt.toISOString(),
          })),
          ...sessionRows.map((row) => ({
            id: `session-${row.studentId}-${new Date(row.startedAt).getTime()}`,
            title: "AR content accessed",
            detail: "A learner opened a practical",
            at: new Date(row.startedAt).toISOString(),
          })),
        ]
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          .slice(0, 6),
      })
    );
  })
);

consoleRouter.get(
  "/platform/console/users",
  requireRole("platform_admin"),
  asyncHandler(async (req, res) => {
    const role = typeof req.query.role === "string" && req.query.role !== "all" ? req.query.role : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const base = [
      ...(q
        ? [
            or(
              sql`${users.firstName} like ${`%${q}%`}`,
              sql`${users.lastName} like ${`%${q}%`}`,
              sql`${users.email} like ${`%${q}%`}`,
              sql`${schools.name} like ${`%${q}%`}`
            )!,
          ]
        : []),
    ];

    const rows = await db
      .select({
        membershipId: memberships.id,
        userId: users.id,
        fullName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        email: users.email,
        role: memberships.role,
        status: memberships.status,
        schoolId: memberships.schoolId,
        schoolName: schools.name,
        className: sql<string | null>`(
          select c.name from ${studentEnrollments} e
          join ${classes} c on c.id = e.class_id
          where e.student_id = ${users.id} and e.status = 'active'
          limit 1
        )`,
        admissionNumber: sql<string | null>`(
          select e.student_identifier from ${studentEnrollments} e
          where e.student_id = ${users.id} and e.status = 'active'
          limit 1
        )`,
        lastLoginAt: users.lastLoginAt,
        awaitingRegistration: sql<number>`(${users.claimedAt} is null)`,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .leftJoin(schools, eq(memberships.schoolId, schools.id))
      .where(base.length ? and(...base) : undefined)
      .orderBy(desc(users.lastLoginAt), asc(users.lastName));

    const counts = await db
      .select({ role: memberships.role, total: sql<number>`count(*)` })
      .from(memberships)
      .groupBy(memberships.role);

    const countOf = (value: string) => num(counts.find((row) => row.role === value)?.total);

    sendData(
      res,
      platformUserListSchema.parse({
        rows: rows
          .filter((row) => !role || row.role === role)
          .map((row) => ({
            membershipId: row.membershipId,
            userId: row.userId,
            fullName: row.fullName,
            email: row.email,
            role: row.role,
            status: row.status,
            schoolId: row.schoolId ?? null,
            schoolName: row.schoolName ?? null,
            className: row.className ?? null,
            admissionNumber: row.admissionNumber ?? null,
            lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
            awaitingRegistration: Boolean(num(row.awaitingRegistration)),
          })),
        counts: {
          all: counts.reduce((sum, row) => sum + num(row.total), 0),
          schoolHead: countOf("school_admin"),
          teacher: countOf("teacher"),
          student: countOf("student"),
        },
      })
    );
  })
);
