import { z } from "zod";

export const ACTIVITY_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;
export const ACTIVITY_KEY_MAX_LENGTH = 120;

export const activityKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(ACTIVITY_KEY_MAX_LENGTH)
  .regex(ACTIVITY_KEY_PATTERN, "Use lower-case with hyphens, e.g. cross-sections");

export const arActivityStateSchema = z.object({
  activityKey: z.string(),
  archived: z.boolean(),
  updatedAt: z.string(),
});
export type ArActivityState = z.infer<typeof arActivityStateSchema>;

export const arActivityStatesSchema = z.array(arActivityStateSchema);

export const archiveActivityRequestSchema = z.object({
  archived: z.boolean(),
});
export type ArchiveActivityRequest = z.infer<typeof archiveActivityRequestSchema>;

export const archiveActivityResponseSchema = z.object({
  activityKey: z.string(),
  archived: z.boolean(),
  updatedAt: z.string(),
});
export type ArchiveActivityResponse = z.infer<typeof archiveActivityResponseSchema>;

// Reported by the rebuilt Unity activities when a learner finishes a run.
export const activityProgressStatusSchema = z.enum(["in_progress", "completed", "mastered"]);
export type ActivityProgressStatus = z.infer<typeof activityProgressStatusSchema>;

export const activityProgressRequestSchema = z.object({
  status: activityProgressStatusSchema,
  questionsShown: z.number().int().min(0).max(1000).default(0),
  questionsCorrect: z.number().int().min(0).max(1000).default(0),
  durationSeconds: z.number().int().min(0).max(86400).default(0),
  // The activity shell keeps only a percentage per activity, not question
  // counts. When present this is the run's score and takes precedence.
  scorePercent: z.number().int().min(0).max(100).optional(),
  // Sent by the phone, which queues runs played offline and sends them when the network is back.
  runId: z.string().trim().min(1).max(64).optional(),
  reportId: z.string().trim().min(1).max(64).optional(),
  playedAt: z.string().datetime().optional(),
});
export type ActivityProgressRequest = z.infer<typeof activityProgressRequestSchema>;

/** An assigned activity handed in from the phone: at the end, on Exit, when its time ran out, or (if the app
   was closed part-way) on the next launch. */
export const arAssignmentSubmitRequestSchema = z.object({
  runId: z.string().trim().min(1).max(64),
  reportId: z.string().trim().min(1).max(64),
  startedAt: z.string().datetime(),
  playedAt: z.string().datetime(),
  questionsShown: z.number().int().min(0).max(1000),
  questionsCorrect: z.number().int().min(0).max(1000),
  durationSeconds: z.number().int().min(0).max(86400).default(0),
  reason: z.enum(["finished", "exited", "time_up", "app_closed"]).default("finished"),
  items: z
    .array(
      z.object({
        prompt: z.string().trim().max(2000),
        chosen: z.string().trim().max(1000).nullable(),
        answer: z.string().trim().max(1000).nullable(),
        correct: z.boolean(),
      })
    )
    .max(60)
    .default([]),
});
export type ArAssignmentSubmitRequest = z.infer<typeof arAssignmentSubmitRequestSchema>;

export const ACTIVITY_PROGRESS_RANK = {
  not_started: 0,
  in_progress: 1,
  completed: 2,
  mastered: 3,
} as const;

export type ActivityProgressState = {
  status: keyof typeof ACTIVITY_PROGRESS_RANK;
  bestScorePercent: number | null;
  latestScorePercent: number | null;
  questionsShown: number;
  questionsCorrect: number;
  attempts: number;
  lastDurationSeconds: number | null;
};

/** A run's score as a whole percent, or null when it asked no questions. */
export function activityScorePercent(questionsShown: number, questionsCorrect: number): number | null {
  if (questionsShown <= 0) return null;
  return Math.round((100 * questionsCorrect) / questionsShown);
}

/** Fold a newly reported run into the learner's existing record. */
export function mergeActivityProgress(
  existing: ActivityProgressState,
  update: ActivityProgressRequest,
  newRun = true
): ActivityProgressState {
  const score = update.scorePercent ?? activityScorePercent(update.questionsShown, update.questionsCorrect);
  const status =
    ACTIVITY_PROGRESS_RANK[update.status] > ACTIVITY_PROGRESS_RANK[existing.status]
      ? update.status
      : existing.status;
  const best =
    score != null ? Math.max(score, existing.bestScorePercent ?? score) : existing.bestScorePercent;
  return {
    status,
    bestScorePercent: best,
    // A run's opening report has no score yet; it does not erase the last one.
    latestScorePercent: score ?? existing.latestScorePercent,
    questionsShown: Math.max(update.questionsShown, existing.questionsShown),
    questionsCorrect: Math.max(update.questionsCorrect, existing.questionsCorrect),
    attempts: existing.attempts + (newRun ? 1 : 0),
    lastDurationSeconds:
      update.durationSeconds > 0 ? update.durationSeconds : existing.lastDurationSeconds,
  };
}

/** The record a learner's first reported run creates. */
export function initialActivityProgress(update: ActivityProgressRequest): ActivityProgressState {
  const score = update.scorePercent ?? activityScorePercent(update.questionsShown, update.questionsCorrect);
  return {
    status: update.status,
    bestScorePercent: score,
    latestScorePercent: score,
    questionsShown: update.questionsShown,
    questionsCorrect: update.questionsCorrect,
    attempts: 1,
    lastDurationSeconds: update.durationSeconds > 0 ? update.durationSeconds : null,
  };
}

export function isActivityArchived(
  activityKey: string,
  states: Array<Pick<ArActivityState, "activityKey" | "archived">>
): boolean {
  for (const state of states) {
    if (state.activityKey === activityKey) return state.archived;
  }
  return false;
}

export function archivedActivityKeys(
  states: Array<Pick<ArActivityState, "activityKey" | "archived">>
): Set<string> {
  const keys = new Set<string>();
  for (const state of states) {
    if (state.archived) keys.add(state.activityKey);
  }
  return keys;
}
