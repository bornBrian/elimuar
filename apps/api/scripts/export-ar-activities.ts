/** Saves the AR activity catalogue (rows, manifests and lessons) to seed-data/ar-activities.json. */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { asc, inArray } from "drizzle-orm";
import { db, pool } from "../src/db/client.js";
import { arActivities, arActivitySubjects, lessons } from "../src/db/schema.js";

const out = join(dirname(fileURLToPath(import.meta.url)), "../seed-data/ar-activities.json");

const activities = await db.select().from(arActivities).orderBy(asc(arActivities.sortOrder));
const lessonIds = activities.map((a) => a.lessonId).filter((id): id is string => !!id);
const lessonRows = lessonIds.length ? await db.select().from(lessons).where(inArray(lessons.id, lessonIds)) : [];
const subjectRows = await db.select().from(arActivitySubjects).orderBy(asc(arActivitySubjects.sortOrder));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  JSON.stringify(
    {
      format: "elimuar-ar-catalogue/1",
      exportedAt: new Date().toISOString(),
      subjects: subjectRows,
      lessons: lessonRows.map((l) => ({ ...l, createdBy: null })),
      activities: activities.map((a) => ({ ...a, uploadedBy: null })),
    },
    null,
    1
  )
);
console.log(`Saved ${activities.length} activities to ${out}`);
await pool.end();
