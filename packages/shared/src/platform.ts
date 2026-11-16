import { z } from "zod";
import { academicClassSchema, academicSubjectSchema } from "./academic.js";

export const brandingSchema = z.object({
  logoUrl: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type Branding = z.infer<typeof brandingSchema>;

export const notificationChannelSchema = z.enum(["email", "sms"]);
export const notificationStatusSchema = z.enum(["queued", "sent", "failed"]);

export const notificationSchema = z.object({
  id: z.string().uuid(),
  channel: notificationChannelSchema,
  purpose: z.string(),
  toAddress: z.string(),
  subject: z.string().nullable(),
  body: z.string(),
  status: notificationStatusSchema,
  error: z.string().nullable(),
  createdAt: z.string(),
  sentAt: z.string().nullable(),
  readAt: z.string().nullable(),
  recipientName: z.string().nullable(),
  schoolName: z.string().nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;

export const markNotificationsReadRequestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200).optional(),
});
export type MarkNotificationsReadRequest = z.infer<typeof markNotificationsReadRequestSchema>;

export const markNotificationsReadResultSchema = z.object({
  marked: z.number().int(),
});
export type MarkNotificationsReadResult = z.infer<typeof markNotificationsReadResultSchema>;

export const platformSeriesSchema = z.object({
  key: z.string(),
  label: z.string(),
  color: z.string(),
  values: z.array(z.number()),
});
export type PlatformSeries = z.infer<typeof platformSeriesSchema>;

export const platformAttentionSchema = z.object({
  id: z.string(),
  count: z.number().int(),
  title: z.string(),
  detail: z.string(),
  href: z.string(),
});
export type PlatformAttention = z.infer<typeof platformAttentionSchema>;

export const platformOnboardingSchema = z.object({
  key: z.string(),
  label: z.string(),
  activated: z.number().int(),
  total: z.number().int(),
  pending: z.number().int(),
});
export type PlatformOnboarding = z.infer<typeof platformOnboardingSchema>;

export const platformTrendSchema = z.object({
  delta: z.number().int(),
  previous: z.number().int(),
  points: z.array(z.number().int()),
});
export type PlatformTrend = z.infer<typeof platformTrendSchema>;

export const platformDashboardSchema = z.object({
  periodDays: z.number().int(),
  activityLabels: z.array(z.string()),
  activity: z.array(platformSeriesSchema),
  trends: z.object({
    schools: platformTrendSchema,
    students: platformTrendSchema,
    teachers: platformTrendSchema,
    content: platformTrendSchema,
  }),
  schools: z.object({
    total: z.number().int(),
    active: z.number().int(),
    suspended: z.number().int(),
    pending: z.number().int(),
  }),
  students: z.object({ total: z.number().int(), active: z.number().int(), pending: z.number().int() }),
  teachers: z.object({ total: z.number().int(), active: z.number().int(), pending: z.number().int() }),
  content: z.object({
    total: z.number().int(),
    published: z.number().int(),
    draft: z.number().int(),
    needsReview: z.number().int(),
  }),
  needsAttention: z.array(platformAttentionSchema),
  onboarding: z.array(platformOnboardingSchema),
  bySubject: z.array(z.object({ subject: z.string(), count: z.number().int() })),
  academic: z.object({
    classes: z.number().int(),
    subjects: z.number().int(),
    formsCovered: z.string(),
    topSubjects: z.array(z.object({ subject: z.string(), value: z.number().int() })),
  }),
});
export type PlatformDashboard = z.infer<typeof platformDashboardSchema>;

export const platformContentItemSchema = z.object({
  lessonId: z.string().uuid(),
  title: z.string(),
  subject: z.string(),
  gradeLevel: z.string(),
  topic: z.string(),
  status: z.string(),
  summary: z.string().nullable(),
  syllabusCode: z.string(),
  assetId: z.string().uuid().nullable(),
  assetName: z.string().nullable(),
  modelKey: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
  anchor: z.string().nullable(),
  bundleReady: z.boolean(),
  nodeCount: z.number().int(),
  stepCount: z.number().int(),
  questionCount: z.number().int(),
  uploadedAt: z.string(),
  uploadedBy: z.string().nullable(),
  runs: z.number().int(),
  completed: z.number().int(),
});
export type PlatformContentItem = z.infer<typeof platformContentItemSchema>;

export const platformContentSchema = z.object({
  items: z.array(platformContentItemSchema),
  total: z.number().int(),
  subjects: z.array(z.string()),
  grades: z.array(z.string()),
});
export type PlatformContent = z.infer<typeof platformContentSchema>;

export const platformLogSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  actorName: z.string().nullable(),
  actorRole: z.string().nullable(),
  action: z.string(),
  actionLabel: z.string(),
  detail: z.string(),
  schoolName: z.string().nullable(),
  ip: z.string().nullable(),
});
export type PlatformLog = z.infer<typeof platformLogSchema>;

