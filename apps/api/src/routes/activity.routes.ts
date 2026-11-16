import { Router } from "express";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import {
  ERROR_CODES,
  activityKeySchema,
  activityProgressRequestSchema,
  activityScorePercent,
  arAssignmentSubmitRequestSchema,
  archiveActivityRequestSchema,
  initialActivityProgress,
  mergeActivityProgress,
  type ActivityProgressRequest,
  type ActivityProgressState,
} from "@elimuar/shared";
import { db } from "../db/client.js";
import { insertReturning, updateReturning } from "../db/helpers.js";
import { arActivityRuns, arActivityStates, lessonAssignments, lessons, studentEnrollments } from "../db/schema.js";
import { HttpError, asyncHandler, parse, sendData } from "../lib/http.js";
import { requireAuth, requireRole, type AuthedRequest } from "../middleware/auth.js";

/** What the phone reports about learners playing activities. */

function storedProgress(row: typeof arActivityStates.$inferSelect): ActivityProgressState {
  return {
    status: row.status,
    bestScorePercent: row.bestScorePercent != null ? Number(row.bestScorePercent) : null,
    latestScorePercent: row.latestScorePercent != null ? Number(row.latestScorePercent) : null,
    questionsShown: row.questionsShown,
    questionsCorrect: row.questionsCorrect,
    attempts: row.attempts,
    lastDurationSeconds: row.lastDurationSeconds,
  };
}

/** The phone's time for a run, kept within reason (not in the future, not over a year old). */
function reportedTime(reported: string | undefined): Date {
  const now = Date.now();
  let at = reported ? Date.parse(reported) : now;
  if (!Number.isFinite(at) || at > now || at < now - 366 * 86_400_000) at = now;
  return new Date(at);
}

function progressColumns(state: ActivityProgressState, lastPlayedAt: Date) {
  return {
    status: state.status,
    bestScorePercent: state.bestScorePercent != null ? state.bestScorePercent.toFixed(2) : null,
    latestScorePercent: state.latestScorePercent != null ? state.latestScorePercent.toFixed(2) : null,
    questionsShown: state.questionsShown,
    questionsCorrect: state.questionsCorrect,
    attempts: state.attempts,
    lastPlayedAt,
    lastDurationSeconds: state.lastDurationSeconds,
  };
}

/** The learner's current class, which a run is counted under. */
async function currentClass(userId: string) {
  const [row] = await db
    .select({ classId: studentEnrollments.classId, schoolId: studentEnrollments.schoolId })
    .from(studentEnrollments)
    .where(and(eq(studentEnrollments.studentId, userId), eq(studentEnrollments.status, "active")))
    .limit(1);
  return row ?? null;
}

interface RunExtras {
  assignmentId?: string | null;
  startedAt?: Date | null;
  endReason?: string | null;
  answers?: Array<{ prompt: string; chosen: string | null; answer: string | null; correct: boolean }> | null;
}

/** Writes the run's row, creating it the first time its runId is seen. */
async function recordRun(userId: string, activityKey: string, body: ActivityProgressRequest, extras: RunExtras = {}) {
  const runId = body.runId ?? `report-${body.reportId ?? Date.now()}`;
  const placed = await currentClass(userId);
  const percent = activityScorePercent(body.questionsShown, body.questionsCorrect);
  const columns = {
    status: body.status,
    questionsShown: body.questionsShown,
    questionsCorrect: body.questionsCorrect,
    scorePercent: body.questionsShown > 0 && percent != null ? percent.toFixed(2) : null,
    durationSeconds: body.durationSeconds ?? 0,
    playedAt: reportedTime(body.playedAt),
    ...(extras.assignmentId ? { assignmentId: extras.assignmentId } : {}),
    ...(extras.startedAt ? { startedAt: extras.startedAt } : {}),
    ...(extras.endReason ? { endReason: extras.endReason } : {}),
    ...(extras.answers ? { answers: extras.answers } : {}),
  };
  const [existing] = await db
    .select({ id: arActivityRuns.id, status: arActivityRuns.status })
    .from(arActivityRuns)
    .where(and(eq(arActivityRuns.userId, userId), eq(arActivityRuns.runId, runId)))
    .limit(1);
  if (existing) {
    // A run's end is never overwritten by its own (late-arriving) start.
    if (body.status === "in_progress" && existing.status !== "in_progress") return;
    await db.update(arActivityRuns).set({ ...columns, updatedAt: new Date() }).where(eq(arActivityRuns.id, existing.id));
    return;
  }
  await insertReturning(arActivityRuns, {
    runId,
    userId,
    activityKey,
    schoolId: placed?.schoolId ?? null,
    classId: placed?.classId ?? null,
    ...columns,
  });
}

