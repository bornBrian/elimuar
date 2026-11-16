import { Router } from "express";
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { assignmentStatusSchema, createAssignmentRequestSchema } from "@elimuar/shared";
import { z } from "zod";
import { db } from "../db/client.js";
import { insertReturning, updateReturning } from "../db/helpers.js";
import { arActivityRuns, classes, lessonAssignments, lessons, studentEnrollments, teacherAssignments, users } from "../db/schema.js";
import { recordAudit } from "../lib/audit.js";
import { HttpError, asyncHandler, parse, sendData } from "../lib/http.js";
import { requireAuth, requireRole, type AuthedRequest } from "../middleware/auth.js";

/** Assignments: a teacher sets an AR activity for one of their classes, with a due time and a number of
   attempts. */

export const deliveryRouter = Router();
deliveryRouter.use(requireAuth);

const STAFF = ["teacher", "school_admin", "academic_master", "secretary", "platform_admin"] as const;

/** The classes whose assignments this person may see: a teacher's own, or the whole school's. */
async function visibleClassIds(auth: NonNullable<AuthedRequest["auth"]>): Promise<string[]> {
  if (auth.role === "teacher") {
    const rows = await db
      .selectDistinct({ classId: teacherAssignments.classId })
      .from(teacherAssignments)
      .where(eq(teacherAssignments.teacherId, auth.userId));
    return rows.map((r) => r.classId);
  }
  if (!auth.schoolId) return [];
  const rows = await db.select({ id: classes.id }).from(classes).where(eq(classes.schoolId, auth.schoolId));
  return rows.map((r) => r.id);
}

async function assignmentRows(classIds: string[]) {
  if (classIds.length === 0) return [];
  const rows = await db
    .select({
      a: lessonAssignments,
      lessonTitle: lessons.title,
      subject: lessons.subject,
      activityKey: lessons.modelKey,
      className: classes.name,
      gradeLevel: classes.gradeLevel,
      assignedByName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
      studentCount: sql<number>`(
        select count(*) from student_enrollments se
        where se.class_id = ${lessonAssignments.classId} and se.status = 'active'
      )`,
      startedCount: sql<number>`(
        select count(distinct r.user_id) from ar_activity_runs r
        where r.assignment_id = ${lessonAssignments.id}
           or (r.class_id = ${lessonAssignments.classId} and r.activity_key = ${lessons.modelKey}
               and r.played_at >= ${lessonAssignments.createdAt})
      )`,
      handedInCount: sql<number>`(
        select count(distinct r.user_id) from ar_activity_runs r
        where r.assignment_id = ${lessonAssignments.id} and r.end_reason is not null
      )`,
      lateCount: sql<number>`(
        select count(distinct r.user_id) from ar_activity_runs r
        where r.assignment_id = ${lessonAssignments.id} and r.end_reason is not null
          and ${lessonAssignments.dueAt} is not null and r.played_at > ${lessonAssignments.dueAt}
      )`,
      averageScore: sql<number | null>`(
        select round(avg(best)) from (
          select max(r.score_percent) best from ar_activity_runs r
          where r.assignment_id = ${lessonAssignments.id} and r.end_reason is not null
          group by r.user_id
        ) b
      )`,
    })
    .from(lessonAssignments)
    .innerJoin(lessons, eq(lessonAssignments.lessonId, lessons.id))
    .innerJoin(classes, eq(lessonAssignments.classId, classes.id))
    .innerJoin(users, eq(lessonAssignments.assignedBy, users.id))
    .where(inArray(lessonAssignments.classId, classIds))
    .orderBy(desc(lessonAssignments.createdAt));

  return rows.map((r) => ({
    id: r.a.id,
    lessonId: r.a.lessonId,
    lessonTitle: r.lessonTitle,
    activityKey: r.activityKey ?? null,
    subject: r.subject,
    classId: r.a.classId,
    className: r.className,
    gradeLevel: r.gradeLevel,
    assignedByName: r.assignedByName,
    status: r.a.status,
    scheduledAt: r.a.scheduledAt ? r.a.scheduledAt.toISOString() : null,
    dueAt: r.a.dueAt ? r.a.dueAt.toISOString() : null,
    passThresholdPercent: r.a.passThresholdPercent,
    attemptsAllowed: r.a.attemptsAllowed,
    timeLimitMinutes: r.a.timeLimitMinutes,
    teacherNote: r.a.teacherNote,
    createdAt: r.a.createdAt.toISOString(),
    studentCount: Number(r.studentCount ?? 0),
    startedCount: Number(r.startedCount ?? 0),
    // Kept under its old names too, which the app's class screen reads.
    completedCount: Number(r.handedInCount ?? 0),
    submittedCount: Number(r.handedInCount ?? 0),
    handedInCount: Number(r.handedInCount ?? 0),
    lateCount: Number(r.lateCount ?? 0),
    averageScore: r.averageScore != null ? Number(r.averageScore) : null,
  }));
}