export const platformLogPageSchema = z.object({
  rows: z.array(platformLogSchema),
  total: z.number().int(),
  actions: z.array(z.object({ key: z.string(), label: z.string() })),
});
export type PlatformLogPage = z.infer<typeof platformLogPageSchema>;

export const platformClassSchema = z.object({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  schoolName: z.string(),
  name: z.string(),
  gradeLevel: z.string(),
  stream: z.string().nullable(),
  subjectCount: z.number().int(),
  academicYear: z.string(),
  status: z.string(),
  studentCount: z.number().int(),
  teacherNames: z.array(z.string()),
});
export type PlatformClass = z.infer<typeof platformClassSchema>;

export const platformAcademicSchema = z.object({
  classes: z.array(academicClassSchema),
  subjects: z.array(academicSubjectSchema),
});
export type PlatformAcademic = z.infer<typeof platformAcademicSchema>;

export const platformSchoolSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  regionName: z.string(),
  districtName: z.string(),
  level: z.string(),
  status: z.string(),
  headName: z.string().nullable(),
  headEmail: z.string().nullable(),
  studentCount: z.number().int(),
  teacherCount: z.number().int(),
  classCount: z.number().int(),
  lastActivityAt: z.string().nullable(),
});
export type PlatformSchool = z.infer<typeof platformSchoolSchema>;

export const platformSchoolListSchema = z.object({
  rows: z.array(platformSchoolSchema),
  total: z.number().int(),
  active: z.number().int(),
  inactive: z.number().int(),
  pendingSetup: z.number().int(),
  recent: z.array(z.object({ id: z.string(), title: z.string(), detail: z.string(), at: z.string() })),
});
export type PlatformSchoolList = z.infer<typeof platformSchoolListSchema>;

export const platformSchoolMemberSchema = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid(),
  fullName: z.string(),
  email: z.string(),
  role: z.string(),
  status: z.string(),
  lastLoginAt: z.string().nullable(),
  claimedAt: z.string().nullable(),
});
export type PlatformSchoolMember = z.infer<typeof platformSchoolMemberSchema>;

export const platformSchoolDetailSchema = z.object({
  school: platformSchoolSchema,
  classes: z.array(platformClassSchema),
  members: z.array(platformSchoolMemberSchema),
  content: z.array(
    z.object({
      lessonId: z.string().uuid(),
      title: z.string(),
      subject: z.string(),
      gradeLevel: z.string(),
      runs: z.number().int(),
      students: z.number().int(),
      lastRunAt: z.string().nullable(),
    })
  ),
  recent: z.array(z.object({ id: z.string(), title: z.string(), detail: z.string(), at: z.string() })),
});
export type PlatformSchoolDetail = z.infer<typeof platformSchoolDetailSchema>;

export const platformUserSchema = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid(),
  fullName: z.string(),
  email: z.string(),
  role: z.string(),
  status: z.string(),
  schoolId: z.string().uuid().nullable(),
  schoolName: z.string().nullable(),
  className: z.string().nullable(),
  // Learners have no email of their own: they are known by admission number.
  admissionNumber: z.string().nullable().default(null),
  lastLoginAt: z.string().nullable(),
  awaitingRegistration: z.boolean(),
});
export type PlatformUser = z.infer<typeof platformUserSchema>;

export const platformUserListSchema = z.object({
  rows: z.array(platformUserSchema),
  counts: z.object({
    all: z.number().int(),
    schoolHead: z.number().int(),
    teacher: z.number().int(),
    student: z.number().int(),
  }),
});
export type PlatformUserList = z.infer<typeof platformUserListSchema>;
