import { Router } from "express";
import { and, asc, count, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  ERROR_CODES,
  createDistrictRequestSchema,
  createEnrollmentRequestSchema,
  promoteAcademicYearRequestSchema,
  createRegionRequestSchema,
  createSchoolRequestSchema,
  gradeLevelSchema,
  inviteMemberRequestSchema,
  roleSchema,
  rosterImportRequestSchema,
  schoolLevelSchema,
  updateSchoolSettingsRequestSchema,
  setStudentPinRequestSchema,
  updateEnrollmentRequestSchema,
  updateMemberRequestSchema,
  type ClassSummary,
} from "@elimuar/shared";
import {
  forgetAccess,
  isPlatformStaff,
  requireAuth,
  requireRole,
  type AuthedRequest,
} from "../middleware/auth.js";
import { db } from "../db/client.js";
import { insertReturning, newId, updateReturning } from "../db/helpers.js";
import {
  auditEvents,
  classSubjects,
  classes,
  districts,
  lessonAssignments,
  memberships,
  refreshTokens,
  regions,
  schools,
  studentEnrollments,
  studentSubjects,
  teacherAssignments,
  users,
} from "../db/schema.js";
import { requireForm } from "../lib/academic.js";
import { HttpError, asyncHandler, parse, sendData } from "../lib/http.js";
import { recordAudit } from "../lib/audit.js";
import { emailDeliverable, queueMembershipNotice, queueRegistrationInvite, queueSchoolStatusNotice } from "../lib/notify.js";
import { generateOtp, hashPassword, sha256 } from "../lib/password.js";
import { passwordResetCodes } from "../db/schema.js";
export const orgRouter = Router();
orgRouter.use(requireAuth);

const PORTAL_URL = process.env.PORTAL_URL ?? "http://localhost:3000";

function makeSetupToken(rowId: string, code: string): string {
  return `${rowId}.${code}.${sha256(`${rowId}:${code}`)}`;
}

interface SetupLink {
  url: string;
  token: string;
}

async function createSetupLink(userId: string): Promise<SetupLink | null> {
  if (!emailDeliverable()) return null;
  const code = generateOtp(6);
  const rowId = newId();
  await db.insert(passwordResetCodes).values({
    id: rowId,
    userId,
    codeHash: sha256(code),
    channel: "email",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  const token = makeSetupToken(rowId, code);
  return {
    token,
    url: `${PORTAL_URL}/set-password?token=${encodeURIComponent(token)}&mode=register`,
  };
}

const FORMS = ["Form 1", "Form 2", "Form 3", "Form 4"] as const;

orgRouter.get(
  "/geo/regions",
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(regions).orderBy(asc(regions.name));
    sendData(res, rows.map((r) => ({ id: r.id, name: r.name, code: r.code })));
  })
);

orgRouter.get(
  "/geo/regions/:regionId/districts",
  asyncHandler(async (req, res) => {
    const rows = await db
      .select()
      .from(districts)
      .where(eq(districts.regionId, req.params.regionId))
      .orderBy(asc(districts.name));
    sendData(res, rows.map((d) => ({ id: d.id, regionId: d.regionId, name: d.name })));
  })
);

orgRouter.post(
  "/platform/geo/regions",
  requireRole("platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(createRegionRequestSchema, req.body);
    const existing = await db
      .select({ id: regions.id })
      .from(regions)
      .where(eq(sql`lower(${regions.name})`, body.name.toLowerCase()))
      .limit(1);
    if (existing.length > 0) throw new HttpError(409, ERROR_CODES.CONFLICT, `${body.name} is already in the register.`);

    const created = await insertReturning(regions, body);
    await recordAudit({
      actorId: req.auth!.userId,
      action: "region.create",
      entity: "region",
      entityId: created.id,
      metadata: { name: created.name, code: created.code },
      ip: req.ip ?? null,
    });
    sendData(res, { id: created.id, name: created.name, code: created.code }, 201);
  })
);

orgRouter.post(
  "/platform/geo/districts",
  requireRole("platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(createDistrictRequestSchema, req.body);
    const [region] = await db.select().from(regions).where(eq(regions.id, body.regionId)).limit(1);
    if (!region) throw HttpError.notFound("Region not found");

    const existing = await db
      .select({ id: districts.id })
      .from(districts)
      .where(and(eq(districts.regionId, body.regionId), eq(sql`lower(${districts.name})`, body.name.toLowerCase())))
      .limit(1);
    if (existing.length > 0) {
      throw new HttpError(409, ERROR_CODES.CONFLICT, `${body.name} is already a district of ${region.name}.`);
    }

    const created = await insertReturning(districts, body);
    await recordAudit({
      actorId: req.auth!.userId,
      action: "district.create",
      entity: "district",
      entityId: created.id,
      metadata: { name: created.name, region: region.name },
      ip: req.ip ?? null,
    });
    sendData(res, { id: created.id, regionId: created.regionId, name: created.name }, 201);
  })
);

orgRouter.get(
  "/geo/districts/:districtId/schools",
  asyncHandler(async (req, res) => {
    const rows = await db
      .select({ id: schools.id, name: schools.name, code: schools.code, level: schools.level, status: schools.status })
      .from(schools)
      .where(eq(schools.districtId, req.params.districtId))
      .orderBy(asc(schools.name));
    sendData(res, rows);
  })
);

orgRouter.get(
  "/schools",
  requireRole("platform_admin"),
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({
        id: schools.id,
        name: schools.name,
        code: schools.code,
        level: schools.level,
        status: schools.status,
        districtId: schools.districtId,
        districtName: districts.name,
        regionName: regions.name,
        createdAt: schools.createdAt,
        studentCount: sql<number>`(
          select count(*) from ${studentEnrollments}
          where ${studentEnrollments.schoolId} = ${schools.id} and ${studentEnrollments.status} = 'active'
        )`,
        headName: sql<string | null>`(
          select concat(u.first_name, ' ', u.last_name) from ${memberships} m
          join ${users} u on u.id = m.user_id
          where m.school_id = ${schools.id} and m.role = 'school_admin' and m.status = 'active'
          limit 1
        )`,
      })
      .from(schools)
      .innerJoin(districts, eq(schools.districtId, districts.id))
      .innerJoin(regions, eq(districts.regionId, regions.id))
      .orderBy(asc(schools.name));

    sendData(
      res,
      rows.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        districtId: s.districtId,
        districtName: s.districtName,
        regionName: s.regionName,
        level: s.level,
        status: s.status,
        headName: s.headName ?? null,
        studentCount: Number(s.studentCount ?? 0),
        createdAt: s.createdAt.toISOString(),
      }))
    );
  })
);

orgRouter.get(
  "/schools/:schoolId",
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    if (!isPlatformStaff(auth.role) && auth.schoolId !== req.params.schoolId) throw HttpError.forbidden();

    const [school] = await db
      .select({
        id: schools.id,
        name: schools.name,
        code: schools.code,
        level: schools.level,
        status: schools.status,
        districtName: districts.name,
        regionName: regions.name,
      })
      .from(schools)
      .innerJoin(districts, eq(schools.districtId, districts.id))
      .innerJoin(regions, eq(districts.regionId, regions.id))
      .where(eq(schools.id, req.params.schoolId))
      .limit(1);

    if (!school) throw HttpError.notFound("School not found");
    sendData(res, school);
  })
);

orgRouter.post(
  "/schools",
  requireRole("platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(createSchoolRequestSchema, req.body);

    const existing = await db
      .select({ name: schools.name, level: schools.level })
      .from(schools)
      .where(eq(sql`lower(${schools.code})`, body.code.toLowerCase()))
      .limit(1);
    if (existing.length > 0) {
      throw new HttpError(
        409,
        ERROR_CODES.CONFLICT,
        `Ministry code ${body.code} already belongs to "${existing[0].name}".`
      );
    }

    const created = await insertReturning(schools, { ...body, status: "active" });
    await recordAudit({
      actorId: req.auth!.userId,
      action: "school.create",
      entity: "school",
      entityId: created.id,
      schoolId: created.id,
      metadata: { code: created.code, name: created.name },
      ip: req.ip ?? null,
    });
    sendData(res, created, 201);
  })
);