/** Folds one report into the learner's summary row for the activity. */
async function recordProgress(userId: string, activityKey: string, body: ActivityProgressRequest, extras: RunExtras = {}) {
  const [existing] = await db
    .select()
    .from(arActivityStates)
    .where(and(eq(arActivityStates.userId, userId), eq(arActivityStates.activityKey, activityKey)))
    .limit(1);

  if (existing && body.reportId != null && body.reportId === existing.lastReportId) return { row: existing, created: false };
  await recordRun(userId, activityKey, body, extras);

  const played = reportedTime(body.playedAt);
  if (existing) {
    const newRun = body.runId == null || body.runId !== existing.lastRunId;
    const lastPlayed = existing.lastPlayedAt && existing.lastPlayedAt > played ? existing.lastPlayedAt : played;
    const row = await updateReturning(
      arActivityStates,
      {
        ...progressColumns(mergeActivityProgress(storedProgress(existing), body, newRun), lastPlayed),
        lastRunId: body.runId ?? null,
        lastReportId: body.reportId ?? null,
        updatedAt: new Date(),
      },
      eq(arActivityStates.id, existing.id)
    );
    if (!row) throw new HttpError(500, ERROR_CODES.INTERNAL, "The activity progress could not be read back.");
    return { row, created: false };
  }

  const row = await insertReturning(arActivityStates, {
    userId,
    activityKey,
    archived: false,
    ...progressColumns(initialActivityProgress(body), played),
    lastRunId: body.runId ?? null,
    lastReportId: body.reportId ?? null,
  });
  return { row, created: true };
}

export const activityRouter = Router();
activityRouter.use(requireAuth);

activityRouter.get(
  "/activities/states",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await db.select().from(arActivityStates).where(eq(arActivityStates.userId, req.auth!.userId));
    sendData(
      res,
      rows.map((row) => ({ activityKey: row.activityKey, archived: row.archived, updatedAt: row.updatedAt.toISOString() }))
    );
  })
);

activityRouter.post(
  "/activities/:activityKey/archive",
  asyncHandler(async (req: AuthedRequest, res) => {
    const activityKey = parse(activityKeySchema, req.params.activityKey);
    const body = parse(archiveActivityRequestSchema, req.body);
    await db
      .insert(arActivityStates)
      .values({ userId: req.auth!.userId, activityKey, archived: body.archived })
      .onDuplicateKeyUpdate({ set: { archived: body.archived, updatedAt: new Date() } });
    sendData(res, { activityKey, archived: body.archived, updatedAt: new Date().toISOString() });
  })
);

activityRouter.post(
  "/activities/:activityKey/progress",
  asyncHandler(async (req: AuthedRequest, res) => {
    const activityKey = parse(activityKeySchema, req.params.activityKey);
    const body = parse(activityProgressRequestSchema, req.body);
    if (body.questionsCorrect > body.questionsShown) {
      throw HttpError.badRequest("Correct answers cannot exceed the questions shown.");
    }
    const { row, created } = await recordProgress(req.auth!.userId, activityKey, body);
    sendData(
      res,
      {
        activityKey,
        status: row.status,
        bestScorePercent: row.bestScorePercent != null ? Number(row.bestScorePercent) : null,
        latestScorePercent: row.latestScorePercent != null ? Number(row.latestScorePercent) : null,
        attempts: row.attempts,
        updatedAt: row.updatedAt.toISOString(),
      },
      created ? 201 : 200
    );
  })
);

