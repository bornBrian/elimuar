import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  datetime,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  unique,
  varchar,
} from "drizzle-orm/mysql-core";

/** The whole database, as Drizzle tables. */

const uuid = (name: string) => varchar(name, { length: 36 });
const stamp = (name: string) => datetime(name, { mode: "date", fsp: 3 });
const utcNow = sql`(utc_timestamp(3))`;
const longblob = (name: string) =>
  customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "longblob" })(name);

const ROLE_VALUES = ["platform_admin", "school_admin", "academic_master", "secretary", "teacher", "student"] as const;
const MEMBERSHIP_STATUS_VALUES = ["active", "suspended", "transferred", "removed"] as const;
const SCHOOL_STATUS_VALUES = ["active", "suspended", "pending"] as const;
const SCHOOL_LEVEL_VALUES = ["primary", "secondary"] as const;
const ACTIVE_VALUES = ["active", "archived"] as const;
const ENROLLMENT_STATUS_VALUES = ["active", "transferred", "withdrawn", "completed", "removed"] as const;
const LESSON_STATUS_VALUES = ["draft", "in_review", "published", "archived"] as const;
const ASSIGNMENT_STATUS_VALUES = ["scheduled", "open", "closed"] as const;
const PROGRESS_STATUS_VALUES = ["not_started", "in_progress", "completed", "mastered"] as const;
const NOTIFICATION_CHANNEL_VALUES = ["email", "sms"] as const;
const NOTIFICATION_STATUS_VALUES = ["queued", "sent", "failed"] as const;
const AUTHORING_STATUS_VALUES = ["draft", "published", "archived"] as const;

// ---- places ------------------------------------------------------------------------

export const regions = mysqlTable("regions", {
  id: uuid("id").primaryKey().default(sql`(uuid())`),
  name: varchar("name", { length: 120 }).notNull(),
  code: varchar("code", { length: 12 }).notNull().unique(),
  createdAt: stamp("created_at").default(utcNow).notNull(),
});

export const districts = mysqlTable(
  "districts",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    regionId: uuid("region_id")
      .notNull()
      .references(() => regions.id),
    name: varchar("name", { length: 120 }).notNull(),
    createdAt: stamp("created_at").default(utcNow).notNull(),
  },
  (t) => ({ regionIdx: index("districts_region_idx").on(t.regionId) })
);

export const schools = mysqlTable(
  "schools",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    districtId: uuid("district_id")
      .notNull()
      .references(() => districts.id),
    name: varchar("name", { length: 180 }).notNull(),
    code: varchar("code", { length: 24 }).notNull().unique(),
    level: mysqlEnum("level", SCHOOL_LEVEL_VALUES).notNull().default("secondary"),
    status: mysqlEnum("status", SCHOOL_STATUS_VALUES).notNull().default("active"),
    // The score (percent) at which a learner counts as having mastered an activity.
    masteryThresholdPercent: int("mastery_threshold_percent").notNull().default(80),
    // How many days back the overview counts a learner as active.
    engagementWindowDays: int("engagement_window_days").notNull().default(7),
    // The starting PIN given to new learners (empty: each gets a random one).
    defaultPin: varchar("default_pin", { length: 12 }).notNull().default(""),
    // Letter grades for score ranges, highest first: [{ min: 75, label: "A" }, …].
    gradeBands: json("grade_bands").$type<Array<{ min: number; label: string }>>().notNull().default(sql`(('[]'))`),
    createdAt: stamp("created_at").default(utcNow).notNull(),
    updatedAt: stamp("updated_at").default(utcNow).notNull(),
  },
  (t) => ({ districtIdx: index("schools_district_idx").on(t.districtId) })
);

// ---- people ------------------------------------------------------------------------

