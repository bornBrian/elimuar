import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Router, type Response } from "express";
import multer from "multer";
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  activityLedgerSchema,
  arActivityKeySchema,
  arActivityUpdateSchema,
  arActivityUploadSchema,
  bundleFileName,
  urlFileName,
  type ArActivityProgressRow,
  type ArActivityUpload,
} from "@elimuar/shared";
import { db } from "../db/client.js";
import { updateReturning } from "../db/helpers.js";
import {
  arActivities,
  arActivityStates,
  classes,
  schools,
  lessons,
  studentEnrollments,
  teacherAssignments,
  users,
} from "../db/schema.js";
import { getObject, putObject } from "../lib/assetBucket.js";
import {
  ActivityBundleError,
  arActivityByKey,
  firstForm,
  arActivitySubjectNames,
  arActivitySummary,
  buildActivityLedger,
  bundleObjectKey,
  deleteArActivity,
  imageContentType,
  imageObjectKey,
  listArActivities,
  mediaObjectKey,
  saveArActivity,
} from "../lib/arActivity.js";
import { recordAudit } from "../lib/audit.js";
import { HttpError, asyncHandler, parse, sendData } from "../lib/http.js";
import { requireAuth, requireRole, type AuthedRequest } from "../middleware/auth.js";

const MAX_BUNDLE_BYTES = 200 * 1024 * 1024;
const SAFE_FILE = /^[A-Za-z0-9_.-]+$/;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BUNDLE_BYTES, files: 80 },
});

const requireAuthor = requireRole("platform_admin");
const STAFF_ROLES = ["teacher", "school_admin", "academic_master", "secretary", "platform_admin"] as const;

async function streamObject(res: Response, key: string, contentType: string, range?: string) {
  const object = await getObject(key, range);
  if (!object) throw HttpError.notFound("That file is not in the asset store.");
  res.status(object.status);
  res.setHeader("Content-Type", object.contentType ?? contentType);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (object.contentLength !== null) res.setHeader("Content-Length", String(object.contentLength));
  if (object.contentRange) res.setHeader("Content-Range", object.contentRange);
  object.stream.on("error", () => res.destroy());
  object.stream.pipe(res);
}

function safeFile(name: string): string {
  if (!SAFE_FILE.test(name)) throw HttpError.badRequest("That is not a valid file name.");
  return name;
}

/** Thumbnails and subject icons: public, so the console and the shell can show them in <img>. */
export const arActivityPublicRouter = Router();

arActivityPublicRouter.get(
  "/ar-activities/files/images/:file",
  asyncHandler(async (req, res) => {
    const file = safeFile(req.params.file);
    await streamObject(res, imageObjectKey(file), imageContentType(file));
  })
);

/** Observe narration and the recorded Observe video, for the console's preview. */
arActivityPublicRouter.get(
  "/ar-activities/files/media/:file",
  asyncHandler(async (req, res) => {
    const file = safeFile(req.params.file);
    const type = file.endsWith(".mp3") ? "audio/mpeg" : file.endsWith(".wav") ? "audio/wav"
      : file.endsWith(".webm") ? "video/webm" : "video/mp4";
    const range = typeof req.headers.range === "string" ? req.headers.range : undefined;
    await streamObject(res, mediaObjectKey(file), type, range);
  })
);

export const arActivityRouter = Router();
arActivityRouter.use("/ar-activities", requireAuth);

/** The activity shell's ledger, for the signed-in user. */
arActivityRouter.get(
  "/ar-activities/ledger",
  asyncHandler(async (req: AuthedRequest, res) => {
    const statuses: Array<"draft" | "published"> =
      req.auth!.role === "platform_admin" ? ["published", "draft"] : ["published"];
    const rows = await listArActivities(statuses);
    res.setHeader("Cache-Control", "no-store");
    res.json(await buildActivityLedger(rows));
  })
);

arActivityRouter.get(
  "/ar-activities/files/bundles/:file",
  asyncHandler(async (req: AuthedRequest, res) => {
    const file = safeFile(req.params.file);
    const range = typeof req.headers.range === "string" ? req.headers.range : undefined;
    await streamObject(res, bundleObjectKey(file), "application/octet-stream", range);
  })
);

