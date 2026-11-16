import { z } from "zod";

/** The AR activity catalogue, in the activity shell's own ledger format. */

/** Activity ids are the shell's own (`circulatorysystem`, `humaneye`). */
export const arActivityKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, '-' or '_' only");

/** Bundle base names are used to build `<bundle>_android_v<NNN>.bundle`. */
export const arBundleNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[A-Za-z0-9_.-]+$/, "Use letters, digits, '.', '-' or '_' only");

export const ledgerActivitySchema = z.object({
  activityID: arActivityKeySchema,
  activityTitle: z.string().min(1).max(180),
  activityDescription: z.string().default(""),
  activityThumbnail: z.string().default(""),
  activityCategory: z.string().min(1).max(60),
  activityCredits: z.string().default(""),
  activityTags: z.array(z.string()).default([]),
  activityTrackingStyle: z.string().default("AR"),
  minUsers: z.number().int().min(1).default(1),
  maxUsers: z.number().int().min(1).default(1),
  bundle: arBundleNameSchema,
  bundleVersion: z.number().int().min(0),
  version: z.string().min(1).max(20),
  buildNumber: z.number().int().default(0),
  minimumShellVersion: z.string().default("0.12.21"),
  installState: z.string().default("NotInstalled"),
  fileSize: z.number().int().min(0),
  hasScore: z.boolean().default(true),
});
export type LedgerActivity = z.infer<typeof ledgerActivitySchema>;

export const ledgerSubjectSchema = z.object({
  subjectID: z.string().min(1).max(60),
  subjectName: z.string().min(1).max(120),
  subjectIconLarge: z.string().default(""),
  subjectIconMedium: z.string().default(""),
  subjectIconSmall: z.string().default(""),
});
export type LedgerSubject = z.infer<typeof ledgerSubjectSchema>;

export const activityLedgerSchema = z.object({
  ledgerFileVersion: z.string().default("0.0.4"),
  latestShellVersion: z.string().default("0.12.84"),
  minimumShellVersion: z.string().default("0.8.64"),
  activityInfoVersion: z.string().default("0.0.2"),
  bundleDownloadDirectory: z.string().default(""),
  androidStoreLink: z.string().default(""),
  iosStoreLink: z.string().default(""),
  privacyPolicyLink: z.string().default(""),
  termsAndConditionsLink: z.string().default(""),
  activityLedger: z.array(ledgerActivitySchema),
  activitySubjects: z.array(ledgerSubjectSchema).default([]),
});
export type ActivityLedger = z.infer<typeof activityLedgerSchema>;

/** The file name the shell downloads for a bundle at a version. */
export function bundleFileName(bundle: string, bundleVersion: number): string {
  return `${bundle}_android_v${String(bundleVersion).padStart(3, "0")}.bundle`;
}

/** The last path segment of a URL or path (the shell's thumbnails are URLs). */
export function urlFileName(url: string): string {
  const clean = url.split("?")[0] ?? "";
  return clean.substring(clean.lastIndexOf("/") + 1);
}

/** Placeholder the API writes in front of every file URL in the ledger. */
export const LEDGER_BASE_PLACEHOLDER = "{{ELIMUAR_CONTENT_BASE}}";

export const arActivityStatusSchema = z.enum(["draft", "published", "archived"]);
export type ArActivityStatus = z.infer<typeof arActivityStatusSchema>;

/** One catalogue row as the web console reads it. */
export const arActivitySummarySchema = z.object({
  id: z.string(),
  activityKey: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  category: z.string(),
  subjectName: z.string().nullable(),
  tags: z.array(z.string()),
  gradeLevel: z.string(),
  bundleName: z.string(),
  bundleVersion: z.number().int(),
  bundleFile: z.string(),
  version: z.string(),
  bundleSizeBytes: z.number().int(),
  hasScore: z.boolean(),
  minUsers: z.number().int(),
  maxUsers: z.number().int(),
  status: arActivityStatusSchema,
  thumbnailUrl: z.string().nullable(),
  lessonId: z.string().nullable(),
  updatedAt: z.string(),
  preview: z
    .object({
      title: z.string(),
      description: z.string(),
      captions: z.array(z.object({ duration: z.number(), text: z.string() })),
      audioUrl: z.string().nullable(),
      videoUrl: z.string().nullable(),
    })
    .optional(),
});
export type ArActivitySummary = z.infer<typeof arActivitySummarySchema>;

/** Metadata sent with an uploaded bundle (multipart field `metadata`). */
export const arActivityUploadSchema = z.object({
  activityKey: arActivityKeySchema,
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(4000).default(""),
  category: z.string().trim().min(1).max(60),
  tags: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  /** The school subject it is taught under (Biology, Chemistry...). */
  subject: z.string().trim().min(1).max(80).optional(),
  /** One or more forms, comma separated ("Form 1, Form 2"). */
  gradeLevel: z.string().trim().min(1).max(120).default("Form 2"),
  bundleName: arBundleNameSchema,
  bundleVersion: z.number().int().min(0).max(9999),
  version: z.string().trim().min(1).max(20).optional(),
  hasScore: z.boolean().default(true),
  minUsers: z.number().int().min(1).max(40).default(1),
  maxUsers: z.number().int().min(1).max(40).default(1),
  trackingStyle: z.string().trim().max(20).default("AR"),
  status: arActivityStatusSchema.default("published"),
});
export type ArActivityUpload = z.infer<typeof arActivityUploadSchema>;

export const arActivityUpdateSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  description: z.string().trim().max(4000).optional(),
  subject: z.string().trim().min(1).max(80).optional(),
  gradeLevel: z.string().trim().min(1).max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  status: arActivityStatusSchema.optional(),
});
export type ArActivityUpdate = z.infer<typeof arActivityUpdateSchema>;

/** One learner's record on one activity, for a teacher's class view. */
export const arActivityProgressRowSchema = z.object({
  studentId: z.string(),
  studentName: z.string(),
  studentIdentifier: z.string().nullable(),
  activityKey: z.string(),
  status: z.string(),
  bestScorePercent: z.number().nullable(),
  latestScorePercent: z.number().nullable(),
  attempts: z.number().int(),
  lastPlayedAt: z.string().nullable(),
});
export type ArActivityProgressRow = z.infer<typeof arActivityProgressRowSchema>;
