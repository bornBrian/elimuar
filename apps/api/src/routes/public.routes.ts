import { Router } from "express";
import { and, asc, eq, like, or } from "drizzle-orm";
import { basename } from "node:path";
import { db } from "../db/client.js";
import { arActivities, districts, regions, schools } from "../db/schema.js";
import { imagePath } from "../lib/arActivity.js";
import { asyncHandler, sendData } from "../lib/http.js";

/** What anyone may read without signing in: the schools a new teacher can register at, and the published
   activities the sign-in page shows. */
export const publicRouter = Router();
publicRouter.get(
  "/public/schools",
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const rows = await db
      .select({
        id: schools.id,
        name: schools.name,
        code: schools.code,
        level: schools.level,
        districtName: districts.name,
        regionName: regions.name,
      })
      .from(schools)
      .leftJoin(districts, eq(schools.districtId, districts.id))
      .leftJoin(regions, eq(districts.regionId, regions.id))
      .where(
        and(
          eq(schools.status, "active"),
          q
            ? or(like(schools.name, `%${q}%`), like(schools.code, `%${q}%`))
            : undefined
        )
      )
      .orderBy(asc(schools.name))
      .limit(25);

    sendData(res, rows);
  })
);

publicRouter.get(
  "/public/activities",
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({
        key: arActivities.activityKey,
        title: arActivities.title,
        subject: arActivities.subject,
        gradeLevel: arActivities.gradeLevel,
        thumbnail: arActivities.thumbnailObjectKey,
      })
      .from(arActivities)
      .where(eq(arActivities.status, "published"))
      .orderBy(asc(arActivities.sortOrder));
    sendData(
      res,
      rows
        .filter((r) => r.thumbnail)
        .map((r) => ({ key: r.key, title: r.title, subject: r.subject, gradeLevel: r.gradeLevel, imageUrl: imagePath(basename(r.thumbnail!)) }))
    );
  })
);
