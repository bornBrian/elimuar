/** Installs the AR activities from a content folder (AR_CONTENT_DIR) or the seed-data snapshot.
   Without --keep, existing activities and their runs are cleared first. */
import "dotenv/config";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { activityLedgerSchema, bundleFileName, urlFileName, type ArActivityUpload } from "@elimuar/shared";
import { db } from "../src/db/client.js";
import { arActivities, arActivitySubjects, lessons } from "../src/db/schema.js";
import { imageContentType, saveArActivity, saveArActivitySubject } from "../src/lib/arActivity.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const args = process.argv.slice(2);
const keep = args.includes("--keep");
const folder = resolve(args.find((a) => !a.startsWith("--")) ?? process.env.AR_CONTENT_DIR ?? join(here, "../../../content/files"));
const snapshot = join(here, "../seed-data/ar-activities.json");

/** The tables that hold AR content and what learners did with it, children first. */
const CONTENT_TABLES = ["ar_activity_runs", "ar_activity_states", "lesson_assignments", "ar_activities", "lessons", "ar_activity_subjects"];

async function wipeContent() {
  await db.execute(sql`set foreign_key_checks = 0`);
  try {
    for (const table of CONTENT_TABLES) {
      await db.execute(sql.raw(`delete from \`${table}\``));
      console.log(`  cleared ${table}`);
    }
  } finally {
    await db.execute(sql`set foreign_key_checks = 1`);
  }
}

const readFile = (path: string): Buffer | null => (existsSync(path) ? readFileSync(path) : null);
const dates = <T extends Record<string, unknown>>(row: T, ...keys: string[]) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, keys.includes(k) && typeof v === "string" ? new Date(v) : v])) as T;

async function fromFolder() {
  const ledger = activityLedgerSchema.parse(JSON.parse(readFileSync(join(folder, "activitiesLedger.json"), "utf8").replace(/^﻿/, "")));
  const images = join(folder, "ImageCache");
  const bundles = join(folder, "bundles");
  console.log(`Installing from ${folder}: ${ledger.activityLedger.length} activities`);
  console.log(`  bundles present: ${existsSync(bundles) ? readdirSync(bundles).join(", ") : "none"}`);

  for (const [index, subject] of ledger.activitySubjects.entries()) {
    const iconName = subject.subjectIconLarge ? urlFileName(subject.subjectIconLarge) : "";
    const icon = iconName ? readFile(join(images, iconName)) : null;
    await saveArActivitySubject(subject, icon ? { body: icon, fileName: iconName, contentType: imageContentType(iconName) } : null, index);
  }

  let installed = 0;
  for (const [index, entry] of ledger.activityLedger.entries()) {
    const file = bundleFileName(entry.bundle, entry.bundleVersion);
    const bundle = readFile(join(bundles, file));
    if (!bundle) {
      console.warn(`  SKIP ${entry.activityID}: ${file} is not in ${bundles}`);
      continue;
    }
    const thumbName = entry.activityThumbnail ? urlFileName(entry.activityThumbnail) : "";
    const thumb = thumbName ? readFile(join(images, thumbName)) : null;
    const meta: ArActivityUpload = {
      activityKey: entry.activityID,
      title: entry.activityTitle,
      description: entry.activityDescription,
      category: entry.activityCategory,
      tags: entry.activityTags,
      gradeLevel: "Form 2",
      bundleName: entry.bundle,
      bundleVersion: entry.bundleVersion,
      version: entry.version,
      hasScore: entry.hasScore,
      minUsers: entry.minUsers,
      maxUsers: entry.maxUsers,
      trackingStyle: entry.activityTrackingStyle,
      status: "published",
    };
    await saveArActivity({
      meta,
      bundle,
      thumbnail: thumb ? { body: thumb, fileName: thumbName, contentType: imageContentType(thumbName) } : null,
      credits: entry.activityCredits,
      buildNumber: entry.buildNumber,
      minimumShellVersion: entry.minimumShellVersion,
      sortOrder: index,
      uploadedBy: null,
    });
    installed++;
    console.log(`  activity ${entry.activityID} v${entry.version} (${(bundle.length / 1048576).toFixed(1)} MB)`);
  }
  console.log(`Done: ${installed} activities. Set each one's subject and form in the portal (AR Activities → Edit).`);
}

async function fromSnapshot() {
  const data = JSON.parse(readFileSync(snapshot, "utf8"));
  console.log(`Installing from the snapshot (${data.activities.length} activities, saved ${data.exportedAt})`);
  for (const s of data.subjects) await db.insert(arActivitySubjects).values(dates(s, "createdAt")).onDuplicateKeyUpdate({ set: { name: s.name } });
  for (const l of data.lessons) await db.insert(lessons).values(dates(l, "createdAt", "updatedAt")).onDuplicateKeyUpdate({ set: { title: l.title } });
  for (const a of data.activities) {
    await db.insert(arActivities).values(dates(a, "createdAt", "updatedAt")).onDuplicateKeyUpdate({ set: { title: a.title } });
    console.log(`  activity ${a.activityKey} (${a.subject ?? "no subject"}, ${a.gradeLevel})`);
  }
  console.log("Done. The bundles are served from the asset bucket configured in .env.");
}

async function main() {
  const haveFolder = existsSync(join(folder, "activitiesLedger.json"));
  if (!haveFolder && !existsSync(snapshot)) throw new Error(`No content folder at ${folder} and no snapshot at ${snapshot}`);
  if (!keep) {
    console.log("Clearing existing AR content:");
    await wipeContent();
  }
  if (haveFolder) await fromFolder();
  else await fromSnapshot();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