/** The activity's playable configuration (sections, steps, parts, trays). */
arActivityRouter.get(
  "/ar-activities/:activityKey/manifest",
  asyncHandler(async (req: AuthedRequest, res) => {
    const key = parse(arActivityKeySchema, req.params.activityKey);
    const row = await arActivityByKey(key);
    if (!row || (row.status !== "published" && req.auth!.role !== "platform_admin")) {
      throw HttpError.notFound("Activity not found");
    }
    if (!row.manifest) throw HttpError.notFound("This activity has no playable configuration. Upload its bundle again.");
    res.setHeader("Cache-Control", "no-store");
    sendData(res, { activityKey: row.activityKey, bundleVersion: row.bundleVersion, manifest: row.manifest });
  })
);

arActivityRouter.get(
  "/ar-activities",
  asyncHandler(async (req: AuthedRequest, res) => {
    const statuses: Array<"draft" | "published" | "archived"> =
      req.auth!.role === "platform_admin" ? ["draft", "published", "archived"] : ["published"];
    const [rows, subjects] = await Promise.all([listArActivities(statuses), arActivitySubjectNames()]);
    sendData(res, rows.map((row) => arActivitySummary(row, subjects)));
  })
);

/** The signed-in learner's own records, one per activity played. */
arActivityRouter.get(
  "/ar-activities/progress/me",
  asyncHandler(async (req: AuthedRequest, res) => {
    const rows = await db.select().from(arActivityStates).where(eq(arActivityStates.userId, req.auth!.userId));
    sendData(
      res,
      rows.map((row) => ({
        activityKey: row.activityKey,
        status: row.status,
        bestScorePercent: row.bestScorePercent != null ? Number(row.bestScorePercent) : null,
        latestScorePercent: row.latestScorePercent != null ? Number(row.latestScorePercent) : null,
        attempts: row.attempts,
        lastPlayedAt: row.lastPlayedAt ? row.lastPlayedAt.toISOString() : null,
      }))
    );
  })
);

/** Every learner's runs on the AR activities: who, which class and school, which activity, how far they got,
   their best and latest score, how many times they played and when. */
arActivityRouter.get(
  "/ar-activities/results",
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    let classFilter: string[] | null = null;
    if (auth.role === "teacher") {
      const taught = await db
        .select({ classId: teacherAssignments.classId })
        .from(teacherAssignments)
        .where(eq(teacherAssignments.teacherId, auth.userId));
      classFilter = taught.map((t) => t.classId);
      if (classFilter.length === 0) {
        sendData(res, []);
        return;
      }
    }
    const conditions = [eq(studentEnrollments.status, "active")];
    if (classFilter) conditions.push(inArray(studentEnrollments.classId, classFilter));
    else if (auth.role !== "platform_admin" && auth.schoolId) conditions.push(eq(classes.schoolId, auth.schoolId));

    const rows = await db
      .select({
        state: arActivityStates,
        firstName: users.firstName,
        lastName: users.lastName,
        studentIdentifier: studentEnrollments.studentIdentifier,
        classId: classes.id,
        className: classes.name,
        schoolName: schools.name,
        title: arActivities.title,
        subject: arActivities.subject,
      })
      .from(arActivityStates)
      .innerJoin(users, eq(arActivityStates.userId, users.id))
      .innerJoin(studentEnrollments, eq(studentEnrollments.studentId, users.id))
      .innerJoin(classes, eq(studentEnrollments.classId, classes.id))
      .innerJoin(schools, eq(classes.schoolId, schools.id))
      .leftJoin(arActivities, eq(arActivities.activityKey, arActivityStates.activityKey))
      .where(and(...conditions))
      .orderBy(desc(arActivityStates.lastPlayedAt))
      .limit(1000);

    sendData(
      res,
      rows.map((r) => ({
        studentName: `${r.firstName} ${r.lastName}`.trim(),
        studentIdentifier: r.studentIdentifier ?? null,
        classId: r.classId,
        className: r.className,
        schoolName: r.schoolName,
        activityKey: r.state.activityKey,
        activityTitle: r.title ?? r.state.activityKey,
        activitySubject: r.subject ?? null,
        status: r.state.status,
        bestScorePercent: r.state.bestScorePercent != null ? Number(r.state.bestScorePercent) : null,
        latestScorePercent: r.state.latestScorePercent != null ? Number(r.state.latestScorePercent) : null,
        attempts: r.state.attempts,
        lastDurationSeconds: r.state.lastDurationSeconds,
        lastPlayedAt: r.state.lastPlayedAt ? r.state.lastPlayedAt.toISOString() : null,
      }))
    );
  })
);