deliveryRouter.get(
  "/assignments",
  requireRole(...STAFF),
  asyncHandler(async (req: AuthedRequest, res) => {
    sendData(res, await assignmentRows(await visibleClassIds(req.auth!)));
  })
);

deliveryRouter.post(
  "/assignments",
  requireRole(...STAFF),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(createAssignmentRequestSchema, req.body);
    const auth = req.auth!;
    if (!(await visibleClassIds(auth)).includes(body.classId)) {
      throw HttpError.forbidden(auth.role === "teacher" ? "You do not teach that class" : "That class is not at your school");
    }
    const [lesson] = await db.select().from(lessons).where(eq(lessons.id, body.lessonId)).limit(1);
    if (!lesson) throw HttpError.notFound("Activity not found");
    if (lesson.status !== "published") throw HttpError.conflict("Only published activities can be assigned");

    const now = new Date();
    const opensAt = body.startsNow ? now : body.opensAt ? new Date(body.opensAt) : now;
    if (opensAt.getTime() < now.getTime() - 60_000) throw HttpError.badRequest("That start time has already passed.");
    const dueAt = new Date(opensAt.getTime() + body.durationMinutes * 60_000);

    const created = await insertReturning(lessonAssignments, {
      lessonId: body.lessonId,
      classId: body.classId,
      assignedBy: auth.userId,
      status: opensAt.getTime() > now.getTime() + 1_000 ? "scheduled" : "open",
      scheduledAt: opensAt,
      dueAt,
      passThresholdPercent: body.passThresholdPercent,
      attemptsAllowed: body.attemptsAllowed,
      timeLimitMinutes: body.timeLimitMinutes ?? null,
      teacherNote: body.teacherNote ?? null,
    });
    await recordAudit({
      actorId: auth.userId,
      schoolId: auth.schoolId ?? null,
      action: "assignment.create",
      entity: "assignment",
      entityId: created.id,
      metadata: { activity: lesson.title, classId: body.classId },
      ip: req.ip,
    });
    sendData(res, created, 201);
  })
);

deliveryRouter.patch(
  "/assignments/:assignmentId",
  requireRole(...STAFF),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(z.object({ status: assignmentStatusSchema }), req.body);
    const [row] = await db.select().from(lessonAssignments).where(eq(lessonAssignments.id, req.params.assignmentId)).limit(1);
    if (!row || !(await visibleClassIds(req.auth!)).includes(row.classId)) throw HttpError.notFound("Assignment not found");
    const updated = await updateReturning(lessonAssignments, { status: body.status }, eq(lessonAssignments.id, row.id));
    sendData(res, updated);
  })
);

deliveryRouter.delete(
  "/assignments/:assignmentId",
  requireRole(...STAFF),
  asyncHandler(async (req: AuthedRequest, res) => {
    const [row] = await db.select().from(lessonAssignments).where(eq(lessonAssignments.id, req.params.assignmentId)).limit(1);
    if (!row || !(await visibleClassIds(req.auth!)).includes(row.classId)) throw HttpError.notFound("Assignment not found");
    await db.delete(lessonAssignments).where(eq(lessonAssignments.id, row.id));
    sendData(res, { deleted: row.id });
  })
);