orgRouter.post(
  "/platform/schools",
  requireRole("platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(180),
        code: z.string().trim().min(2).max(24),
        districtId: z.string().uuid(),
        level: schoolLevelSchema.default("secondary"),
        head: z
          .object({
            firstName: z.string().trim().min(2).max(60),
            lastName: z.string().trim().min(2).max(60),
            email: z
              .string()
              .trim()
              .email()
              .transform((value) => value.toLowerCase()),
            phone: z.string().trim().min(7).max(24).optional(),
          })
          .optional(),
      }),
      req.body
    );

    const [existing] = await db
      .select({ name: schools.name })
      .from(schools)
      .where(eq(sql`lower(${schools.code})`, body.code.toLowerCase()))
      .limit(1);
    if (existing) {
      throw new HttpError(
        409,
        ERROR_CODES.CONFLICT,
        `Ministry code ${body.code} already belongs to "${existing.name}".`
      );
    }

    const [district] = await db
      .select({ id: districts.id })
      .from(districts)
      .where(eq(districts.id, body.districtId))
      .limit(1);
    if (!district) throw HttpError.badRequest("Choose a district for this school.");

    const known = body.head ? await db.select().from(users).where(eq(users.email, body.head.email)).limit(1) : [];
    const [knownPerson] = known;
    if (knownPerson) {
      const [held] = await db
        .select({ schoolName: schools.name })
        .from(memberships)
        .innerJoin(schools, eq(memberships.schoolId, schools.id))
        .where(and(eq(memberships.userId, knownPerson.id), eq(memberships.status, "active")))
        .limit(1);
      if (held) {
        throw new HttpError(
          409,
          ERROR_CODES.CONFLICT,
          `${knownPerson.email} already holds an active membership at ${held.schoolName}. Hand that one over first.`
        );
      }
    }

    const created = await insertReturning(schools, {
      name: body.name,
      code: body.code,
      districtId: body.districtId,
      level: body.level,
      status: "active" as const,
    });

    await recordAudit({
      actorId: req.auth!.userId,
      action: "school.create",
      entity: "school",
      entityId: created.id,
      schoolId: created.id,
      metadata: { code: created.code, name: created.name, headEmail: body.head?.email ?? null },
      ip: req.ip ?? null,
    });

    let head: { membershipId: string; invited: boolean } | null = null;
    if (body.head) {
      const person =
        knownPerson ??
        (await insertReturning(users, {
          email: body.head.email,
          passwordHash: hashPassword(generateOtp(6)),
          firstName: body.head.firstName,
          lastName: body.head.lastName,
          phone: body.head.phone ?? null,
        }));

      const membership = await insertReturning(memberships, {
        userId: person.id,
        schoolId: created.id,
        role: "school_admin" as const,
        status: "active" as const,
      });

      const invited = !person.claimedAt;
      if (invited) {
        const setup = await createSetupLink(person.id);
        await queueRegistrationInvite({
          userId: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email,
          phone: person.phone,
          role: "school_admin",
          schoolId: created.id,
          schoolName: created.name,
          setupUrl: setup?.url ?? null,
          setupToken: setup?.token ?? null,
        });
      }

      await recordAudit({
        actorId: req.auth!.userId,
        action: "membership.invite",
        entity: "membership",
        entityId: membership.id,
        schoolId: created.id,
        metadata: { email: person.email, role: "school_admin", invited },
        ip: req.ip ?? null,
      });

      head = { membershipId: membership.id, invited };
    }

    sendData(res, { schoolId: created.id, code: created.code, head }, 201);
  })
);

orgRouter.patch(
  "/schools/:schoolId",
  requireRole("platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(z.object({ status: z.enum(["active", "suspended", "pending"]) }), req.body);
    const [previous] = await db
      .select({ status: schools.status })
      .from(schools)
      .where(eq(schools.id, req.params.schoolId))
      .limit(1);
    if (!previous) throw HttpError.notFound("School not found");

    const updated = await updateReturning(
      schools,
      { status: body.status, updatedAt: new Date() },
      eq(schools.id, req.params.schoolId)
    );
    if (!updated) throw HttpError.notFound("School not found");
    const previousStatus = previous.status;

    if (body.status !== "active") {
      const members = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(eq(memberships.schoolId, updated.id));
      const userIds = [...new Set(members.map((row) => row.userId))];
      if (userIds.length > 0) {
        await db.delete(refreshTokens).where(inArray(refreshTokens.userId, userIds));
        for (const id of userIds) forgetAccess(id);
      }
    }

    const [head] = await db
      .select({
        userId: users.id,
        firstName: users.firstName,
        email: users.email,
        phone: users.phone,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(
        and(
          eq(memberships.schoolId, updated.id),
          eq(memberships.role, "school_admin"),
          eq(memberships.status, "active")
        )
      )
      .limit(1);

    if (head) {
      await queueSchoolStatusNotice(
        { ...head, schoolId: updated.id, schoolName: updated.name },
        body.status
      );
    }

    await recordAudit({
      actorId: req.auth!.userId,
      action: "school.status",
      entity: "school",
      entityId: updated.id,
      schoolId: updated.id,
      metadata: { from: previousStatus, to: updated.status },
      ip: req.ip ?? null,
    });
    sendData(res, updated);
  })
);

async function schoolProfilePayload(schoolId: string) {
  const [row] = await db
    .select({
      id: schools.id,
      name: schools.name,
      code: schools.code,
      status: schools.status,
      districtName: districts.name,
      regionName: regions.name,
      masteryThresholdPercent: schools.masteryThresholdPercent,
      engagementWindowDays: schools.engagementWindowDays,
      defaultPin: schools.defaultPin,
      gradeBands: schools.gradeBands,
    })
    .from(schools)
    .innerJoin(districts, eq(schools.districtId, districts.id))
    .innerJoin(regions, eq(districts.regionId, regions.id))
    .where(eq(schools.id, schoolId))
    .limit(1);
  if (!row) throw HttpError.notFound("School not found");
  return row;
}

orgRouter.get(
  "/schools/:schoolId/settings",
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    if (!isPlatformStaff(auth.role) && auth.schoolId !== req.params.schoolId) throw HttpError.forbidden();
    sendData(res, await schoolProfilePayload(req.params.schoolId));
  })
);

orgRouter.patch(
  "/schools/:schoolId/settings",
  requireRole("school_admin", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    if (!isPlatformStaff(auth.role) && auth.schoolId !== req.params.schoolId) throw HttpError.forbidden();

    const body = parse(updateSchoolSettingsRequestSchema, req.body);
    await updateReturning(
      schools,
      {
        ...(body.masteryThresholdPercent !== undefined ? { masteryThresholdPercent: body.masteryThresholdPercent } : {}),
        ...(body.engagementWindowDays !== undefined ? { engagementWindowDays: body.engagementWindowDays } : {}),
        ...(body.defaultPin !== undefined ? { defaultPin: body.defaultPin } : {}),
        ...(body.gradeBands !== undefined ? { gradeBands: body.gradeBands } : {}),
        updatedAt: new Date(),
      },
      eq(schools.id, req.params.schoolId)
    );

    await recordAudit({
      actorId: auth.userId,
      action: "school.settings",
      entity: "school",
      entityId: req.params.schoolId,
      schoolId: req.params.schoolId,
      metadata: {
        ...(body.masteryThresholdPercent !== undefined ? { masteryMark: body.masteryThresholdPercent } : {}),
        ...(body.engagementWindowDays !== undefined ? { engagementWindowDays: body.engagementWindowDays } : {}),
        ...(body.defaultPin !== undefined ? { defaultPinSet: true } : {}),
        ...(body.gradeBands !== undefined ? { gradeBandsSet: true } : {}),
      },
      ip: req.ip ?? null,
    });

    sendData(res, await schoolProfilePayload(req.params.schoolId));
  })
);

