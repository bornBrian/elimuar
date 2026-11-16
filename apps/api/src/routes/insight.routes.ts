import { Router } from "express";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { SchoolOverview, SchoolReport } from "@elimuar/shared";
import { db } from "../db/client.js";
import {
  arActivities,
  arActivityRuns,
  classSubjects,
  classes,
  gradeLevels,
  lessonAssignments,
  lessons,
  memberships,
  schools,
  studentEnrollments,
  subjects,
  teacherAssignments,
  users,
} from "../db/schema.js";
import { HttpError, asyncHandler, sendData } from "../lib/http.js";
import { requireAuth, requireRole, type AuthedRequest } from "../middleware/auth.js";

/** What the portal shows about learning, all of it worked out from ar_activity_runs (every time a learner
   played an activity). */

export const insightRouter = Router();

const SCHOOL_VIEWERS = ["school_admin", "academic_master", "secretary", "platform_admin"] as const;
const DEFAULT_BANDS = [
  { min: 75, label: "A" },
  { min: 65, label: "B" },
  { min: 45, label: "C" },
  { min: 30, label: "D" },
  { min: 0, label: "F" },
];
const DAY = 86_400_000;

function schoolOf(req: AuthedRequest): string {
  const auth = req.auth!;
  const asked = typeof req.query.schoolId === "string" ? req.query.schoolId : null;
  const id = auth.role === "platform_admin" ? asked ?? auth.schoolId : auth.schoolId;
  if (!id) throw HttpError.badRequest("Choose a school.");
  return id;
}