/** Every enrolled learner's record on every activity, for one class. */
arActivityRouter.get(
  "/ar-activities/progress/class/:classId",
  requireRole(...STAFF_ROLES),
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    const [klass] = await db.select().from(classes).where(eq(classes.id, req.params.classId)).limit(1);
    if (!klass) throw HttpError.notFound("Class not found");

    if (auth.role === "teacher") {
      const [link] = await db
        .select({ id: teacherAssignments.id })
        .from(teacherAssignments)
        .where(and(eq(teacherAssignments.teacherId, auth.userId), eq(teacherAssignments.classId, klass.id)))
        .limit(1);
      if (!link) throw HttpError.forbidden("You do not teach this class.");
    } else if (auth.role !== "platform_admin" && auth.schoolId !== klass.schoolId) {
      throw HttpError.forbidden("This class belongs to another school.");
    }

    const students = await db
      .select({
        studentId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        studentIdentifier: studentEnrollments.studentIdentifier,
      })
      .from(studentEnrollments)
      .innerJoin(users, eq(studentEnrollments.studentId, users.id))
      .where(and(eq(studentEnrollments.classId, klass.id), eq(studentEnrollments.status, "active")));

    const ids = students.map((s) => s.studentId);
    const states = ids.length
      ? await db.select().from(arActivityStates).where(inArray(arActivityStates.userId, ids))
      : [];
    const byStudent = new Map(students.map((s) => [s.studentId, s]));

    const rows: ArActivityProgressRow[] = states.map((state) => {
      const student = byStudent.get(state.userId)!;
      return {
        studentId: state.userId,
        studentName: `${student.firstName} ${student.lastName}`.trim(),
        studentIdentifier: student.studentIdentifier ?? null,
        activityKey: state.activityKey,
        status: state.status,
        bestScorePercent: state.bestScorePercent != null ? Number(state.bestScorePercent) : null,
        latestScorePercent: state.latestScorePercent != null ? Number(state.latestScorePercent) : null,
        attempts: state.attempts,
        lastPlayedAt: state.lastPlayedAt ? state.lastPlayedAt.toISOString() : null,
      };
    });

    sendData(res, {
      classId: klass.id,
      className: klass.name,
      students: students.map((s) => ({
        studentId: s.studentId,
        studentName: `${s.firstName} ${s.lastName}`.trim(),
        studentIdentifier: s.studentIdentifier ?? null,
      })),
      records: rows,
    });
  })
);

function asBadRequest(error: unknown): never {
  if (error instanceof ActivityBundleError) throw HttpError.badRequest(error.message);
  throw error;
}

function fileBody(file: Express.Multer.File) {
  return { body: file.buffer, fileName: safeFile(file.originalname), contentType: imageContentType(file.originalname) };
}

/** Upload one activity: multipart `bundle` (the Unity .bundle), optional `thumbnail`, and `metadata` (JSON,
   ArActivityUpload). */