async function classSummaries(schoolId: string, onlyIds?: string[]): Promise<ClassSummary[]> {
  const rows = await db
    .select({
      id: classes.id,
      schoolId: classes.schoolId,
      name: classes.name,
      gradeLevel: classes.gradeLevel,
      stream: classes.stream,
      academicYear: classes.academicYear,
      status: classes.status,
    })
    .from(classes)
    .where(onlyIds ? and(eq(classes.schoolId, schoolId), inArray(classes.id, onlyIds)) : eq(classes.schoolId, schoolId))
    .orderBy(asc(classes.gradeLevel), asc(classes.name));

  const ids = rows.map((c) => c.id);
  if (ids.length === 0) return [];

  const [enrollmentCounts, assignmentCounts, teacherRows, subjectCounts] = await Promise.all([
    db
      .select({ classId: studentEnrollments.classId, total: count() })
      .from(studentEnrollments)
      .where(and(inArray(studentEnrollments.classId, ids), eq(studentEnrollments.status, "active")))
      .groupBy(studentEnrollments.classId),
    db
      .select({ classId: lessonAssignments.classId, total: count() })
      .from(lessonAssignments)
      .where(inArray(lessonAssignments.classId, ids))
      .groupBy(lessonAssignments.classId),
    db
      .select({
        classId: teacherAssignments.classId,
        teacherName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
      })
      .from(teacherAssignments)
      .innerJoin(users, eq(teacherAssignments.teacherId, users.id))
      .where(inArray(teacherAssignments.classId, ids)),
    db
      .select({ classId: classSubjects.classId, total: count() })
      .from(classSubjects)
      .where(inArray(classSubjects.classId, ids))
      .groupBy(classSubjects.classId),
  ]);

  const subjectsByClass = new Map(subjectCounts.map((row) => [row.classId, Number(row.total)]));
  const studentsByClass = new Map(enrollmentCounts.map((row) => [row.classId, Number(row.total)]));
  const assignmentsByClass = new Map(assignmentCounts.map((row) => [row.classId, Number(row.total)]));
  const teachersByClass = new Map<string, string[]>();
  for (const row of teacherRows) {
    teachersByClass.set(row.classId, [...(teachersByClass.get(row.classId) ?? []), row.teacherName]);
  }

  return rows.map((c) => ({
    ...c,
    studentCount: studentsByClass.get(c.id) ?? 0,
    subjectCount: subjectsByClass.get(c.id) ?? 0,
    assignedLessons: assignmentsByClass.get(c.id) ?? 0,
    teacherNames: [...new Set(teachersByClass.get(c.id) ?? [])].sort(),
  }));
}

orgRouter.get(
  "/schools/:schoolId/classes",
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    if (!isPlatformStaff(auth.role) && auth.schoolId !== req.params.schoolId) throw HttpError.forbidden();

    if (auth.role === "teacher") {
      const mine = await db
        .select({ classId: teacherAssignments.classId })
        .from(teacherAssignments)
        .where(eq(teacherAssignments.teacherId, auth.userId));
      const ids = mine.map((m) => m.classId);
      if (ids.length === 0) {
        sendData(res, []);
        return;
      }
      sendData(res, await classSummaries(req.params.schoolId, ids));
      return;
    }

    sendData(res, await classSummaries(req.params.schoolId));
  })
);

orgRouter.post(
  "/schools/:schoolId/classes",
  requireRole("school_admin", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(120),
        gradeLevel: gradeLevelSchema,
        stream: z.string().trim().max(12).nullable().optional(),
        academicYear: z.string().trim().min(4).max(9),
      }),
      req.body
    );
    const created = await insertReturning(classes, {
      ...body,
      gradeLevel: await requireForm(body.gradeLevel),
      schoolId: req.params.schoolId,
    });

    // A new class studies every subject the school already teaches to whole
    // classes; optional subjects and teachers are then set in Classes & Subjects.
    const taught = await db
      .selectDistinct({ subject: classSubjects.subject })
      .from(classSubjects)
      .where(and(eq(classSubjects.schoolId, created.schoolId), eq(classSubjects.allStudents, true)));
    if (taught.length > 0) {
      await db.insert(classSubjects).values(
        taught.map((t) => ({ id: newId(), schoolId: created.schoolId, classId: created.id, subject: t.subject, allStudents: true }))
      );
    }

    await recordAudit({
      actorId: req.auth!.userId,
      action: "class.create",
      entity: "class",
      entityId: created.id,
      schoolId: created.schoolId,
      metadata: { name: created.name, gradeLevel: created.gradeLevel },
      ip: req.ip ?? null,
    });
    sendData(res, created, 201);
  })
);

orgRouter.get(
  "/classes/:classId/students",
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    const [target] = await db
      .select({ schoolId: classes.schoolId })
      .from(classes)
      .where(eq(classes.id, req.params.classId))
      .limit(1);
    if (!target) throw HttpError.notFound("Class not found");

    if (auth.role === "teacher") {
      const [assigned] = await db
        .select({ id: teacherAssignments.id })
        .from(teacherAssignments)
        .where(and(eq(teacherAssignments.teacherId, auth.userId), eq(teacherAssignments.classId, req.params.classId)))
        .limit(1);
      if (!assigned) throw HttpError.forbidden("That stream is not assigned to you");
    } else if (!isPlatformStaff(auth.role) && auth.schoolId !== target.schoolId) {
      throw HttpError.forbidden();
    }

    const rows = await db
      .select({
        enrollmentId: studentEnrollments.id,
        studentId: users.id,
        fullName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        studentIdentifier: studentEnrollments.studentIdentifier,
        classId: studentEnrollments.classId,
        className: classes.name,
        gradeLevel: classes.gradeLevel,
        status: studentEnrollments.status,
        enrolledAt: studentEnrollments.enrolledAt,
      })
      .from(studentEnrollments)
      .innerJoin(users, eq(studentEnrollments.studentId, users.id))
      .innerJoin(classes, eq(studentEnrollments.classId, classes.id))
      .where(eq(studentEnrollments.classId, req.params.classId))
      .orderBy(asc(users.lastName), asc(users.firstName));

    sendData(
      res,
      rows.map((r) => ({ ...r, enrolledAt: r.enrolledAt.toISOString() }))
    );
  })
);

const learnerRowSelect = {
  enrollmentId: studentEnrollments.id,
  studentId: studentEnrollments.studentId,
  fullName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
  studentIdentifier: studentEnrollments.studentIdentifier,
  classId: classes.id,
  className: classes.name,
  gradeLevel: classes.gradeLevel,
  stream: classes.stream,
  status: studentEnrollments.status,
  enrolledAt: studentEnrollments.enrolledAt,
};

type LearnerRow = {
  enrollmentId: string;
  studentId: string;
  fullName: string;
  studentIdentifier: string | null;
  classId: string;
  className: string;
  gradeLevel: string;
  stream: string | null;
  status: string;
  enrolledAt: Date;
};

/** One row per learner (their current class), with the subjects they take: every subject their class takes as
   a whole, plus the optional ones they were chosen for. */
async function foldLearners(rows: LearnerRow[]) {
  const learners = new Map<string, LearnerRow>();
  for (const row of rows) {
    const seen = learners.get(row.studentId);
    if (!seen || (seen.status !== "active" && row.status === "active")) learners.set(row.studentId, row);
  }
  const classIds = [...new Set([...learners.values()].map((l) => l.classId))];
  const [taught, chosen] = classIds.length
    ? await Promise.all([
        db
          .select({ id: classSubjects.id, classId: classSubjects.classId, subject: classSubjects.subject, all: classSubjects.allStudents })
          .from(classSubjects)
          .where(inArray(classSubjects.classId, classIds)),
        db
          .select({ classSubjectId: studentSubjects.classSubjectId, studentId: studentSubjects.studentId })
          .from(studentSubjects)
          .innerJoin(classSubjects, eq(studentSubjects.classSubjectId, classSubjects.id))
          .where(inArray(classSubjects.classId, classIds)),
      ])
    : [[], []];
  return [...learners.values()].map((row) => {
    const subjectsTaken = taught
      .filter((t) => t.classId === row.classId && (t.all || chosen.some((c) => c.classSubjectId === t.id && c.studentId === row.studentId)))
      .map((t) => t.subject)
      .sort();
    return { ...row, subjectCount: subjectsTaken.length, subjects: subjectsTaken, enrolledAt: row.enrolledAt.toISOString() };
  });
}

