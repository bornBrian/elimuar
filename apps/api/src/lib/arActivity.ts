import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { asc, eq, inArray } from "drizzle-orm";
import {
  LEDGER_BASE_PLACEHOLDER,
  bundleFileName,
  type ActivityLedger,
  type ArActivitySummary,
  type ArActivityUpload,
  type LedgerSubject,
} from "@elimuar/shared";
import { db } from "../db/client.js";
import { insertReturning, newId, updateReturning } from "../db/helpers.js";
import { arActivities, arActivitySubjects, lessons } from "../db/schema.js";
import { deleteObject, putObject } from "./assetBucket.js";

/** The AR activity catalogue: bundles and thumbnails in the asset bucket, metadata in `ar_activities`, served
   to the phone as the activity shell's own ledger. */

export type ArActivityRow = typeof arActivities.$inferSelect;

const BUNDLE_PREFIX = "ar-activities/bundles";
const IMAGE_PREFIX = "ar-activities/images";

export const bundleObjectKey = (file: string) => `${BUNDLE_PREFIX}/${file}`;
export const imageObjectKey = (file: string) => `${IMAGE_PREFIX}/${file}`;
export const mediaObjectKey = (file: string) => `ar-activities/media/${file}`;
export const mediaPath = (file: string) => `/api/ar-activities/files/media/${encodeURIComponent(file)}`;

/** The path the API serves an image at (public; thumbnails are not sensitive). */
export const imagePath = (file: string) => `/api/ar-activities/files/images/${encodeURIComponent(file)}`;

const EXTRACTOR = fileURLToPath(new URL("../../tools/extract_activity.py", import.meta.url));
const run = promisify(execFile);

export class ActivityBundleError extends Error {}

/** Reads the activity's playable configuration out of its bundle with tools/extract_activity.py (Python +
   UnityPy, set PYTHON to choose the interpreter). */
export interface ExtractedActivity {
  manifest: Record<string, unknown>;
  /** The Observe narration, compressed for the web preview (MP3, or WAV without ffmpeg). */
  observeAudio: { body: Buffer; ext: "mp3" | "wav" } | null;
}

/** MP3 for the browser when ffmpeg is on the PATH; the WAV as it came otherwise. */
async function compressAudio(wav: string): Promise<{ body: Buffer; ext: "mp3" | "wav" }> {
  const mp3 = wav.replace(/\.wav$/, ".mp3");
  try {
    await run(process.env.FFMPEG ?? "ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "96k", mp3], {
      timeout: 120_000,
    });
    return { body: await readFile(mp3), ext: "mp3" };
  } catch {
    return { body: await readFile(wav), ext: "wav" };
  }
}