export const users = mysqlTable(
  "users",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    // Staff sign in with their email. Learners have no email of their own: they
    // sign in with their admission number, and this holds an internal address.
    email: varchar("email", { length: 180 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    firstName: varchar("first_name", { length: 60 }).notNull(),
    lastName: varchar("last_name", { length: 60 }).notNull(),
    phone: varchar("phone", { length: 24 }),
    locale: varchar("locale", { length: 8 }).notNull().default("en"),
    avatarPath: text("avatar_path"),
    lastLoginAt: stamp("last_login_at"),
    pinChangedAt: stamp("pin_changed_at"),
    claimedAt: stamp("claimed_at"),
    createdAt: stamp("created_at").default(utcNow).notNull(),
    updatedAt: stamp("updated_at").default(utcNow).notNull(),
  },
  (t) => ({ phoneIdx: index("users_phone_idx").on(t.phone) })
);

/** A user's role, and the school it is held at (none for platform staff). */
export const memberships = mysqlTable(
  "memberships",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id").references(() => schools.id),
    role: mysqlEnum("role", ROLE_VALUES).notNull(),
    status: mysqlEnum("status", MEMBERSHIP_STATUS_VALUES).notNull().default("active"),
    startedAt: stamp("started_at").default(utcNow).notNull(),
    endedAt: stamp("ended_at"),
  },
  (t) => ({
    userIdx: index("memberships_user_idx").on(t.userId),
    schoolIdx: index("memberships_school_idx").on(t.schoolId),
  })
);

export const refreshTokens = mysqlTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    expiresAt: stamp("expires_at").notNull(),
    revokedAt: stamp("revoked_at"),
    createdAt: stamp("created_at").default(utcNow).notNull(),
  },
  (t) => ({ userIdx: index("refresh_tokens_user_idx").on(t.userId) })
);

export const passwordResetCodes = mysqlTable(
  "password_reset_codes",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: varchar("code_hash", { length: 128 }).notNull(),
    channel: varchar("channel", { length: 10 }).notNull(),
    attempts: int("attempts").notNull().default(0),
    expiresAt: stamp("expires_at").notNull(),
    consumedAt: stamp("consumed_at"),
    createdAt: stamp("created_at").default(utcNow).notNull(),
  },
  (t) => ({ userIdx: index("password_reset_user_idx").on(t.userId) })
);

// ---- teaching ----------------------------------------------------------------------

/** The forms a class can be (Form 1 … Form 4), in order. */
export const gradeLevels = mysqlTable(
  "grade_levels",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    name: varchar("name", { length: 40 }).notNull().unique(),
    position: int("position").notNull().default(0),
    status: mysqlEnum("status", ACTIVE_VALUES).notNull().default("active"),
    createdAt: stamp("created_at").default(utcNow).notNull(),
    updatedAt: stamp("updated_at").default(utcNow).notNull(),
  },
  (t) => ({ positionIdx: index("grade_levels_position_idx").on(t.position) })
);

/** The subject catalogue every school picks from (Biology, Kiswahili, …). */
export const subjects = mysqlTable("subjects", {
  id: uuid("id").primaryKey().default(sql`(uuid())`),
  name: varchar("name", { length: 80 }).notNull().unique(),
  code: varchar("code", { length: 12 }),
  status: mysqlEnum("status", ACTIVE_VALUES).notNull().default("active"),
  createdAt: stamp("created_at").default(utcNow).notNull(),
  updatedAt: stamp("updated_at").default(utcNow).notNull(),
});

/** A class: one form and stream in one year ("Form 1", "Form 2 B"). It has no subject of its own. */
export const classes = mysqlTable(
  "classes",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    gradeLevel: varchar("grade_level", { length: 40 }).notNull(),
    stream: varchar("stream", { length: 12 }),
    academicYear: varchar("academic_year", { length: 9 }).notNull(),
    status: mysqlEnum("status", ACTIVE_VALUES).notNull().default("active"),
    createdAt: stamp("created_at").default(utcNow).notNull(),
    updatedAt: stamp("updated_at").default(utcNow).notNull(),
  },
  (t) => ({
    schoolIdx: index("classes_school_idx").on(t.schoolId),
    uniqueName: unique("classes_school_name_year").on(t.schoolId, t.name, t.academicYear),
  })
);