orgRouter.get(
  "/schools/:schoolId/students",
  requireRole("school_admin", "academic_master", "secretary", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    if (!isPlatformStaff(auth.role) && auth.schoolId !== req.params.schoolId) throw HttpError.forbidden();

    const rows = await db
      .select(learnerRowSelect)
      .from(studentEnrollments)
      .innerJoin(users, eq(studentEnrollments.studentId, users.id))
      .innerJoin(classes, eq(studentEnrollments.classId, classes.id))
      .where(and(eq(studentEnrollments.schoolId, req.params.schoolId), ne(studentEnrollments.status, "removed")))
      .orderBy(asc(classes.gradeLevel), asc(users.lastName), asc(users.firstName));

    sendData(res, await foldLearners(rows as LearnerRow[]));
  })
);

async function classesForForm(schoolId: string, gradeLevel: string) {
  return db
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.schoolId, schoolId), eq(classes.gradeLevel, gradeLevel), eq(classes.status, "active")));
}

async function enrolLearner(input: {
  schoolId: string;
  gradeLevel: string;
  fullName: string;
  studentIdentifier: string;
  guardianPhone?: string | null;
}): Promise<{ ok: true; enrollmentId: string } | { ok: false; message: string }> {
  const identifier = input.studentIdentifier.trim();

  const formClasses = await classesForForm(input.schoolId, input.gradeLevel);
  if (formClasses.length === 0) {
    return { ok: false, message: `${input.gradeLevel} has no class yet — open one under Classes & Subjects` };
  }

  const [duplicate] = await db
    .select({ id: studentEnrollments.id })
    .from(studentEnrollments)
    .where(
      and(eq(studentEnrollments.schoolId, input.schoolId), eq(studentEnrollments.studentIdentifier, identifier))
    )
    .limit(1);
  if (duplicate) return { ok: false, message: `${identifier} is already enrolled` };

  const [firstName, ...rest] = input.fullName.trim().split(/\s+/);
  const lastName = rest.join(" ") || "—";
  // Learners sign in with their admission number; this address is internal only.
  const email = `${identifier.replace(/[^a-z0-9]/gi, "-").toLowerCase()}@learners.elimuar.tz`;

  const [school] = await db
    .select({ defaultPin: schools.defaultPin })
    .from(schools)
    .where(eq(schools.id, input.schoolId))
    .limit(1);
  const initialPin = school?.defaultPin || identifier;

  const user = await insertReturning(users, {
    email,
    passwordHash: hashPassword(initialPin),
    firstName,
    lastName,
    phone: input.guardianPhone ?? null,
  });

  await db.insert(memberships).values({ userId: user.id, schoolId: input.schoolId, role: "student" });

  // A learner sits in one class: the first stream of their form.
  const enrollment = await insertReturning(studentEnrollments, {
    studentId: user.id,
    classId: formClasses[0].id,
    schoolId: input.schoolId,
    studentIdentifier: identifier,
    guardianPhone: input.guardianPhone ?? null,
  });

  return { ok: true, enrollmentId: enrollment.id };
}

orgRouter.post(
  "/schools/:schoolId/enrollments",
  requireRole("school_admin", "academic_master", "secretary", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    if (!isPlatformStaff(auth.role) && auth.schoolId !== req.params.schoolId) throw HttpError.forbidden();

    const body = parse(createEnrollmentRequestSchema, req.body);
    const gradeLevel = await requireForm(body.gradeLevel);

    const result = await enrolLearner({
      schoolId: req.params.schoolId,
      gradeLevel,
      fullName: body.fullName,
      studentIdentifier: body.studentIdentifier,
      guardianPhone: body.guardianPhone ?? null,
    });
    if (!result.ok) throw HttpError.conflict(result.message);

    await recordAudit({
      actorId: auth.userId,
      action: "enrollment.create",
      entity: "enrollment",
      entityId: result.enrollmentId,
      schoolId: req.params.schoolId,
      metadata: { student: body.fullName, registrationNumber: body.studentIdentifier, form: gradeLevel },
      ip: req.ip ?? null,
    });

    sendData(res, { enrollmentId: result.enrollmentId, created: true }, 201);
  })
);

orgRouter.post(
  "/schools/:schoolId/enrollments/roster-import",
  requireRole("school_admin", "academic_master", "secretary", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    if (!isPlatformStaff(auth.role) && auth.schoolId !== req.params.schoolId) throw HttpError.forbidden();

    const body = parse(rosterImportRequestSchema, req.body);
    const gradeLevel = await requireForm(body.gradeLevel);

    const formClasses = await classesForForm(req.params.schoolId, gradeLevel);
    if (formClasses.length === 0) {
      throw HttpError.badRequest(`${gradeLevel} has no class yet — open one under Classes & Subjects`);
    }

    const errors: Array<{ row: number; message: string }> = [];
    let created = 0;
    let skipped = 0;

    for (const [index, row] of body.rows.entries()) {
      const identifier = row.studentIdentifier.trim();

      const result = await enrolLearner({
        schoolId: req.params.schoolId,
        gradeLevel,
        fullName: row.fullName,
        studentIdentifier: identifier,
        guardianPhone: row.guardianPhone ?? null,
      });
      if (!result.ok) {
        skipped += 1;
        errors.push({ row: index + 1, message: result.message });
        continue;
      }
      created += 1;
    }

    await recordAudit({
      actorId: auth.userId,
      action: "roster.import",
      entity: "enrollment",
      entityId: req.params.schoolId,
      schoolId: req.params.schoolId,
      metadata: { form: gradeLevel, created, skipped },
      ip: req.ip ?? null,
    });

    sendData(res, { created, skipped, errors });
  })
);

orgRouter.patch(
  "/enrollments/:enrollmentId",
  requireRole("school_admin", "academic_master", "secretary", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(updateEnrollmentRequestSchema, req.body);
    const [current] = await db
      .select()
      .from(studentEnrollments)
      .where(eq(studentEnrollments.id, req.params.enrollmentId))
      .limit(1);
    if (!current) throw HttpError.notFound("Enrolment not found");

    const auth = req.auth!;
    if (!isPlatformStaff(auth.role) && auth.schoolId !== current.schoolId) throw HttpError.forbidden();

    const [learner] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, current.studentId))
      .limit(1);
    const learnerName = learner ? `${learner.firstName} ${learner.lastName}` : "Unknown learner";

    const held = await db
      .select({ id: studentEnrollments.id })
      .from(studentEnrollments)
      .where(
        and(
          eq(studentEnrollments.studentId, current.studentId),
          eq(studentEnrollments.schoolId, current.schoolId),
          ne(studentEnrollments.status, "removed")
        )
      );

    const gradeLevel = body.gradeLevel ? await requireForm(body.gradeLevel) : null;

    const patch = {
      ...(body.status ? { status: body.status } : {}),
      ...(body.studentIdentifier ? { studentIdentifier: body.studentIdentifier } : {}),
      ...(body.guardianPhone !== undefined ? { guardianPhone: body.guardianPhone } : {}),
    };

    if (gradeLevel) {
      const target = await classesForForm(current.schoolId, gradeLevel);
      if (target.length === 0) {
        throw HttpError.badRequest(`${gradeLevel} has no class yet — open one under Classes & Subjects`);
      }

      const pairs = Math.min(held.length, target.length);
      for (let index = 0; index < pairs; index += 1) {
        await db
          .update(studentEnrollments)
          .set({ ...patch, classId: target[index].id })
          .where(eq(studentEnrollments.id, held[index].id));
      }
      for (let index = pairs; index < target.length; index += 1) {
        await db.insert(studentEnrollments).values({
          id: newId(),
          studentId: current.studentId,
          classId: target[index].id,
          schoolId: current.schoolId,
          studentIdentifier: patch.studentIdentifier ?? current.studentIdentifier,
          guardianPhone: patch.guardianPhone !== undefined ? patch.guardianPhone : current.guardianPhone,
          status: patch.status ?? current.status,
        });
      }
      const surplus = held.slice(pairs);
      if (surplus.length > 0) {
        await db.delete(studentEnrollments).where(inArray(studentEnrollments.id, surplus.map((row) => row.id)));
      }
    } else if (Object.keys(patch).length > 0) {
      await db
        .update(studentEnrollments)
        .set(patch)
        .where(inArray(studentEnrollments.id, held.map((row) => row.id)));
    }

    await recordAudit({
      actorId: auth.userId,
      action: "enrollment.update",
      entity: "enrollment",
      entityId: current.id,
      schoolId: current.schoolId,
      metadata: {
        learner: learnerName,
        registrationNumber: body.studentIdentifier ?? current.studentIdentifier,
        ...(body.status && body.status !== current.status ? { from: current.status, to: body.status } : {}),
        ...(gradeLevel ? { form: gradeLevel } : {}),
      },
      ip: req.ip ?? null,
    });

    const rows = await db
      .select(learnerRowSelect)
      .from(studentEnrollments)
      .innerJoin(users, eq(studentEnrollments.studentId, users.id))
      .innerJoin(classes, eq(studentEnrollments.classId, classes.id))
      .where(
        and(
          eq(studentEnrollments.studentId, current.studentId),
          eq(studentEnrollments.schoolId, current.schoolId),
          ne(studentEnrollments.status, "removed")
        )
      )
      .orderBy(asc(classes.gradeLevel));

    const [learner_] = await foldLearners(rows as LearnerRow[]);
    sendData(res, learner_ ?? { ...current, subjectCount: 1, enrolledAt: current.enrolledAt.toISOString() });
  })
);

