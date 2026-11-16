import { z } from "zod";

/** Where a learner is with an activity. */
export const progressStatusSchema = z.enum(["not_started", "in_progress", "completed", "mastered"]);
export type ProgressStatus = z.infer<typeof progressStatusSchema>;

const percent = z.number().nullable();

// ---- the head of school's overview (GET /reports/school/overview) --------------------

export const schoolOverviewSchema = z.object({
  schoolName: z.string(),
  windowDays: z.number().int(),
  counts: z.object({
    students: z.number().int(),
    teachers: z.number().int(),
    classes: z.number().int(),
    subjects: z.number().int(),
    activities: z.number().int(),
  }),
  activeStudents: z.number().int(),
  runsInWindow: z.number().int(),
  averageScore: percent,
  trend: z.array(z.object({ date: z.string(), runs: z.number().int(), finished: z.number().int() })),
  classes: z.array(
    z.object({
      classId: z.string().uuid(),
      className: z.string(),
      students: z.number().int(),
      activeStudents: z.number().int(),
      averageScore: percent,
    })
  ),
  attention: z.array(z.object({ title: z.string(), detail: z.string(), href: z.string() })),
  recentRuns: z.array(
    z.object({
      studentName: z.string(),
      className: z.string().nullable(),
      activityTitle: z.string(),
      status: progressStatusSchema,
      scorePercent: percent,
      playedAt: z.string(),
    })
  ),
});
export type SchoolOverview = z.infer<typeof schoolOverviewSchema>;

// ---- the school's reports (GET /reports/school?days=&classId=&subject=) --------------

export const schoolReportSchema = z.object({
  period: z.object({ days: z.number().int(), from: z.string(), to: z.string() }),
  filters: z.object({
    classes: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
    subjects: z.array(z.string()),
  }),
  masteryPercent: z.number().int(),
  totals: z.object({
    students: z.number().int(),
    activeStudents: z.number().int(),
    runs: z.number().int(),
    finishedRuns: z.number().int(),
    averageScore: percent,
    masteryRate: percent,
    minutesPlayed: z.number().int(),
    assignments: z.number().int(),
    handInRate: percent,
    lateHandIns: z.number().int(),
  }),
  trend: z.array(z.object({ date: z.string(), runs: z.number().int(), finished: z.number().int(), averageScore: percent })),
  classes: z.array(
    z.object({
      classId: z.string().uuid(),
      className: z.string(),
      students: z.number().int(),
      activeStudents: z.number().int(),
      runs: z.number().int(),
      averageScore: percent,
      masteryRate: percent,
      handInRate: percent,
    })
  ),
  activities: z.array(
    z.object({
      activityKey: z.string(),
      title: z.string(),
      subject: z.string().nullable(),
      gradeLevel: z.string(),
      runs: z.number().int(),
      learners: z.number().int(),
      averageScore: percent,
      masteryRate: percent,
      averageMinutes: percent,
    })
  ),
  grades: z.array(z.object({ label: z.string(), min: z.number().int(), count: z.number().int() })),
  questions: z.array(
    z.object({ activityTitle: z.string(), prompt: z.string(), answered: z.number().int(), correctRate: z.number() })
  ),
  students: z.array(
    z.object({
      studentId: z.string().uuid(),
      name: z.string(),
      admissionNumber: z.string().nullable(),
      className: z.string(),
      runs: z.number().int(),
      activities: z.number().int(),
      averageScore: percent,
      bestScore: percent,
      grade: z.string().nullable(),
      lastPlayedAt: z.string().nullable(),
      needsSupport: z.boolean(),
    })
  ),
  assignments: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      className: z.string(),
      teacherName: z.string(),
      dueAt: z.string().nullable(),
      students: z.number().int(),
      handedIn: z.number().int(),
      late: z.number().int(),
      averageScore: percent,
      status: z.string(),
    })
  ),
});
export type SchoolReport = z.infer<typeof schoolReportSchema>;