/** A subject a class studies. */
export const classSubjects = mysqlTable(
  "class_subjects",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    subject: varchar("subject", { length: 80 }).notNull(),
    allStudents: boolean("all_students").notNull().default(true),
    createdAt: stamp("created_at").default(utcNow).notNull(),
  },
  (t) => ({
    schoolIdx: index("class_subjects_school_idx").on(t.schoolId),
    uniqueClassSubject: unique("class_subjects_class_subject").on(t.classId, t.subject),
  })
);

/** The learners who take an optional subject in their class. */
export const studentSubjects = mysqlTable(
  "student_subjects",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    classSubjectId: uuid("class_subject_id")
      .notNull()
      .references(() => classSubjects.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: stamp("created_at").default(utcNow).notNull(),
  },
  (t) => ({ uniqueStudent: unique("student_subjects_unique").on(t.classSubjectId, t.studentId) })
);

/** A learner's place in a class; `studentIdentifier` is the admission number. */
export const studentEnrollments = mysqlTable(
  "student_enrollments",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id")
      .notNull()
      .references(() => schools.id, { onDelete: "cascade" }),
    studentIdentifier: varchar("student_identifier", { length: 40 }),
    guardianPhone: varchar("guardian_phone", { length: 24 }),
    status: mysqlEnum("status", ENROLLMENT_STATUS_VALUES).notNull().default("active"),
    enrolledAt: stamp("enrolled_at").default(utcNow).notNull(),
  },
  (t) => ({
    studentIdx: index("enrollments_student_idx").on(t.studentId),
    classIdx: index("enrollments_class_idx").on(t.classId),
    uniqueStudentClass: unique("enrollments_student_class").on(t.studentId, t.classId),
  })
);

/** Who teaches a subject in a class: one teacher per class and subject. */
export const teacherAssignments = mysqlTable(
  "teacher_assignments",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    subject: varchar("subject", { length: 80 }).notNull(),
    createdAt: stamp("created_at").default(utcNow).notNull(),
  },
  (t) => ({
    teacherIdx: index("teacher_assignments_teacher_idx").on(t.teacherId),
    uniqueClassSubject: unique("teacher_assignments_class_subject").on(t.classId, t.subject),
  })
);

// ---- content -----------------------------------------------------------------------

/** The curriculum record of an AR activity: its title, subject and form. */
export const lessons = mysqlTable(
  "lessons",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    syllabusCode: varchar("syllabus_code", { length: 60 }).notNull().unique(),
    title: varchar("title", { length: 180 }).notNull(),
    summary: text("summary"),
    gradeLevel: varchar("grade_level", { length: 40 }).notNull(),
    subject: varchar("subject", { length: 80 }).notNull(),
    topic: varchar("topic", { length: 120 }).notNull(),
    estimatedMinutes: int("estimated_minutes").notNull().default(20),
    status: mysqlEnum("status", LESSON_STATUS_VALUES).notNull().default("draft"),
    modelKey: varchar("model_key", { length: 60 }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: stamp("created_at").default(utcNow).notNull(),
    updatedAt: stamp("updated_at").default(utcNow).notNull(),
  },
  (t) => ({
    gradeIdx: index("lessons_grade_idx").on(t.gradeLevel),
    statusIdx: index("lessons_status_idx").on(t.status),
  })
);

/** The subject groups the activity library is browsed by (from the content ledger). */
export const arActivitySubjects = mysqlTable("ar_activity_subjects", {
  subjectKey: varchar("subject_key", { length: 60 }).primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  iconObjectKey: varchar("icon_object_key", { length: 255 }),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: stamp("created_at").default(utcNow).notNull(),
});

/** An AR activity: its Unity bundle and thumbnail (files in the asset store), what the library shows about
   it, and its manifest (activity.json). */