orgRouter.get(
  "/schools/:schoolId/members",
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    if (!isPlatformStaff(auth.role) && auth.schoolId !== req.params.schoolId) throw HttpError.forbidden();

    const rows = await db
      .select({
        membershipId: memberships.id,
        userId: users.id,
        fullName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        email: users.email,
        phone: users.phone,
        role: memberships.role,
        status: memberships.status,
        lastLoginAt: users.lastLoginAt,
        claimedAt: users.claimedAt,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.schoolId, req.params.schoolId))
      .orderBy(asc(memberships.role), asc(users.lastName));

    sendData(
      res,
      rows.map((r) => ({
        ...r,
        lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
        claimedAt: r.claimedAt ? r.claimedAt.toISOString() : null,
        awaitingRegistration: !r.claimedAt && r.role !== "student",
      }))
    );
  })
);

orgRouter.post(
  "/schools/:schoolId/members/:membershipId/invite",
  requireRole("school_admin", "academic_master", "secretary", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    if (!isPlatformStaff(auth.role) && auth.schoolId !== req.params.schoolId) throw HttpError.forbidden();

    const [row] = await db
      .select({
        membershipId: memberships.id,
        role: memberships.role,
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        claimedAt: users.claimedAt,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(and(eq(memberships.id, req.params.membershipId), eq(memberships.schoolId, req.params.schoolId)))
      .limit(1);
    if (!row) throw HttpError.notFound("Membership not found");
    if (row.claimedAt) throw HttpError.conflict("That person has already registered — send a password reset instead");

    const [school] = await db.select().from(schools).where(eq(schools.id, req.params.schoolId)).limit(1);
    const setup = await createSetupLink(row.userId);
    await queueRegistrationInvite({
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      role: row.role,
      schoolId: req.params.schoolId,
      schoolName: school?.name ?? "your school",
      setupUrl: setup?.url ?? null,
      setupToken: setup?.token ?? null,
    });

    await recordAudit({
      actorId: auth.userId,
      action: "membership.invite_resent",
      entity: "membership",
      entityId: row.membershipId,
      schoolId: req.params.schoolId,
      metadata: { email: row.email },
      ip: req.ip ?? null,
    });

    sendData(res, { queued: true, message: `Registration instructions queued for ${row.email}` });
  })
);

orgRouter.post(
  "/schools/:schoolId/members",
  requireRole("school_admin", "academic_master", "secretary", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(inviteMemberRequestSchema, req.body);
    const [existing] = await db.select().from(users).where(eq(users.email, body.email.toLowerCase())).limit(1);

    const pin = generateOtp(6);
    const user =
      existing ??
      (await insertReturning(users, {
        email: body.email.toLowerCase(),
        passwordHash: hashPassword(pin),
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone ?? null,
      }));

    const [already] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.schoolId, req.params.schoolId)))
      .limit(1);

    if (already) throw HttpError.conflict("That person is already a member of this school");

    const [elsewhere] = await db
      .select({ schoolName: schools.name })
      .from(memberships)
      .innerJoin(schools, eq(memberships.schoolId, schools.id))
      .where(
        and(
          eq(memberships.userId, user.id),
          eq(memberships.status, "active"),
          ne(memberships.schoolId, req.params.schoolId)
        )
      )
      .limit(1);

    if (elsewhere) {
      throw HttpError.conflict(
        `${user.firstName} ${user.lastName} is still active at ${elsewhere.schoolName}. Ask that school to transfer them first.`
      );
    }

    const membership = await insertReturning(memberships, {
      userId: user.id,
      schoolId: req.params.schoolId,
      role: body.role,
    });

    // Teachers are given their classes per subject in Classes & Subjects.

    const [school] = await db.select().from(schools).where(eq(schools.id, req.params.schoolId)).limit(1);

    const [previous] = await db
      .select({ schoolName: schools.name })
      .from(memberships)
      .innerJoin(schools, eq(memberships.schoolId, schools.id))
      .where(and(eq(memberships.userId, user.id), ne(memberships.schoolId, req.params.schoolId)))
      .orderBy(desc(memberships.endedAt), desc(memberships.startedAt))
      .limit(1);
    const elsewhereSchoolName = previous?.schoolName ?? null;

    if (!user.claimedAt) {
      const setup = await createSetupLink(user.id);
      await queueRegistrationInvite({
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: membership.role,
        schoolId: req.params.schoolId,
        schoolName: school?.name ?? "your school",
        setupUrl: setup?.url ?? null,
        setupToken: setup?.token ?? null,
      });
    } else {
      await queueMembershipNotice({
        userId: user.id,
        firstName: user.firstName,
        email: user.email,
        phone: user.phone,
        role: membership.role,
        schoolId: req.params.schoolId,
        schoolName: school?.name ?? "your new school",
        previousSchoolName: elsewhereSchoolName,
      });
    }

    await recordAudit({
      actorId: req.auth!.userId,
      action: "membership.invite",
      entity: "membership",
      entityId: membership.id,
      schoolId: req.params.schoolId,
      metadata: { role: membership.role, email: user.email, invited: !user.claimedAt },
      ip: req.ip ?? null,
    });

    sendData(
      res,
      {
        membership,
        userId: user.id,
        awaitingRegistration: !user.claimedAt,
        invited: !user.claimedAt ? emailDeliverable() : true,
      },
      201
    );
  })
);