arActivityRouter.post(
  "/ar-activities",
  requireAuthor,
  upload.fields([
    { name: "bundle", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  asyncHandler(async (req: AuthedRequest, res) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const bundle = files?.bundle?.[0];
    if (!bundle) throw HttpError.badRequest("Attach the activity's .bundle file.");
    if (!bundle.originalname.toLowerCase().endsWith(".bundle")) {
      throw HttpError.badRequest("The activity file must be a Unity .bundle.");
    }
    let raw: unknown;
    try {
      raw = JSON.parse(String(req.body.metadata ?? "{}"));
    } catch {
      throw HttpError.badRequest("metadata must be JSON.");
    }
    const meta = parse(arActivityUploadSchema, raw);
    const thumbnail = files?.thumbnail?.[0];

    const row = await saveArActivity({
      meta,
      bundle: bundle.buffer,
      thumbnail: thumbnail ? fileBody(thumbnail) : null,
      uploadedBy: req.auth!.userId,
    }).catch(asBadRequest);
    await recordAudit({
      actorId: req.auth!.userId,
      action: "ar_activity.upload",
      entity: "ar_activity",
      entityId: row.id,
      metadata: { activityKey: row.activityKey, bundleVersion: row.bundleVersion },
      ip: req.ip,
    });
    sendData(res, arActivitySummary(row, await arActivitySubjectNames()), 201);
  })
);

/** Import straight from an activity shell's data folder: the `activitiesLedger.json` plus any of the
   `.bundle` files and thumbnail images it names. */
arActivityRouter.post(
  "/ar-activities/import",
  requireAuthor,
  upload.fields([
    { name: "ledger", maxCount: 1 },
    { name: "files", maxCount: 38 },
  ]),
  asyncHandler(async (req: AuthedRequest, res) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const ledgerFile = files?.ledger?.[0];
    if (!ledgerFile) throw HttpError.badRequest("Attach activitiesLedger.json.");
    let raw: unknown;
    try {
      raw = JSON.parse(ledgerFile.buffer.toString("utf8").replace(/^﻿/, ""));
    } catch {
      throw HttpError.badRequest("activitiesLedger.json is not valid JSON.");
    }
    const ledger = parse(activityLedgerSchema, raw);
    const byName = new Map((files?.files ?? []).map((f) => [f.originalname, f]));
    const gradeLevel = typeof req.body.gradeLevel === "string" && req.body.gradeLevel.trim() ? req.body.gradeLevel.trim() : "Form 2";

    const imported: string[] = [];
    const skipped: Array<{ activityKey: string; reason: string }> = [];
    for (const [index, entry] of ledger.activityLedger.entries()) {
      const bundleName = bundleFileName(entry.bundle, entry.bundleVersion);
      const bundle = byName.get(bundleName);
      if (!bundle) {
        skipped.push({ activityKey: entry.activityID, reason: `${bundleName} was not attached` });
        continue;
      }
      const thumbName = entry.activityThumbnail ? urlFileName(entry.activityThumbnail) : "";
      const thumb = thumbName ? byName.get(thumbName) : undefined;
      const meta: ArActivityUpload = {
        activityKey: entry.activityID,
        title: entry.activityTitle,
        description: entry.activityDescription,
        category: entry.activityCategory,
        tags: entry.activityTags,
        gradeLevel,
        bundleName: entry.bundle,
        bundleVersion: entry.bundleVersion,
        version: entry.version,
        hasScore: entry.hasScore,
        minUsers: entry.minUsers,
        maxUsers: entry.maxUsers,
        trackingStyle: entry.activityTrackingStyle,
        status: "published",
      };
      const saved = await saveArActivity({
        meta,
        bundle: bundle.buffer,
        thumbnail: thumb ? fileBody(thumb) : null,
        credits: entry.activityCredits,
        buildNumber: entry.buildNumber,
        minimumShellVersion: entry.minimumShellVersion,
        sortOrder: index,
        uploadedBy: req.auth!.userId,
      }).catch((error) => {
        if (error instanceof ActivityBundleError) {
          skipped.push({ activityKey: entry.activityID, reason: error.message });
          return null;
        }
        throw error;
      });
      if (saved) imported.push(entry.activityID);
    }
    await recordAudit({
      actorId: req.auth!.userId,
      action: "ar_activity.import",
      entity: "ar_activity",
      metadata: { imported, skipped: skipped.length },
      ip: req.ip,
    });
    sendData(res, { imported, skipped });
  })
);

/** The Observe scene recorded on a phone (MP4), shown by the console's preview with the activity's narration. */
arActivityRouter.post(
  "/ar-activities/:activityKey/observe-video",
  requireAuthor,
  upload.single("video"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const key = parse(arActivityKeySchema, req.params.activityKey);
    const row = await arActivityByKey(key);
    if (!row) throw HttpError.notFound("Activity not found");
    const video = (req as AuthedRequest & { file?: Express.Multer.File }).file;
    if (!video) throw HttpError.badRequest("Attach the recording as 'video'.");
    const ext = video.originalname.toLowerCase().endsWith(".webm") ? "webm" : "mp4";
    const file = `${key}-observe.${ext}`;
    await putObject(mediaObjectKey(file), video.buffer, ext === "webm" ? "video/webm" : "video/mp4");
    const manifest = { ...((row.manifest ?? {}) as Record<string, unknown>) };
    manifest.preview = { ...((manifest.preview as object) ?? {}), observeVideo: file };
    const updated = await updateReturning(arActivities, { manifest, updatedAt: new Date() }, eq(arActivities.id, row.id));
    sendData(res, arActivitySummary(updated ?? row, await arActivitySubjectNames()));
  })
);

// ---- the Observe preview, recorded by the app ----------------------------------------
// Frames arrive at 12 fps of animation time; ffmpeg joins them into one video.

const run = promisify(execFile);
const framesDir = (key: string) => join(tmpdir(), "elimuar-observe-frames", key);
const FRAME_NAME = /^\d{5}\.jpg$/;