const finished = (status: string) => status === "completed" || status === "mastered";
const mean = (values: number[]) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null);
const rate = (part: number, whole: number) => (whole > 0 ? Math.round((100 * part) / whole) : null);
const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const fullName = sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`;

function bandOf(score: number | null, bands: Array<{ min: number; label: string }>): string | null {
  if (score == null) return null;
  return [...bands].sort((a, b) => b.min - a.min).find((b) => score >= b.min)?.label ?? null;
}

/** The days from `from` to today, each with an empty counter. */
function daysFrom(from: Date) {
  const out: string[] = [];
  for (let t = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()); t <= Date.now(); t += DAY) {
    out.push(dayKey(new Date(t)));
  }
  return out;
}

/** Everything a school's reports are drawn from, for one period. */
async function schoolData(schoolId: string, from: Date) {
  const [school] = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1);
  if (!school) throw HttpError.notFound("School not found");

  const [classRows, students, activities, runs] = await Promise.all([
    db
      .select({ id: classes.id, name: classes.name, gradeLevel: classes.gradeLevel })
      .from(classes)
      .where(and(eq(classes.schoolId, schoolId), eq(classes.status, "active")))
      .orderBy(asc(classes.gradeLevel), asc(classes.name)),
    db
      .select({
        studentId: studentEnrollments.studentId,
        classId: studentEnrollments.classId,
        admissionNumber: studentEnrollments.studentIdentifier,
        name: fullName,
      })
      .from(studentEnrollments)
      .innerJoin(users, eq(studentEnrollments.studentId, users.id))
      .where(and(eq(studentEnrollments.schoolId, schoolId), eq(studentEnrollments.status, "active"))),
    db
      .select({
        activityKey: arActivities.activityKey,
        title: arActivities.title,
        subject: arActivities.subject,
        gradeLevel: arActivities.gradeLevel,
        status: arActivities.status,
      })
      .from(arActivities)
      .orderBy(asc(arActivities.sortOrder)),
    db
      .select()
      .from(arActivityRuns)
      .where(and(eq(arActivityRuns.schoolId, schoolId), gte(arActivityRuns.playedAt, from)))
      .orderBy(asc(arActivityRuns.playedAt)),
  ]);
  return { school, classRows, students, activities, runs };
}

// ---- pickers ---------------------------------------------------------------------------

insightRouter.get(
  "/academic/options",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const [forms, subjectRows] = await Promise.all([
      db.select({ name: gradeLevels.name }).from(gradeLevels).where(eq(gradeLevels.status, "active")).orderBy(asc(gradeLevels.position)),
      db.select({ name: subjects.name }).from(subjects).where(eq(subjects.status, "active")).orderBy(asc(subjects.name)),
    ]);
    sendData(res, { classOptions: forms.map((f) => f.name), subjectOptions: subjectRows.map((s) => s.name) });
  })
);

// ---- the overview ------------------------------------------------------------------------

insightRouter.get(
  "/reports/school/overview",
  requireAuth,
  requireRole(...SCHOOL_VIEWERS),
  asyncHandler(async (req: AuthedRequest, res) => {
    const schoolId = schoolOf(req);
    const trendFrom = new Date(Date.now() - 13 * DAY);
    const { school, classRows, students, activities, runs } = await schoolData(schoolId, trendFrom);
    const windowDays = school.engagementWindowDays;
    const windowFrom = new Date(Date.now() - windowDays * DAY);
    const inWindow = runs.filter((r) => r.playedAt >= windowFrom);

    const [teacherCount, subjectRows, untaught, pendingTeachers] = await Promise.all([
      db
        .select({ n: sql<number>`count(*)` })
        .from(memberships)
        .where(and(eq(memberships.schoolId, schoolId), eq(memberships.role, "teacher"), eq(memberships.status, "active"))),
      db.selectDistinct({ subject: classSubjects.subject }).from(classSubjects).where(eq(classSubjects.schoolId, schoolId)),
      db
        .select({ subject: classSubjects.subject, className: classes.name })
        .from(classSubjects)
        .innerJoin(classes, eq(classSubjects.classId, classes.id))
        .leftJoin(
          teacherAssignments,
          and(eq(teacherAssignments.classId, classSubjects.classId), eq(teacherAssignments.subject, classSubjects.subject))
        )
        .where(and(eq(classSubjects.schoolId, schoolId), sql`${teacherAssignments.id} is null`)),
      db
        .select({ n: sql<number>`count(*)` })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .where(
          and(
            eq(memberships.schoolId, schoolId),
            eq(memberships.role, "teacher"),
            eq(memberships.status, "active"),
            sql`${users.claimedAt} is null`
          )
        ),
    ]);

    const scores = (list: typeof runs) =>
      list.filter((r) => finished(r.status) && r.questionsShown > 0 && r.scorePercent != null).map((r) => Number(r.scorePercent));
    const classOf = new Map(students.map((s) => [s.studentId, s.classId]));
    const nameOf = new Map(students.map((s) => [s.studentId, s.name]));
    const classNames = new Map(classRows.map((c) => [c.id, c.name]));
    const titles = new Map(activities.map((a) => [a.activityKey, a.title]));

    const perClass = classRows.map((c) => {
      const members = students.filter((s) => s.classId === c.id);
      const own = inWindow.filter((r) => (r.classId ?? classOf.get(r.userId)) === c.id);
      return {
        classId: c.id,
        className: c.name,
        students: members.length,
        activeStudents: new Set(own.map((r) => r.userId)).size,
        averageScore: mean(scores(own)),
      };
    });

    const attention: SchoolOverview["attention"] = [];
    const idle = perClass.filter((c) => c.students > 0 && c.activeStudents === 0).map((c) => c.className);
    if (idle.length > 0) {
      attention.push({
        title: idle.length === 1 ? `${idle[0]} has not used AR this week` : `${idle.length} classes have not used AR this week`,
        detail: `${idle.join(", ")}: no learner played an activity in the last ${windowDays} days.`,
        href: "/head/reports",
      });
    }
    if (untaught.length > 0) {
      const example = untaught[0];
      attention.push({
        title: `${untaught.length} class subject${untaught.length === 1 ? " has" : "s have"} no teacher`,
        detail: `For example ${example.subject} in ${example.className}. Choose teachers in Classes & Subjects.`,
        href: "/head/classes?tab=subjects",
      });
    }
    const pending = Number(pendingTeachers[0]?.n ?? 0);
    if (pending > 0) {
      attention.push({ title: `${pending} teacher${pending === 1 ? " has" : "s have"} not registered`, detail: "They have not set their password yet.", href: "/head/teachers" });
    }

    const trend = daysFrom(trendFrom).map((date) => {
      const day = runs.filter((r) => dayKey(r.playedAt) === date);
      return { date, runs: day.length, finished: day.filter((r) => finished(r.status)).length };
    });

    const overview: SchoolOverview = {
      schoolName: school.name,
      windowDays,
      counts: {
        students: students.length,
        teachers: Number(teacherCount[0]?.n ?? 0),
        classes: classRows.length,
        subjects: subjectRows.length,
        activities: activities.filter((a) => a.status === "published").length,
      },
      activeStudents: new Set(inWindow.map((r) => r.userId)).size,
      runsInWindow: inWindow.length,
      averageScore: mean(scores(inWindow)),
      trend,
      classes: perClass,
      attention,
      recentRuns: [...runs]
        .reverse()
        .slice(0, 8)
        .map((r) => ({
          studentName: nameOf.get(r.userId) ?? "A learner",
          className: classNames.get(r.classId ?? classOf.get(r.userId) ?? "") ?? null,
          activityTitle: titles.get(r.activityKey) ?? r.activityKey,
          status: r.status,
          scorePercent: r.scorePercent != null && r.questionsShown > 0 ? Math.round(Number(r.scorePercent)) : null,
          playedAt: r.playedAt.toISOString(),
        })),
    };
    sendData(res, overview);
  })
);

// ---- the reports page ----------------------------------------------------------------

insightRouter.get(
  "/reports/school",
  requireAuth,
  requireRole(...SCHOOL_VIEWERS),
  asyncHandler(async (req: AuthedRequest, res) => {
    const schoolId = schoolOf(req);
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const classId = typeof req.query.classId === "string" && req.query.classId ? req.query.classId : null;
    const subject = typeof req.query.subject === "string" && req.query.subject ? req.query.subject : null;
    const from = new Date(Date.now() - (days - 1) * DAY);
    from.setUTCHours(0, 0, 0, 0);

    const data = await schoolData(schoolId, from);
    const { school } = data;
    const mastery = school.masteryThresholdPercent;
    const bands = school.gradeBands?.length ? school.gradeBands : DEFAULT_BANDS;

    const classRows = classId ? data.classRows.filter((c) => c.id === classId) : data.classRows;
    const classIds = new Set(classRows.map((c) => c.id));
    const students = data.students.filter((s) => classIds.has(s.classId));
    const studentIds = new Set(students.map((s) => s.studentId));
    const activities = data.activities.filter((a) => (subject ? a.subject === subject : true));
    const activityKeys = new Set(activities.map((a) => a.activityKey));
    const classOf = new Map(data.students.map((s) => [s.studentId, s.classId]));
    const runClass = (r: (typeof data.runs)[number]) => r.classId ?? classOf.get(r.userId) ?? null;
    const runs = data.runs.filter((r) => studentIds.has(r.userId) && activityKeys.has(r.activityKey) && classIds.has(runClass(r) ?? ""));

    const scored = (list: typeof runs) =>
      list.filter((r) => finished(r.status) && r.questionsShown > 0 && r.scorePercent != null).map((r) => Number(r.scorePercent));
    const masteryOf = (list: typeof runs) => {
      const s = scored(list);
      return rate(s.filter((v) => v >= mastery).length, s.length);
    };

    // Assignments for these classes (and subject), with their hand-ins.
    const assignmentRows = classIds.size
      ? await db
          .select({
            id: lessonAssignments.id,
            title: lessons.title,
            subject: lessons.subject,
            activityKey: lessons.modelKey,
            classId: lessonAssignments.classId,
            dueAt: lessonAssignments.dueAt,
            status: lessonAssignments.status,
            createdAt: lessonAssignments.createdAt,
            teacherName: fullName,
          })
          .from(lessonAssignments)
          .innerJoin(lessons, eq(lessonAssignments.lessonId, lessons.id))
          .innerJoin(users, eq(lessonAssignments.assignedBy, users.id))
          .where(inArray(lessonAssignments.classId, [...classIds]))
          .orderBy(desc(lessonAssignments.createdAt))
      : [];
    const assignments = assignmentRows.filter((a) => (subject ? a.subject === subject : true));
    const handIns = assignments.length
      ? await db
          .select({
            assignmentId: arActivityRuns.assignmentId,
            userId: arActivityRuns.userId,
            scorePercent: arActivityRuns.scorePercent,
            playedAt: arActivityRuns.playedAt,
          })
          .from(arActivityRuns)
          .where(and(inArray(arActivityRuns.assignmentId, assignments.map((a) => a.id)), sql`${arActivityRuns.endReason} is not null`))
      : [];
    const classSize = (id: string) => data.students.filter((s) => s.classId === id).length;

    const assignmentStats = assignments.map((a) => {
      const own = handIns.filter((h) => h.assignmentId === a.id);
      const learners = new Set(own.map((h) => h.userId));
      const best = [...learners].map((u) => Math.max(...own.filter((h) => h.userId === u).map((h) => Number(h.scorePercent ?? 0))));
      const late = a.dueAt ? new Set(own.filter((h) => h.playedAt > a.dueAt!).map((h) => h.userId)).size : 0;
      return {
        id: a.id,
        title: a.title,
        className: data.classRows.find((c) => c.id === a.classId)?.name ?? "",
        teacherName: a.teacherName,
        dueAt: a.dueAt ? a.dueAt.toISOString() : null,
        students: classSize(a.classId),
        handedIn: learners.size,
        late,
        averageScore: mean(best),
        status: a.status === "open" && a.dueAt && a.dueAt < new Date() ? "closed" : a.status,
      };
    });
    const inPeriod = assignmentStats.filter((a, i) => assignments[i].createdAt >= from || (a.dueAt && new Date(a.dueAt) >= from));

    const trend = daysFrom(from).map((date) => {
      const day = runs.filter((r) => dayKey(r.playedAt) === date);
      return { date, runs: day.length, finished: day.filter((r) => finished(r.status)).length, averageScore: mean(scored(day)) };
    });

    const perClass = classRows.map((c) => {
      const own = runs.filter((r) => runClass(r) === c.id);
      const mine = inPeriod.filter((a) => a.className === c.name);
      return {
        classId: c.id,
        className: c.name,
        students: students.filter((s) => s.classId === c.id).length,
        activeStudents: new Set(own.map((r) => r.userId)).size,
        runs: own.length,
        averageScore: mean(scored(own)),
        masteryRate: masteryOf(own),
        handInRate: rate(
          mine.reduce((n, a) => n + a.handedIn, 0),
          mine.reduce((n, a) => n + a.students, 0)
        ),
      };
    });

    const perActivity = activities
      .filter((a) => a.status === "published" || runs.some((r) => r.activityKey === a.activityKey))
      .map((a) => {
        const own = runs.filter((r) => r.activityKey === a.activityKey);
        const done = own.filter((r) => finished(r.status));
        return {
          activityKey: a.activityKey,
          title: a.title,
          subject: a.subject,
          gradeLevel: a.gradeLevel,
          runs: own.length,
          learners: new Set(own.map((r) => r.userId)).size,
          averageScore: mean(scored(own)),
          masteryRate: masteryOf(own),
          averageMinutes: done.length ? Math.round((10 * done.reduce((n, r) => n + r.durationSeconds, 0)) / done.length / 60) / 10 : null,
        };
      });

    const perStudent = students
      .map((s) => {
        const own = runs.filter((r) => r.userId === s.studentId);
        const sc = scored(own);
        const average = mean(sc);
        return {
          studentId: s.studentId,
          name: s.name,
          admissionNumber: s.admissionNumber ?? null,
          className: data.classRows.find((c) => c.id === s.classId)?.name ?? "",
          runs: own.length,
          activities: new Set(own.map((r) => r.activityKey)).size,
          averageScore: average,
          bestScore: sc.length ? Math.round(Math.max(...sc)) : null,
          grade: bandOf(average, bands),
          lastPlayedAt: own.length ? own[own.length - 1].playedAt.toISOString() : null,
          needsSupport: average != null && average < 50,
        };
      })
      .sort((a, b) => (b.averageScore ?? -1) - (a.averageScore ?? -1) || a.name.localeCompare(b.name));

    const grades = [...bands]
      .sort((a, b) => b.min - a.min)
      .map((b) => ({ label: b.label, min: b.min, count: perStudent.filter((s) => s.grade === b.label).length }));

    // The questions learners got wrong most, from the answers handed in.
    const tally = new Map<string, { activityTitle: string; prompt: string; answered: number; correct: number }>();
    const titleOf = new Map(data.activities.map((a) => [a.activityKey, a.title]));
    for (const r of runs) {
      for (const item of r.answers ?? []) {
        const key = `${r.activityKey}\n${item.prompt}`;
        const t = tally.get(key) ?? { activityTitle: titleOf.get(r.activityKey) ?? r.activityKey, prompt: item.prompt, answered: 0, correct: 0 };
        t.answered += 1;
        if (item.correct) t.correct += 1;
        tally.set(key, t);
      }
    }
    const questions = [...tally.values()]
      .map((t) => ({ activityTitle: t.activityTitle, prompt: t.prompt, answered: t.answered, correctRate: Math.round((100 * t.correct) / t.answered) }))
      .sort((a, b) => a.correctRate - b.correctRate || b.answered - a.answered)
      .slice(0, 10);

    const subjectsTaught = await db
      .selectDistinct({ subject: classSubjects.subject })
      .from(classSubjects)
      .where(eq(classSubjects.schoolId, schoolId));
    const subjectChoices = [
      ...new Set([...subjectsTaught.map((s) => s.subject), ...data.activities.map((a) => a.subject).filter((s): s is string => !!s)]),
    ].sort();

    const report: SchoolReport = {
      period: { days, from: from.toISOString(), to: new Date().toISOString() },
      filters: { classes: data.classRows.map((c) => ({ id: c.id, name: c.name })), subjects: subjectChoices },
      masteryPercent: mastery,
      totals: {
        students: students.length,
        activeStudents: new Set(runs.map((r) => r.userId)).size,
        runs: runs.length,
        finishedRuns: runs.filter((r) => finished(r.status)).length,
        averageScore: mean(scored(runs)),
        masteryRate: masteryOf(runs),
        minutesPlayed: Math.round(runs.reduce((n, r) => n + r.durationSeconds, 0) / 60),
        assignments: inPeriod.length,
        handInRate: rate(
          inPeriod.reduce((n, a) => n + a.handedIn, 0),
          inPeriod.reduce((n, a) => n + a.students, 0)
        ),
        lateHandIns: inPeriod.reduce((n, a) => n + a.late, 0),
      },
      trend,
      classes: perClass,
      activities: perActivity,
      grades,
      questions,
      students: perStudent,
      assignments: assignmentStats,
    };
    sendData(res, report);
  })
);