orgRouter.post(
  "/schools/:schoolId/head-handover",
  requireRole("school_admin", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(
      z.object({
        outgoingMembershipId: z.string().uuid(),
        firstName: z.string().trim().min(2).max(60),
        lastName: z.string().trim().min(2).max(60),
        email: z.string().email().transform((value) => value.toLowerCase()),
        phone: z.string().trim().max(24).optional(),
      }),
      req.body
    );
    const schoolId = req.params.schoolId;
    if (!isPlatformStaff(req.auth!.role) && req.auth!.schoolId !== schoolId) throw HttpError.forbidden();

    const [outgoing] = await db
      .select({ id: memberships.id, userId: memberships.userId, role: memberships.role, status: memberships.status })
      .from(memberships)
      .where(and(eq(memberships.id, body.outgoingMembershipId), eq(memberships.schoolId, schoolId)))
      .limit(1);
    if (!outgoing || outgoing.role !== "school_admin") throw HttpError.badRequest("Choose an active school head.");
    if (outgoing.status !== "active") throw HttpError.conflict("That school head is not active.");
    if (req.auth!.role === "school_admin" && outgoing.userId !== req.auth!.userId) throw HttpError.forbidden();

    const [existing] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    const successor = existing ?? (await insertReturning(users, {
      email: body.email,
      passwordHash: hashPassword(generateOtp(6)),
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone ?? null,
    }));
    const [activeElsewhere] = await db
      .select({ schoolName: schools.name })
      .from(memberships)
      .innerJoin(schools, eq(memberships.schoolId, schools.id))
      .where(and(eq(memberships.userId, successor.id), eq(memberships.status, "active"), ne(memberships.schoolId, schoolId)))
      .limit(1);
    if (activeElsewhere) throw HttpError.conflict(`${successor.email} is active at ${activeElsewhere.schoolName}.`);

    await updateReturning(memberships, { status: "transferred", endedAt: new Date() }, eq(memberships.id, outgoing.id));
    const successorMembership = await insertReturning(memberships, {
      userId: successor.id,
      schoolId,
      role: "school_admin",
      status: "active",
    });
    const [school] = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
    if (!successor.claimedAt) {
      const setup = await createSetupLink(successor.id);
      await queueRegistrationInvite({
        userId: successor.id,
        firstName: successor.firstName,
        lastName: successor.lastName,
        email: successor.email,
        phone: successor.phone,
        role: "school_admin",
        schoolId,
        schoolName: school?.name ?? "your school",
        setupUrl: setup?.url ?? null,
        setupToken: setup?.token ?? null,
      });
    }
    await recordAudit({
      actorId: req.auth!.userId,
      action: "school.head_handover",
      entity: "membership",
      entityId: successorMembership.id,
      schoolId,
      metadata: { outgoingUserId: outgoing.userId, successorUserId: successor.id, successorEmail: successor.email },
      ip: req.ip ?? null,
    });
    sendData(res, { membershipId: successorMembership.id, queued: !successor.claimedAt }, 201);
  })
);

orgRouter.patch(
  "/schools/:schoolId/members/:membershipId",
  requireRole("school_admin", "academic_master", "secretary", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(updateMemberRequestSchema, req.body);

    const existing = await db
      .select({ status: memberships.status, role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.id, req.params.membershipId), eq(memberships.schoolId, req.params.schoolId)))
      .limit(1);
    if (existing.length === 0) throw HttpError.notFound("Membership not found");
    const previousMembership = existing[0];

    const updated = await updateReturning(
      memberships,
      {
        ...(body.status ? { status: body.status } : {}),
        ...(body.role ? { role: body.role } : {}),
        ...(body.status === "removed" ? { endedAt: new Date() } : {}),
      },
      and(eq(memberships.id, req.params.membershipId), eq(memberships.schoolId, req.params.schoolId))!
    );
    if (!updated) throw HttpError.notFound("Membership not found");

    const [person] = await db
      .select({ firstName: users.firstName, lastName: users.lastName, email: users.email })
      .from(users)
      .where(eq(users.id, updated.userId))
      .limit(1);

    await recordAudit({
      actorId: req.auth!.userId,
      action: "membership.update",
      entity: "membership",
      entityId: updated.id,
      schoolId: updated.schoolId,
      metadata: {
        person: person ? `${person.firstName} ${person.lastName}` : updated.userId,
        email: person?.email ?? null,
        role: updated.role,
        ...(body.status && body.status !== previousMembership.status
          ? { from: previousMembership.status, to: body.status }
          : {}),
      },
      ip: req.ip ?? null,
    });
    if (body.status && body.status !== "active") {
      await db.delete(refreshTokens).where(eq(refreshTokens.userId, updated.userId));
    }
    if (body.status) forgetAccess(updated.userId);

    sendData(res, updated);
  })
);

orgRouter.get(
  "/teachers/me/classes",
  requireRole("teacher", "school_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await db
      .select({
        classId: teacherAssignments.classId,
        className: classes.name,
        gradeLevel: classes.gradeLevel,
        subject: teacherAssignments.subject,
      })
      .from(teacherAssignments)
      .innerJoin(classes, eq(teacherAssignments.classId, classes.id))
      .where(eq(teacherAssignments.teacherId, req.auth!.userId))
      .orderBy(asc(classes.gradeLevel), asc(classes.name));

    // One row per class, with every subject this teacher teaches in it.
    const byClass = new Map<string, { classId: string; className: string; gradeLevel: string; subjects: string[] }>();
    for (const r of rows) {
      const row = byClass.get(r.classId) ?? { classId: r.classId, className: r.className, gradeLevel: r.gradeLevel, subjects: [] };
      row.subjects.push(r.subject);
      byClass.set(r.classId, row);
    }
    sendData(
      res,
      [...byClass.values()].map((r) => ({
        classId: r.classId,
        className: r.className,
        gradeLevel: r.gradeLevel,
        subject: r.subjects.sort().join(", "),
        subjects: r.subjects,
      }))
    );
  })
);

orgRouter.post(
  "/teachers/assignments",
  requireRole("school_admin", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(
      z.object({ teacherId: z.string().uuid(), classId: z.string().uuid(), subject: z.string().trim().min(1).max(80) }),
      req.body
    );
    // One teacher per subject in a class: giving it to this teacher replaces whoever had it.
    await db
      .delete(teacherAssignments)
      .where(and(eq(teacherAssignments.classId, body.classId), eq(teacherAssignments.subject, body.subject)));
    const created = await insertReturning(teacherAssignments, {
      teacherId: body.teacherId,
      classId: body.classId,
      subject: body.subject,
    });
    await recordAudit({
      actorId: req.auth!.userId,
      action: "teacher.assign",
      entity: "teacher_assignment",
      entityId: created?.id ?? null,
      metadata: { teacherId: body.teacherId, classId: body.classId },
      ip: req.ip ?? null,
    });
    sendData(res, created ?? { assigned: true }, 201);
  })
);

orgRouter.delete(
  "/teachers/assignments/:assignmentId",
  requireRole("school_admin", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    const [row] = await db
      .select({
        assignmentId: teacherAssignments.id,
        schoolId: classes.schoolId,
        teacherName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        className: classes.name,
      })
      .from(teacherAssignments)
      .innerJoin(classes, eq(teacherAssignments.classId, classes.id))
      .innerJoin(users, eq(teacherAssignments.teacherId, users.id))
      .where(eq(teacherAssignments.id, req.params.assignmentId))
      .limit(1);

    if (!row) throw HttpError.notFound("That teaching assignment no longer exists");
    if (!isPlatformStaff(auth.role) && auth.schoolId !== row.schoolId) throw HttpError.forbidden();

    await db.delete(teacherAssignments).where(eq(teacherAssignments.id, row.assignmentId));
    await recordAudit({
      actorId: auth.userId,
      action: "teacher.unassign",
      entity: "teacher_assignment",
      entityId: row.assignmentId,
      schoolId: row.schoolId,
      metadata: { teacher: row.teacherName, class: row.className },
      ip: req.ip ?? null,
    });
    sendData(res, { deleted: true });
  })
);

orgRouter.get(
  "/schools/:schoolId/student-credentials",
  requireRole("school_admin", "academic_master", "secretary", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    if (!isPlatformStaff(auth.role) && auth.schoolId !== req.params.schoolId) throw HttpError.forbidden();

    const rows = await db
      .select({
        enrollmentId: studentEnrollments.id,
        studentId: users.id,
        fullName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        studentIdentifier: studentEnrollments.studentIdentifier,
        className: classes.name,
        gradeLevel: classes.gradeLevel,
        status: studentEnrollments.status,
        pinChangedAt: users.pinChangedAt,
      })
      .from(studentEnrollments)
      .innerJoin(users, eq(studentEnrollments.studentId, users.id))
      .innerJoin(classes, eq(studentEnrollments.classId, classes.id))
      .where(eq(studentEnrollments.schoolId, req.params.schoolId))
      .orderBy(asc(classes.gradeLevel), asc(users.lastName), asc(users.firstName));

    const credentials = new Map(
      rows.map((row) => [
        row.studentId,
        {
          enrollmentId: row.enrollmentId,
          studentId: row.studentId,
          fullName: row.fullName,
          studentIdentifier: row.studentIdentifier,
          className: row.className,
          gradeLevel: row.gradeLevel,
          status: row.status,
          pinChangedAt: row.pinChangedAt ? row.pinChangedAt.toISOString() : null,
          pinIsAdmissionNumber: row.pinChangedAt === null,
        },
      ])
    );

    sendData(res, [...credentials.values()]);
  })
);