export const arActivities = mysqlTable(
  "ar_activities",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    activityKey: varchar("activity_key", { length: 60 }).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    category: varchar("category", { length: 60 }).notNull(),
    subject: varchar("subject", { length: 80 }),
    tags: json("tags").$type<string[]>(),
    credits: text("credits"),
    trackingStyle: varchar("tracking_style", { length: 20 }).notNull().default("AR"),
    minUsers: int("min_users").notNull().default(1),
    maxUsers: int("max_users").notNull().default(1),
    bundleName: varchar("bundle_name", { length: 120 }).notNull(),
    bundleVersion: int("bundle_version").notNull(),
    version: varchar("version", { length: 20 }).notNull(),
    buildNumber: int("build_number").notNull().default(0),
    minimumShellVersion: varchar("minimum_shell_version", { length: 20 }).notNull().default("0.12.21"),
    hasScore: boolean("has_score").notNull().default(true),
    gradeLevel: varchar("grade_level", { length: 120 }).notNull().default("Form 2"),
    bundleObjectKey: varchar("bundle_object_key", { length: 255 }).notNull(),
    bundleSizeBytes: bigint("bundle_size_bytes", { mode: "number" }).notNull(),
    thumbnailObjectKey: varchar("thumbnail_object_key", { length: 255 }),
    manifest: json("manifest").$type<Record<string, unknown>>(),
    status: mysqlEnum("status", AUTHORING_STATUS_VALUES).notNull().default("published"),
    sortOrder: int("sort_order").notNull().default(0),
    lessonId: uuid("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: stamp("created_at").default(utcNow).notNull(),
    updatedAt: stamp("updated_at").default(utcNow).notNull(),
  },
  (t) => ({
    uniqueKey: unique("ar_activities_key").on(t.activityKey),
    statusIdx: index("ar_activities_status_idx").on(t.status),
  })
);

// ---- learning ----------------------------------------------------------------------

/** Work a teacher sets: one activity (its lesson) for one class, with its rules. */
export const lessonAssignments = mysqlTable(
  "lesson_assignments",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    assignedBy: uuid("assigned_by")
      .notNull()
      .references(() => users.id),
    status: mysqlEnum("status", ASSIGNMENT_STATUS_VALUES).notNull().default("open"),
    scheduledAt: stamp("scheduled_at"),
    dueAt: stamp("due_at"),
    passThresholdPercent: int("pass_threshold_percent").notNull().default(70),
    attemptsAllowed: int("attempts_allowed").notNull().default(1),
    timeLimitMinutes: int("time_limit_minutes"),
    teacherNote: text("teacher_note"),
    createdAt: stamp("created_at").default(utcNow).notNull(),
  },
  (t) => ({
    classIdx: index("assignments_class_idx").on(t.classId),
    lessonIdx: index("assignments_lesson_idx").on(t.lessonId),
  })
);