arActivityRouter.post(
  "/ar-activities/:activityKey/observe-frames/start",
  requireAuthor,
  asyncHandler(async (req: AuthedRequest, res) => {
    const key = parse(arActivityKeySchema, req.params.activityKey);
    if (!(await arActivityByKey(key))) throw HttpError.notFound("Activity not found");
    await rm(framesDir(key), { recursive: true, force: true });
    await mkdir(framesDir(key), { recursive: true });
    sendData(res, { ready: true });
  })
);

arActivityRouter.post(
  "/ar-activities/:activityKey/observe-frames",
  requireAuthor,
  upload.array("frames", 64),
  asyncHandler(async (req: AuthedRequest, res) => {
    const key = parse(arActivityKeySchema, req.params.activityKey);
    const files = ((req as AuthedRequest & { files?: Express.Multer.File[] }).files ?? []) as Express.Multer.File[];
    await mkdir(framesDir(key), { recursive: true });
    let saved = 0;
    for (const f of files) {
      if (!FRAME_NAME.test(f.originalname)) continue;
      await writeFile(join(framesDir(key), f.originalname), f.buffer);
      saved++;
    }
    sendData(res, { saved });
  })
);

arActivityRouter.post(
  "/ar-activities/:activityKey/observe-frames/finish",
  requireAuthor,
  asyncHandler(async (req: AuthedRequest, res) => {
    const key = parse(arActivityKeySchema, req.params.activityKey);
    const fps = Math.min(30, Math.max(1, Number((req.body as { fps?: number })?.fps ?? 12)));
    const row = await arActivityByKey(key);
    if (!row) throw HttpError.notFound("Activity not found");
    const dir = framesDir(key);
    const frames = (await readdir(dir).catch(() => [])).filter((f) => FRAME_NAME.test(f));
    if (frames.length === 0) throw HttpError.badRequest("No frames were uploaded.");
    const out = join(dir, "observe.mp4");
    try {
      await run(process.env.FFMPEG ?? "ffmpeg", [
        "-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(dir, "%05d.jpg"),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "24", "-movflags", "+faststart", out,
      ], { timeout: 600_000 });
    } catch (error) {
      throw new HttpError(500, "INTERNAL", "The preview video could not be made (is ffmpeg installed on the server?).");
    }
    const file = `${key}-observe.mp4`;
    await putObject(mediaObjectKey(file), await readFile(out), "video/mp4");
    await rm(dir, { recursive: true, force: true });
    const manifest = { ...((row.manifest ?? {}) as Record<string, unknown>) };
    manifest.preview = { ...((manifest.preview as object) ?? {}), observeVideo: file, observeVideoFps: fps };
    const updated = await updateReturning(arActivities, { manifest, updatedAt: new Date() }, eq(arActivities.id, row.id));
    sendData(res, arActivitySummary(updated ?? row, await arActivitySubjectNames()));
  })
);

arActivityRouter.patch(
  "/ar-activities/:activityKey",
  requireAuthor,
  asyncHandler(async (req: AuthedRequest, res) => {
    const key = parse(arActivityKeySchema, req.params.activityKey);
    const body = parse(arActivityUpdateSchema, req.body);
    const row = await arActivityByKey(key);
    if (!row) throw HttpError.notFound("Activity not found");

    const updated = await updateReturning(arActivities, { ...body, updatedAt: new Date() }, eq(arActivities.id, row.id));
    if (!updated) throw HttpError.notFound("Activity not found");
    if (row.lessonId) {
      await db
        .update(lessons)
        .set({
          ...(body.title ? { title: body.title } : {}),
          ...(body.gradeLevel ? { gradeLevel: firstForm(body.gradeLevel) } : {}),
          ...(body.subject ? { subject: body.subject } : {}),
          ...(body.status ? { status: body.status === "published" ? "published" : "archived" } : {}),
          updatedAt: new Date(),
        })
        .where(eq(lessons.id, row.lessonId));
    }
    sendData(res, arActivitySummary(updated, await arActivitySubjectNames()));
  })
);

arActivityRouter.delete(
  "/ar-activities/:activityKey",
  requireAuthor,
  asyncHandler(async (req: AuthedRequest, res) => {
    const key = parse(arActivityKeySchema, req.params.activityKey);
    const row = await arActivityByKey(key);
    if (!row) throw HttpError.notFound("Activity not found");
    await deleteArActivity(row);
    await recordAudit({
      actorId: req.auth!.userId,
      action: "ar_activity.delete",
      entity: "ar_activity",
      entityId: row.id,
      metadata: { activityKey: key },
      ip: req.ip,
    });
    sendData(res, { deleted: key });
  })
);