orgRouter.post(
  "/enrollments/:enrollmentId/reset-pin",
  requireRole("school_admin", "academic_master", "secretary", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    const [enrollment] = await db
      .select({
        id: studentEnrollments.id,
        schoolId: studentEnrollments.schoolId,
        studentId: studentEnrollments.studentId,
        identifier: studentEnrollments.studentIdentifier,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(studentEnrollments)
      .innerJoin(users, eq(studentEnrollments.studentId, users.id))
      .where(eq(studentEnrollments.id, req.params.enrollmentId))
      .limit(1);
    if (!enrollment) throw HttpError.notFound("Enrolment not found");
    if (!isPlatformStaff(auth.role) && auth.schoolId !== enrollment.schoolId) throw HttpError.forbidden();

    const newPin = generateOtp(6);
    await db
      .update(users)
      .set({ passwordHash: hashPassword(newPin), pinChangedAt: null, updatedAt: new Date() })
      .where(eq(users.id, enrollment.studentId));
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, enrollment.studentId));

    await recordAudit({
      actorId: auth.userId,
      action: "credential.student_pin_reset",
      entity: "user",
      entityId: enrollment.studentId,
      schoolId: enrollment.schoolId,
      metadata: {
        learner: `${enrollment.firstName} ${enrollment.lastName}`,
        registrationNumber: enrollment.identifier,
      },
      ip: req.ip ?? null,
    });

    sendData(res, {
      message: `PIN reset for ${enrollment.firstName} ${enrollment.lastName}.`,
      newPin: process.env.NODE_ENV === "production" ? undefined : newPin,
    });
  })
);

orgRouter.post(
  "/enrollments/:enrollmentId/set-pin",
  requireRole("school_admin", "academic_master", "secretary", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(setStudentPinRequestSchema, req.body);
    const auth = req.auth!;
    const [enrollment] = await db
      .select({
        id: studentEnrollments.id,
        schoolId: studentEnrollments.schoolId,
        studentId: studentEnrollments.studentId,
        identifier: studentEnrollments.studentIdentifier,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(studentEnrollments)
      .innerJoin(users, eq(studentEnrollments.studentId, users.id))
      .where(eq(studentEnrollments.id, req.params.enrollmentId))
      .limit(1);
    if (!enrollment) throw HttpError.notFound("Enrolment not found");
    if (!isPlatformStaff(auth.role) && auth.schoolId !== enrollment.schoolId) throw HttpError.forbidden();
    if (body.newPin === enrollment.identifier) {
      throw HttpError.badRequest("The PIN cannot be the admission number — choose something else.");
    }

    await db
      .update(users)
      .set({ passwordHash: hashPassword(body.newPin), pinChangedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, enrollment.studentId));

    await recordAudit({
      actorId: auth.userId,
      action: "credential.student_pin_set",
      entity: "user",
      entityId: enrollment.studentId,
      schoolId: enrollment.schoolId,
      metadata: {
        learner: `${enrollment.firstName} ${enrollment.lastName}`,
        registrationNumber: enrollment.identifier,
      },
      ip: req.ip ?? null,
    });

    sendData(res, { message: `PIN updated for ${enrollment.firstName} ${enrollment.lastName}.` });
  })
);

orgRouter.get(
  "/schools/:schoolId/staff-credentials",
  requireRole("school_admin", "academic_master", "secretary", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    if (!isPlatformStaff(auth.role) && auth.schoolId !== req.params.schoolId) throw HttpError.forbidden();

    const rows = await db
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
      .where(eq(memberships.schoolId, req.params.schoolId))
      .orderBy(asc(memberships.role), asc(users.lastName));

    sendData(
      res,
      rows
        .filter((r) => r.role !== "student")
        .map((r) => ({
          membershipId: r.membershipId,
          userId: r.userId,
          fullName: r.fullName,
          email: r.email,
          role: r.role,
          status: r.status,
          lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
          awaitingRegistration: r.claimedAt === null,
        }))
    );
  })
);
orgRouter.post(
  "/memberships/:membershipId/reset-password",
  requireRole("school_admin", "academic_master", "secretary", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    const [row] = await db
      .select({
        membershipId: memberships.id,
        userId: memberships.userId,
        role: memberships.role,
        schoolId: memberships.schoolId,
        claimedAt: users.claimedAt,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.id, req.params.membershipId))
      .limit(1);
    if (!row) throw HttpError.notFound("Membership not found");
    if (!isPlatformStaff(auth.role) && auth.schoolId !== row.schoolId) throw HttpError.forbidden();
    if (row.userId === auth.userId) {
      throw HttpError.badRequest("Use “Change password” on your own profile instead.");
    }
    if (row.role === "school_admin" && !isPlatformStaff(auth.role) && auth.role !== "school_admin") {
      throw HttpError.forbidden("Only a school head can reset another head's password.");
    }
    if (!row.schoolId) throw HttpError.badRequest("This membership has no school attached.");

    await db.delete(refreshTokens).where(eq(refreshTokens.userId, row.userId));

    const setup = await createSetupLink(row.userId);
    const [school] = await db.select().from(schools).where(eq(schools.id, row.schoolId)).limit(1);
    if (setup) {
      await queueRegistrationInvite({
        userId: row.userId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone,
        role: row.role,
        schoolId: row.schoolId,
        schoolName: school?.name ?? "your school",
        setupUrl: setup.url,
        setupToken: setup.token,
      });
    }

    await recordAudit({
      actorId: auth.userId,
      action: "credential.staff_password_reset",
      entity: "user",
      entityId: row.userId,
      schoolId: row.schoolId,
      metadata: { person: `${row.firstName} ${row.lastName}`, email: row.email, role: row.role },
      ip: req.ip ?? null,
    });

    sendData(res, {
      message: setup
        ? `A password-setup link was emailed to ${row.email}.`
        : `No email provider is configured. Add RESEND_API_KEY and send again — ${row.firstName} can also use “Forgot your password?” on the sign-in screen.`,
      emailed: Boolean(setup),
    });
  })
);

orgRouter.get(
  "/platform/users",
  requireRole("platform_admin"),
  asyncHandler(async (req, res) => {
    const role = typeof req.query.role === "string" ? roleSchema.safeParse(req.query.role).data : undefined;
    const schoolId = typeof req.query.schoolId === "string" ? req.query.schoolId : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;

    const conditions = [
      ...(role ? [eq(memberships.role, role)] : []),
      ...(schoolId ? [eq(memberships.schoolId, schoolId)] : []),
      ...(q
        ? [or(like(users.email, `%${q}%`), like(users.firstName, `%${q}%`), like(users.lastName, `%${q}%`))!]
        : []),
    ];

    const rows = await db
      .select({
        membershipId: memberships.id,
        userId: users.id,
        fullName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        email: users.email,
        phone: users.phone,
        role: memberships.role,
        status: memberships.status,
        schoolId: memberships.schoolId,
        schoolName: schools.name,
        regionName: regions.name,
        districtName: districts.name,
        lastLoginAt: users.lastLoginAt,
        awaitingRegistration: sql<number>`(${users.claimedAt} is null)`,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .leftJoin(schools, eq(memberships.schoolId, schools.id))
      .leftJoin(districts, eq(schools.districtId, districts.id))
      .leftJoin(regions, eq(districts.regionId, regions.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(users.lastName), asc(users.firstName));

    sendData(
      res,
      rows.map((r) => ({
        ...r,
        awaitingRegistration: Boolean(r.awaitingRegistration),
        lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
      }))
    );
  })
);

orgRouter.get(
  "/platform/audit-events",
  requireRole("platform_admin"),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number.parseInt(String(req.query.limit ?? "100"), 10) || 100, 500);
    const action = typeof req.query.action === "string" && req.query.action !== "all" ? req.query.action : undefined;

    const rows = await db
      .select({
        id: auditEvents.id,
        action: auditEvents.action,
        entity: auditEvents.entity,
        entityId: auditEvents.entityId,
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
        metadata: auditEvents.metadata,
        ip: auditEvents.ip,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .leftJoin(users, eq(auditEvents.actorId, users.id))
      .leftJoin(schools, eq(auditEvents.schoolId, schools.id))
      .where(action ? eq(auditEvents.action, action) : undefined)
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);

    sendData(
      res,
      rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
    );
  })
);

orgRouter.get(
  "/schools/:schoolId/teaching-assignments",
  requireRole("school_admin", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    if (!isPlatformStaff(auth.role) && auth.schoolId !== req.params.schoolId) throw HttpError.forbidden();

    const rows = await db
      .select({
        assignmentId: teacherAssignments.id,
        teacherId: teacherAssignments.teacherId,
        teacherName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        classId: teacherAssignments.classId,
        className: classes.name,
        gradeLevel: classes.gradeLevel,
        subject: teacherAssignments.subject,
      })
      .from(teacherAssignments)
      .innerJoin(users, eq(teacherAssignments.teacherId, users.id))
      .innerJoin(classes, eq(teacherAssignments.classId, classes.id))
      .where(eq(classes.schoolId, req.params.schoolId))
      .orderBy(asc(classes.gradeLevel), asc(classes.name), asc(users.lastName));

    sendData(res, rows);
  })
);