/** Assigned work handed in from the phone. */
activityRouter.post(
  "/activities/:activityKey/assignments/:assignmentId/submit",
  requireRole("student"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const activityKey = parse(activityKeySchema, req.params.activityKey);
    const body = parse(arAssignmentSubmitRequestSchema, req.body);
    const studentId = req.auth!.userId;
    if (body.questionsCorrect > body.questionsShown) {
      throw HttpError.badRequest("Correct answers cannot exceed the questions shown.");
    }
    const percent = activityScorePercent(body.questionsShown, body.questionsCorrect) ?? 0;

    const [already] = await db
      .select({ id: arActivityRuns.id })
      .from(arActivityRuns)
      .where(and(eq(arActivityRuns.userId, studentId), eq(arActivityRuns.runId, body.runId), isNotNull(arActivityRuns.endReason)))
      .limit(1);
    if (already) {
      sendData(res, { submitted: true, duplicate: true, scorePercent: percent });
      return;
    }

    const [found] = await db
      .select({ a: lessonAssignments, activityKey: lessons.modelKey })
      .from(lessonAssignments)
      .innerJoin(lessons, eq(lessonAssignments.lessonId, lessons.id))
      .where(eq(lessonAssignments.id, req.params.assignmentId))
      .limit(1);
    if (!found || found.activityKey !== activityKey) throw HttpError.notFound("Assignment not found");
    const assignment = found.a;

    const [enrolled] = await db
      .select({ classId: studentEnrollments.classId })
      .from(studentEnrollments)
      .where(
        and(
          eq(studentEnrollments.studentId, studentId),
          eq(studentEnrollments.classId, assignment.classId),
          eq(studentEnrollments.status, "active")
        )
      )
      .limit(1);
    if (!enrolled) throw HttpError.forbidden("This assignment is not for your class");

    const startedAt = reportedTime(body.startedAt);
    const finishedAt = new Date(Math.max(startedAt.getTime(), reportedTime(body.playedAt).getTime()));
    if (assignment.dueAt && startedAt > assignment.dueAt) {
      throw HttpError.conflict("This attempt began after the assignment was due.");
    }

    const [counted] = await db
      .select({ used: sql<number>`count(*)` })
      .from(arActivityRuns)
      .where(
        and(
          eq(arActivityRuns.userId, studentId),
          eq(arActivityRuns.assignmentId, assignment.id),
          isNotNull(arActivityRuns.endReason)
        )
      );
    const used = Number(counted?.used ?? 0);
    if (assignment.attemptsAllowed > 0 && used >= assignment.attemptsAllowed) {
      throw HttpError.conflict(
        assignment.attemptsAllowed === 1
          ? "You have used your only attempt for this assignment"
          : `You have used all ${assignment.attemptsAllowed} attempts for this assignment`
      );
    }

    await recordProgress(
      studentId,
      activityKey,
      {
        status: body.questionsShown > 0 && body.questionsCorrect === body.questionsShown ? "mastered" : "completed",
        questionsShown: body.questionsShown,
        questionsCorrect: body.questionsCorrect,
        durationSeconds: body.durationSeconds,
        runId: body.runId,
        reportId: body.reportId,
        playedAt: finishedAt.toISOString(),
      },
      { assignmentId: assignment.id, startedAt, endReason: body.reason, answers: body.items }
    );

    sendData(
      res,
      { submitted: true, scorePercent: percent, attemptsUsed: used + 1, attemptsAllowed: assignment.attemptsAllowed },
      201
    );
  })
);