deliveryRouter.get(
  "/assignments/me",
  requireRole("student"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const me = req.auth!.userId;
    const enrolled = await db
      .select({ classId: studentEnrollments.classId })
      .from(studentEnrollments)
      .where(and(eq(studentEnrollments.studentId, me), eq(studentEnrollments.status, "active")));
    const classIds = enrolled.map((e) => e.classId);
    if (classIds.length === 0) {
      sendData(res, []);
      return;
    }
    const rows = await db
      .select({
        a: lessonAssignments,
        lessonTitle: lessons.title,
        syllabusCode: lessons.syllabusCode,
        subject: lessons.subject,
        summary: lessons.summary,
        activityKey: lessons.modelKey,
        estimatedMinutes: lessons.estimatedMinutes,
        className: classes.name,
        attemptsUsed: sql<number>`(
          select count(*) from ar_activity_runs r
          where r.assignment_id = ${lessonAssignments.id} and r.user_id = ${me} and r.end_reason is not null
        )`,
        bestScorePercent: sql<number | null>`(
          select max(r.score_percent) from ar_activity_runs r
          where r.assignment_id = ${lessonAssignments.id} and r.user_id = ${me} and r.end_reason is not null
        )`,
      })
      .from(lessonAssignments)
      .innerJoin(lessons, eq(lessonAssignments.lessonId, lessons.id))
      .innerJoin(classes, eq(lessonAssignments.classId, classes.id))
      .where(and(eq(lessons.status, "published"), inArray(lessonAssignments.classId, classIds)))
      .orderBy(asc(lessonAssignments.dueAt));

    sendData(
      res,
      rows.map((r) => ({
        assignmentId: r.a.id,
        lessonId: r.a.lessonId,
        lessonTitle: r.lessonTitle,
        syllabusCode: r.syllabusCode,
        activityKey: r.activityKey ?? null,
        subject: r.subject,
        summary: r.summary,
        estimatedMinutes: r.estimatedMinutes,
        className: r.className,
        dueAt: r.a.dueAt ? r.a.dueAt.toISOString() : null,
        scheduledAt: r.a.scheduledAt ? r.a.scheduledAt.toISOString() : null,
        teacherNote: r.a.teacherNote,
        bestScorePercent: r.bestScorePercent != null ? Math.round(Number(r.bestScorePercent)) : null,
        rules: {
          passThresholdPercent: r.a.passThresholdPercent,
          attemptsAllowed: r.a.attemptsAllowed,
          attemptsUsed: Number(r.attemptsUsed ?? 0),
          timeLimitMinutes: r.a.timeLimitMinutes,
        },
      }))
    );
  })
);

deliveryRouter.get(
  "/assignments/handins",
  requireRole(...STAFF),
  asyncHandler(async (req: AuthedRequest, res) => {
    const classIds = await visibleClassIds(req.auth!);
    if (classIds.length === 0) {
      sendData(res, []);
      return;
    }
    const rows = await db
      .select({
        run: arActivityRuns,
        studentName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
        admissionNumber: studentEnrollments.studentIdentifier,
        title: lessons.title,
        className: classes.name,
        dueAt: lessonAssignments.dueAt,
      })
      .from(arActivityRuns)
      .innerJoin(lessonAssignments, eq(arActivityRuns.assignmentId, lessonAssignments.id))
      .innerJoin(lessons, eq(lessonAssignments.lessonId, lessons.id))
      .innerJoin(classes, eq(lessonAssignments.classId, classes.id))
      .innerJoin(users, eq(arActivityRuns.userId, users.id))
      .leftJoin(
        studentEnrollments,
        and(eq(studentEnrollments.studentId, arActivityRuns.userId), eq(studentEnrollments.classId, lessonAssignments.classId))
      )
      .where(and(inArray(lessonAssignments.classId, classIds), isNotNull(arActivityRuns.endReason)))
      .orderBy(desc(arActivityRuns.playedAt))
      .limit(300);

    sendData(
      res,
      rows.map((r) => ({
        id: r.run.id,
        assignmentId: r.run.assignmentId,
        activityKey: r.run.activityKey,
        activityTitle: r.title,
        className: r.className,
        studentId: r.run.userId,
        studentName: r.studentName,
        admissionNumber: r.admissionNumber ?? null,
        scorePercent: r.run.scorePercent != null ? Number(r.run.scorePercent) : 0,
        questionsShown: r.run.questionsShown,
        questionsCorrect: r.run.questionsCorrect,
        durationSeconds: r.run.durationSeconds,
        endReason: r.run.endReason,
        late: r.dueAt != null && r.run.playedAt > r.dueAt,
        handedInAt: r.run.playedAt.toISOString(),
        answers: r.run.answers ?? [],
      }))
    );
  })
);