orgRouter.post(
  "/schools/:schoolId/academic-year",
  requireRole("school_admin", "platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    if (!isPlatformStaff(auth.role) && auth.schoolId !== req.params.schoolId) throw HttpError.forbidden();

    const body = parse(promoteAcademicYearRequestSchema, req.body);

    const current = await db
      .select({
        id: classes.id,
        name: classes.name,
        gradeLevel: classes.gradeLevel,
        stream: classes.stream,
        academicYear: classes.academicYear,
      })
      .from(classes)
      .where(and(eq(classes.schoolId, req.params.schoolId), eq(classes.status, "active")))
      .orderBy(asc(classes.gradeLevel), asc(classes.name));

    if (current.length === 0) throw HttpError.badRequest("This school has no active classes to move up");

    const counts = await db
      .selectDistinct({ classId: studentEnrollments.classId, studentId: studentEnrollments.studentId })
      .from(studentEnrollments)
      .where(
        and(
          inArray(
            studentEnrollments.classId,
            current.map((row) => row.id)
          ),
          eq(studentEnrollments.status, "active")
        )
      );

    const gradeOfClass = new Map(current.map((row) => [row.id, row.gradeLevel]));
    const studentsByForm = new Map<string, Set<string>>();
    for (const row of counts) {
      const form = gradeOfClass.get(row.classId);
      if (!form) continue;
      const seen = studentsByForm.get(form) ?? new Set<string>();
      seen.add(row.studentId);
      studentsByForm.set(form, seen);
    }

    const nextForm: Record<string, string | null> = {
      "Form 1": "Form 2",
      "Form 2": "Form 3",
      "Form 3": "Form 4",
      "Form 4": null,
    };

    const movement = FORMS.map((form) => ({
      from: form,
      to: nextForm[form] ?? "Completed",
      classes: current.filter((row) => row.gradeLevel === form).length,
      students: studentsByForm.get(form)?.size ?? 0,
    })).filter((row) => row.classes > 0);

    const studentsPromoted = movement
      .filter((row) => row.to !== "Completed")
      .reduce((sum, row) => sum + row.students, 0);
    const studentsCompleted = movement.find((row) => row.to === "Completed")?.students ?? 0;

    if (body.preview) {
      sendData(res, {
        academicYear: body.academicYear,
        classesCreated: current.filter((row) => nextForm[row.gradeLevel] !== null).length,
        studentsPromoted,
        studentsCompleted,
        classesArchived: current.length,
        movement,
      });
      return;
    }

    const teachers = await db
      .select({
        classId: teacherAssignments.classId,
        teacherId: teacherAssignments.teacherId,
        subject: teacherAssignments.subject,
      })
      .from(teacherAssignments)
      .where(
        inArray(
          teacherAssignments.classId,
          current.map((row) => row.id)
        )
      );

    const result = await db.transaction(async (tx) => {
      let classesCreated = 0;
      const promoted = new Set<string>();
      const completed = new Set<string>();

      for (const row of current) {
        const to = nextForm[row.gradeLevel];
        const enrolled = await tx
          .select({ id: studentEnrollments.id, studentId: studentEnrollments.studentId })
          .from(studentEnrollments)
          .where(and(eq(studentEnrollments.classId, row.id), eq(studentEnrollments.status, "active")));

        if (!to) {
          if (enrolled.length > 0) {
            await tx
              .update(studentEnrollments)
              .set({ status: "completed" })
              .where(
                inArray(
                  studentEnrollments.id,
                  enrolled.map((item) => item.id)
                )
              );
            for (const item of enrolled) completed.add(item.studentId);
          }
          continue;
        }

        const name = row.stream && row.stream !== "A" ? `${to} ${row.stream}` : to;
        const createdId = newId();
        await tx.insert(classes).values({
          id: createdId,
          schoolId: req.params.schoolId,
          name,
          gradeLevel: to as ClassSummary["gradeLevel"],
          stream: row.stream,
          academicYear: body.academicYear,
          status: "active",
        });
        // The class keeps its subjects as it moves up a form.
        const carried = await tx.select().from(classSubjects).where(eq(classSubjects.classId, row.id));
        if (carried.length > 0) {
          await tx.insert(classSubjects).values(
            carried.map((c) => ({
              id: newId(),
              schoolId: c.schoolId,
              classId: createdId,
              subject: c.subject,
              allStudents: c.allStudents,
            }))
          );
        }

        classesCreated += 1;

        if (enrolled.length > 0) {
          await tx
            .update(studentEnrollments)
            .set({ classId: createdId }            )
            .where(
              inArray(
                studentEnrollments.id,
                enrolled.map((item) => item.id)
              )
            );
          for (const item of enrolled) promoted.add(item.studentId);
        }

        for (const assignment of teachers.filter((item) => item.classId === row.id)) {
          await tx
            .insert(teacherAssignments)
            .values({ teacherId: assignment.teacherId, classId: createdId, subject: assignment.subject })
            .onDuplicateKeyUpdate({ set: { id: sql`id` } });
        }
      }

      await tx
        .update(classes)
        .set({ status: "archived" })
        .where(
          inArray(
            classes.id,
            current.map((row) => row.id)
          )
        );

      return { classesCreated, promoted: promoted.size, completed: completed.size };
    });

    await recordAudit({
      actorId: auth.userId,
      action: "school.academic_year",
      entity: "school",
      entityId: req.params.schoolId,
      schoolId: req.params.schoolId,
      metadata: {
        academicYear: body.academicYear,
        classesCreated: result.classesCreated,
        studentsPromoted: result.promoted,
        studentsCompleted: result.completed,
        classesArchived: current.length,
      },
      ip: req.ip ?? null,
    });

    sendData(res, {
      academicYear: body.academicYear,
      classesCreated: result.classesCreated,
      studentsPromoted: result.promoted,
      studentsCompleted: result.completed,
      classesArchived: current.length,
      movement,
    });
  })
);

orgRouter.get(
  "/schools/:schoolId/staff-summary",
  requireRole("school_admin", "platform_admin"),
  asyncHandler(async (req, res) => {
    const [row] = await db
      .select({ teachers: count() })
      .from(memberships)
      .where(and(eq(memberships.schoolId, req.params.schoolId), eq(memberships.role, "teacher")));
    sendData(res, { teachers: Number(row?.teachers ?? 0) });
  })
);

orgRouter.get(
  "/schools/:schoolId/public-name",
  asyncHandler(async (req, res) => {
    const [row] = await db
      .select({ id: schools.id, name: schools.name })
      .from(schools)
      .where(eq(schools.id, req.params.schoolId))
      .limit(1);
    sendData(res, row ?? null);
  })
);