/** One play of one activity by one learner, as the phone reports it. */
export const arActivityRuns = mysqlTable(
  "ar_activity_runs",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    runId: varchar("run_id", { length: 64 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id").references(() => schools.id, { onDelete: "set null" }),
    classId: uuid("class_id").references(() => classes.id, { onDelete: "set null" }),
    activityKey: varchar("activity_key", { length: 60 }).notNull(),
    assignmentId: uuid("assignment_id").references(() => lessonAssignments.id, { onDelete: "set null" }),
    status: mysqlEnum("status", PROGRESS_STATUS_VALUES).notNull().default("in_progress"),
    questionsShown: int("questions_shown").notNull().default(0),
    questionsCorrect: int("questions_correct").notNull().default(0),
    scorePercent: decimal("score_percent", { precision: 5, scale: 2 }),
    durationSeconds: int("duration_seconds").notNull().default(0),
    // How a hand-in ended: finished, exited, time_up or app_closed.
    endReason: varchar("end_reason", { length: 20 }),
    answers: json("answers").$type<Array<{ prompt: string; chosen: string | null; answer: string | null; correct: boolean }>>(),
    startedAt: stamp("started_at"),
    playedAt: stamp("played_at").notNull(),
    createdAt: stamp("created_at").default(utcNow).notNull(),
    updatedAt: stamp("updated_at").default(utcNow).notNull(),
  },
  (t) => ({
    uniqueRun: unique("ar_activity_runs_user_run").on(t.userId, t.runId),
    schoolIdx: index("ar_activity_runs_school_idx").on(t.schoolId, t.playedAt),
    classIdx: index("ar_activity_runs_class_idx").on(t.classId),
    assignmentIdx: index("ar_activity_runs_assignment_idx").on(t.assignmentId),
  })
);

/** Each learner's summary per activity: status, best and latest score, runs. Also the library's "archived" flag. */
export const arActivityStates = mysqlTable(
  "ar_activity_states",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityKey: varchar("activity_key", { length: 120 }).notNull(),
    archived: boolean("archived").notNull().default(false),
    status: mysqlEnum("status", PROGRESS_STATUS_VALUES).notNull().default("not_started"),
    bestScorePercent: decimal("best_score_percent", { precision: 5, scale: 2 }),
    latestScorePercent: decimal("latest_score_percent", { precision: 5, scale: 2 }),
    questionsShown: int("questions_shown").notNull().default(0),
    questionsCorrect: int("questions_correct").notNull().default(0),
    attempts: int("attempts").notNull().default(0),
    lastPlayedAt: stamp("last_played_at"),
    lastDurationSeconds: int("last_duration_seconds"),
    // The phone's last run and report ids: a resent report must not count twice.
    lastRunId: varchar("last_run_id", { length: 64 }),
    lastReportId: varchar("last_report_id", { length: 64 }),
    createdAt: stamp("created_at").default(utcNow).notNull(),
    updatedAt: stamp("updated_at").default(utcNow).notNull(),
  },
  (t) => ({
    uniqueActivity: unique("ar_activity_states_user_activity").on(t.userId, t.activityKey),
  })
);

// ---- platform ----------------------------------------------------------------------

/** Who did what, when: every change made through the API. */
export const auditEvents = mysqlTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    schoolId: uuid("school_id").references(() => schools.id, { onDelete: "set null" }),
    action: varchar("action", { length: 80 }).notNull(),
    entity: varchar("entity", { length: 60 }).notNull(),
    entityId: varchar("entity_id", { length: 60 }),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    ip: varchar("ip", { length: 60 }),
    createdAt: stamp("created_at").default(utcNow).notNull(),
  },
  (t) => ({ createdIdx: index("audit_events_created_idx").on(t.createdAt) })
);

/** Emails and SMS waiting to go out (and the record of those sent). */
export const notifications = mysqlTable(
  "notifications",
  {
    id: uuid("id").primaryKey().default(sql`(uuid())`),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    schoolId: uuid("school_id").references(() => schools.id, { onDelete: "set null" }),
    channel: mysqlEnum("channel", NOTIFICATION_CHANNEL_VALUES).notNull(),
    purpose: varchar("purpose", { length: 40 }).notNull(),
    toAddress: varchar("to_address", { length: 180 }).notNull(),
    subject: varchar("subject", { length: 200 }),
    body: text("body").notNull(),
    status: mysqlEnum("status", NOTIFICATION_STATUS_VALUES).notNull().default("queued"),
    error: text("error"),
    sentAt: stamp("sent_at"),
    readAt: stamp("read_at"),
    createdAt: stamp("created_at").default(utcNow).notNull(),
  },
  (t) => ({ createdIdx: index("notifications_created_idx").on(t.createdAt) })
);

/** The platform's own branding (its logo). */
export const platformSettings = mysqlTable("platform_settings", {
  id: uuid("id").primaryKey().default(sql`(uuid())`),
  logoPath: text("logo_path"),
  logoMime: varchar("logo_mime", { length: 80 }),
  logoData: longblob("logo_data"),
  logoUpdatedAt: stamp("logo_updated_at"),
  updatedAt: stamp("updated_at").default(utcNow).notNull(),
});
