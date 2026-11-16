import { z } from "zod";

/** An assignment opens now (or later), and closes at its due time. */
export const assignmentStatusSchema = z.enum(["scheduled", "open", "closed"]);
export type AssignmentStatus = z.infer<typeof assignmentStatusSchema>;

/** What a teacher sends to set an activity for a class (from the app's Assign dialog). */
export const createAssignmentRequestSchema = z.object({
  lessonId: z.string().uuid(),
  classId: z.string().uuid(),
  startsNow: z.boolean().default(true),
  opensAt: z.string().datetime().nullable().optional(),
  durationMinutes: z.number().int().min(5).max(30 * 24 * 60).default(45),
  passThresholdPercent: z.number().int().min(0).max(100).default(70),
  attemptsAllowed: z.number().int().min(0).max(10).default(1),
  timeLimitMinutes: z.number().int().min(1).max(24 * 60).nullable().optional(),
  teacherNote: z.string().trim().max(500).nullable().optional(),
});
export type CreateAssignmentRequest = z.infer<typeof createAssignmentRequestSchema>;

/** One hand-in: a learner's attempt at assigned work, with every question. */
export const handInSchema = z.object({
  id: z.string().uuid(),
  assignmentId: z.string().uuid().nullable(),
  activityKey: z.string(),
  activityTitle: z.string(),
  className: z.string(),
  studentId: z.string().uuid(),
  studentName: z.string(),
  admissionNumber: z.string().nullable(),
  scorePercent: z.number(),
  questionsShown: z.number().int(),
  questionsCorrect: z.number().int(),
  durationSeconds: z.number().int(),
  endReason: z.string().nullable(),
  late: z.boolean(),
  handedInAt: z.string(),
  answers: z.array(
    z.object({ prompt: z.string(), chosen: z.string().nullable(), answer: z.string().nullable(), correct: z.boolean() })
  ),
});
export type HandIn = z.infer<typeof handInSchema>;