export async function extractActivityManifest(bundle: Buffer): Promise<ExtractedActivity> {
  const dir = await mkdtemp(join(tmpdir(), "elimuar-activity-"));
  try {
    const input = join(dir, "activity.bundle");
    const output = join(dir, "activity.json");
    const media = join(dir, "media");
    await writeFile(input, bundle);
    try {
      await run(process.env.PYTHON ?? "python", [EXTRACTOR, input, output, media], {
        timeout: 180_000,
        maxBuffer: 4 * 1024 * 1024,
        cwd: dir,
      });
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr ?? "";
      const reason = stderr.trim().split(/\r?\n/).pop() || (error as Error).message;
      throw new ActivityBundleError(`This file could not be read as an AR activity: ${reason}`);
    }
    const manifest = JSON.parse(await readFile(output, "utf8")) as Record<string, unknown>;
    const observeAudio = (manifest.preview as { observeAudio?: boolean } | undefined)?.observeAudio
      ? await compressAudio(join(media, "observe.wav"))
      : null;
    return { manifest, observeAudio };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const fileOf = (objectKey: string) => objectKey.substring(objectKey.lastIndexOf("/") + 1);

export interface SaveArActivityInput {
  meta: ArActivityUpload;
  bundle: Buffer;
  thumbnail?: { body: Buffer; fileName: string; contentType: string } | null;
  credits?: string;
  buildNumber?: number;
  minimumShellVersion?: string;
  sortOrder?: number;
  uploadedBy: string | null;
}

async function subjectName(category: string): Promise<string> {
  const [row] = await db
    .select({ name: arActivitySubjects.name })
    .from(arActivitySubjects)
    .where(eq(arActivitySubjects.subjectKey, category))
    .limit(1);
  return row?.name ?? category.charAt(0).toUpperCase() + category.slice(1);
}

/** The lesson an activity is assigned through. */
/** The first form named, for the lesson an activity is assigned through. */
export const firstForm = (gradeLevel: string) => gradeLevel.split(",")[0]?.trim() || gradeLevel;

async function ensureLesson(meta: ArActivityUpload, existingLessonId: string | null, userId: string | null,
  existingSubject: string | null) {
  const subject = meta.subject ?? existingSubject ?? (await subjectName(meta.category));
  const values = {
    title: meta.title,
    summary: meta.description.replace(/<[^>]+>/g, "").slice(0, 2000) || null,
    gradeLevel: firstForm(meta.gradeLevel),
    subject,
    topic: meta.tags[0] ?? subject,
    status: meta.status === "published" ? ("published" as const) : ("archived" as const),
    modelKey: meta.activityKey,
    updatedAt: new Date(),
  };
  if (existingLessonId) {
    const updated = await updateReturning(lessons, values, eq(lessons.id, existingLessonId));
    if (updated) return updated.id;
  }
  const lesson = await insertReturning(lessons, {
    id: newId(),
    syllabusCode: `AR-${meta.activityKey}`,
    estimatedMinutes: 15,
    createdBy: userId,
    ...values,
  });
  return lesson.id;
}

export async function arActivityByKey(activityKey: string): Promise<ArActivityRow | null> {
  const [row] = await db.select().from(arActivities).where(eq(arActivities.activityKey, activityKey)).limit(1);
  return row ?? null;
}

export async function saveArActivity(input: SaveArActivityInput): Promise<ArActivityRow> {
  const { meta } = input;
  const existing = await arActivityByKey(meta.activityKey);
  const extracted = await extractActivityManifest(input.bundle);
  const manifest = extracted.manifest;
  const earlier = ((existing?.manifest ?? {}) as { preview?: Record<string, unknown> }).preview ?? {};
  if (extracted.observeAudio) {
    const file = `${meta.activityKey}-observe.${extracted.observeAudio.ext}`;
    await putObject(mediaObjectKey(file), extracted.observeAudio.body,
      extracted.observeAudio.ext === "mp3" ? "audio/mpeg" : "audio/wav");
    manifest.preview = { ...earlier, observeAudio: file };
  } else {
    manifest.preview = earlier;
  }

  const bundleFile = bundleFileName(meta.bundleName, meta.bundleVersion);
  const stored = await putObject(bundleObjectKey(bundleFile), input.bundle, "application/octet-stream");

  let thumbnailObjectKey = existing?.thumbnailObjectKey ?? null;
  if (input.thumbnail) {
    thumbnailObjectKey = imageObjectKey(input.thumbnail.fileName);
    await putObject(thumbnailObjectKey, input.thumbnail.body, input.thumbnail.contentType);
  }

  // A new bundle version replaces the old file; the shell sees the version
  // change in the ledger and offers its Update.
  if (existing && existing.bundleObjectKey !== stored.key) {
    await deleteObject(existing.bundleObjectKey).catch(() => undefined);
  }

  const lessonId = await ensureLesson(meta, existing?.lessonId ?? null, input.uploadedBy, existing?.subject ?? null);
  const columns = {
    title: meta.title,
    description: meta.description,
    category: meta.category,
    subject: meta.subject ?? existing?.subject ?? (meta.category === "science" ? "Biology" : null),
    tags: meta.tags,
    credits: input.credits ?? existing?.credits ?? "",
    trackingStyle: meta.trackingStyle,
    minUsers: meta.minUsers,
    maxUsers: meta.maxUsers,
    bundleName: meta.bundleName,
    bundleVersion: meta.bundleVersion,
    version: meta.version ?? `0.0.${meta.bundleVersion}`,
    buildNumber: input.buildNumber ?? 0,
    minimumShellVersion: input.minimumShellVersion ?? existing?.minimumShellVersion ?? "0.12.21",
    hasScore: meta.hasScore,
    gradeLevel: meta.gradeLevel,
    bundleObjectKey: stored.key,
    bundleSizeBytes: stored.sizeBytes,
    thumbnailObjectKey,
    manifest,
    status: meta.status,
    lessonId,
    updatedAt: new Date(),
  };

  if (existing) {
    const updated = await updateReturning(arActivities, columns, eq(arActivities.id, existing.id));
    if (!updated) throw new Error(`Activity ${meta.activityKey} could not be read back.`);
    return updated;
  }
  return insertReturning(arActivities, {
    id: newId(),
    activityKey: meta.activityKey,
    sortOrder: input.sortOrder ?? 0,
    uploadedBy: input.uploadedBy,
    ...columns,
  });
}

export async function saveArActivitySubject(
  subject: LedgerSubject,
  icon: { body: Buffer; fileName: string; contentType: string } | null,
  sortOrder: number
): Promise<void> {
  let iconObjectKey: string | null = null;
  if (icon) {
    iconObjectKey = imageObjectKey(icon.fileName);
    await putObject(iconObjectKey, icon.body, icon.contentType);
  }
  await db
    .insert(arActivitySubjects)
    .values({ subjectKey: subject.subjectID, name: subject.subjectName, iconObjectKey, sortOrder })
    .onDuplicateKeyUpdate({
      set: { name: subject.subjectName, sortOrder, ...(iconObjectKey ? { iconObjectKey } : {}) },
    });
}

/** Removes an activity, its files and the lesson it was assigned through. */
export async function deleteArActivity(row: ArActivityRow): Promise<void> {
  await db.delete(arActivities).where(eq(arActivities.id, row.id));
  if (row.lessonId) await db.delete(lessons).where(eq(lessons.id, row.lessonId));
  await deleteObject(row.bundleObjectKey).catch(() => undefined);
  if (row.thumbnailObjectKey) await deleteObject(row.thumbnailObjectKey).catch(() => undefined);
}

export async function listArActivities(statuses: Array<ArActivityRow["status"]>): Promise<ArActivityRow[]> {
  return db
    .select()
    .from(arActivities)
    .where(inArray(arActivities.status, statuses))
    .orderBy(asc(arActivities.sortOrder), asc(arActivities.title));
}

export async function arActivitySubjectNames(): Promise<Map<string, string>> {
  const rows = await db.select().from(arActivitySubjects);
  return new Map(rows.map((row) => [row.subjectKey, row.name]));
}

export function arActivitySummary(row: ArActivityRow, subjects: Map<string, string>): ArActivitySummary {
  return {
    id: row.id,
    activityKey: row.activityKey,
    title: row.title,
    description: row.description,
    category: row.category,
    subjectName: row.subject ?? subjects.get(row.category) ?? null,
    tags: row.tags ?? [],
    gradeLevel: row.gradeLevel,
    bundleName: row.bundleName,
    bundleVersion: row.bundleVersion,
    bundleFile: fileOf(row.bundleObjectKey),
    version: row.version,
    bundleSizeBytes: row.bundleSizeBytes,
    hasScore: row.hasScore,
    minUsers: row.minUsers,
    maxUsers: row.maxUsers,
    status: row.status,
    thumbnailUrl: row.thumbnailObjectKey ? imagePath(fileOf(row.thumbnailObjectKey)) : null,
    lessonId: row.lessonId,
    updatedAt: row.updatedAt.toISOString(),
    preview: previewOf(row),
  };
}

/** What the web console needs to play an activity's Observe scene. */
export function previewOf(row: ArActivityRow) {
  const manifest = (row.manifest ?? {}) as {
    preview?: { observeAudio?: string; observeVideo?: string };
    sections?: Array<{
      kind: string;
      steps: Array<{ title: string; description: string; captions: Array<{ duration: number; text: string }> }>;
    }>;
  };
  const observe = manifest.sections?.find((s) => s.kind === "observe")?.steps?.[0];
  return {
    title: observe?.title ?? "Observe",
    description: observe?.description ?? "",
    captions: observe?.captions ?? [],
    audioUrl: manifest.preview?.observeAudio ? mediaPath(manifest.preview.observeAudio) : null,
    videoUrl: manifest.preview?.observeVideo ? mediaPath(manifest.preview.observeVideo) : null,
  };
}

/** The shell's activity ledger for these rows. */
export async function buildActivityLedger(rows: ArActivityRow[]): Promise<ActivityLedger> {
  const base = LEDGER_BASE_PLACEHOLDER;
  const subjects = await db.select().from(arActivitySubjects).orderBy(asc(arActivitySubjects.sortOrder));
  const icon = (key: string | null) => (key ? `${base}/CMS/images/${fileOf(key)}` : "");

  return {
    ledgerFileVersion: "0.0.4",
    latestShellVersion: "0.12.84",
    minimumShellVersion: "0.8.64",
    activityInfoVersion: "0.0.2",
    bundleDownloadDirectory: `${base}/CMS/bundles/`,
    androidStoreLink: "",
    iosStoreLink: "",
    privacyPolicyLink: "",
    termsAndConditionsLink: "",
    activityLedger: rows.map((row) => ({
      activityID: row.activityKey,
      activityTitle: row.title,
      activityDescription: row.description ?? "",
      activityThumbnail: row.thumbnailObjectKey ? `${base}/CMS/images/${fileOf(row.thumbnailObjectKey)}` : "",
      activityCategory: row.category,
      activityCredits: row.credits ?? "",
      activityTags: row.tags ?? [],
      activityTrackingStyle: row.trackingStyle,
      minUsers: row.minUsers,
      maxUsers: row.maxUsers,
      bundle: row.bundleName,
      bundleVersion: row.bundleVersion,
      version: row.version,
      buildNumber: row.buildNumber,
      minimumShellVersion: row.minimumShellVersion,
      installState: "NotInstalled",
      fileSize: row.bundleSizeBytes,
      hasScore: row.hasScore,
    })),
    activitySubjects: subjects.map((subject) => ({
      subjectID: subject.subjectKey,
      subjectName: subject.name,
      subjectIconLarge: icon(subject.iconObjectKey),
      subjectIconMedium: icon(subject.iconObjectKey),
      subjectIconSmall: icon(subject.iconObjectKey),
    })),
  };
}

export function imageContentType(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}
