import { basename, extname } from "node:path";
import { Router } from "express";
import multer from "multer";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  ERROR_CODES,
  brandingSchema,
  markNotificationsReadRequestSchema,
  notificationSchema,
} from "@elimuar/shared";
import { db } from "../db/client.js";
import { insertReturning, updateReturning } from "../db/helpers.js";
import { notifications, platformSettings, schools, users } from "../db/schema.js";
import { recordAudit } from "../lib/audit.js";
import { flushOutbox, providerStatus } from "../lib/notify.js";
import { HttpError, asyncHandler, parse, sendData } from "../lib/http.js";
import { signStoragePath } from "../lib/storageUrls.js";
import { requireAuth, requireRole, type AuthedRequest } from "../middleware/auth.js";

export const platformRouter = Router();

const ALLOWED_LOGO = [".svg", ".png", ".jpg", ".jpeg", ".webp"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    if (!ALLOWED_LOGO.includes(ext)) {
      cb(new HttpError(400, ERROR_CODES.VALIDATION_FAILED, "Upload an .svg, .png, .jpg or .webp logo"));
      return;
    }
    cb(null, true);
  },
});

interface BrandingRow {
  id: string;
  logoPath: string | null;
  logoUpdatedAt: Date | null;
  hasData: boolean;
}

async function readBranding(): Promise<BrandingRow> {
  const [row] = await db
    .select({
      id: platformSettings.id,
      logoPath: platformSettings.logoPath,
      logoUpdatedAt: platformSettings.logoUpdatedAt,
      hasData: sql<number>`(${platformSettings.logoData} is not null)`,
    })
    .from(platformSettings)
    .limit(1);

  if (row) return { ...row, hasData: Boolean(Number(row.hasData)) };

  const created = await insertReturning(platformSettings, {});
  return {
    id: created.id,
    logoPath: created.logoPath,
    logoUpdatedAt: created.logoUpdatedAt,
    hasData: created.logoData != null,
  };
}

function logoUrl(row: BrandingRow): string | null {
  if (row.hasData) return `/api/branding/logo?v=${row.logoUpdatedAt?.getTime() ?? 0}`;
  if (row.logoPath) return signStoragePath(`branding/${basename(row.logoPath)}`);
  return null;
}

function brandingPayload(row: BrandingRow) {
  return brandingSchema.parse({
    logoUrl: logoUrl(row),
    updatedAt: row.logoUpdatedAt?.toISOString() ?? null,
  });
}

platformRouter.get(
  "/branding",
  asyncHandler(async (_req, res) => {
    sendData(res, brandingPayload(await readBranding()));
  })
);

platformRouter.get(
  "/branding/logo",
  asyncHandler(async (_req, res) => {
    const [row] = await db
      .select({ mime: platformSettings.logoMime, data: platformSettings.logoData })
      .from(platformSettings)
      .limit(1);
    if (!row?.data) throw HttpError.notFound("No logo has been uploaded");

    res.setHeader("Content-Type", row.mime ?? "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(Buffer.from(row.data));
  })
);

platformRouter.post(
  "/branding",
  requireAuth,
  requireRole("platform_admin"),
  upload.single("logo"),
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!req.file) throw HttpError.badRequest("Attach the logo in the `logo` field");

    const current = await readBranding();
    const updated = await updateReturning(
      platformSettings,
      {
        logoMime: req.file.mimetype,
        logoData: req.file.buffer,
        logoPath: null,
        logoUpdatedAt: new Date(),
        updatedAt: new Date(),
      },
      eq(platformSettings.id, current.id)
    );
    if (!updated) throw HttpError.notFound("Platform settings not found");

    await recordAudit({
      actorId: req.auth!.userId,
      action: "branding.update",
      entity: "platform_settings",
      entityId: updated.id,
      metadata: { filename: req.file.originalname, mime: req.file.mimetype, bytes: req.file.size },
      ip: req.ip ?? null,
    });

    sendData(
      res,
      brandingPayload({
        id: updated.id,
        logoPath: updated.logoPath,
        logoUpdatedAt: updated.logoUpdatedAt,
        hasData: updated.logoData != null,
      })
    );
  })
);

platformRouter.delete(
  "/branding",
  requireAuth,
  requireRole("platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const current = await readBranding();
    const updated = await updateReturning(
      platformSettings,
      { logoMime: null, logoData: null, logoPath: null, logoUpdatedAt: new Date(), updatedAt: new Date() },
      eq(platformSettings.id, current.id)
    );
    if (!updated) throw HttpError.notFound("Platform settings not found");

    await recordAudit({
      actorId: req.auth!.userId,
      action: "branding.reset",
      entity: "platform_settings",
      entityId: updated.id,
      ip: req.ip ?? null,
    });

    sendData(res, brandingSchema.parse({ logoUrl: null, updatedAt: updated.logoUpdatedAt?.toISOString() ?? null }));
  })
);

function notificationScope(req: AuthedRequest) {
  const auth = req.auth!;
  if (auth.role === "platform_admin") return undefined;
  if (!auth.schoolId) throw HttpError.forbidden("Your account is not linked to a school");
  return eq(notifications.schoolId, auth.schoolId);
}
platformRouter.post(
  "/platform/notifications/flush",
  requireAuth,
  requireRole("platform_admin"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const providers = providerStatus();
    if (!providers.email && !providers.sms) {
      sendData(res, {
        sent: 0,
        failed: 0,
        remaining: -1,
        message: "No email or SMS provider is configured yet.",
      });
      return;
    }

    const result = await flushOutbox();
    await recordAudit({
      actorId: req.auth!.userId,
      action: "outbox.flush",
      entity: "notification",
      metadata: { ...result, email: providers.email, sms: providers.sms },
      ip: req.ip ?? null,
    });
    sendData(res, { ...result, message: `Delivery attempted for ${result.sent + result.failed} message(s).` });
  })
);

platformRouter.get(
  "/platform/notifications",
  requireAuth,
  requireRole("platform_admin", "school_admin", "academic_master", "secretary"),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number.parseInt((req.query.limit as string) ?? "100", 10) || 100, 300);
    const scope = notificationScope(req);

    const rows = await db
      .select({
        id: notifications.id,
        channel: notifications.channel,
        purpose: notifications.purpose,
        toAddress: notifications.toAddress,
        subject: notifications.subject,
        body: notifications.body,
        status: notifications.status,
        error: notifications.error,
        createdAt: notifications.createdAt,
        sentAt: notifications.sentAt,
        readAt: notifications.readAt,
        firstName: users.firstName,
        lastName: users.lastName,
        schoolName: schools.name,
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.userId, users.id))
      .leftJoin(schools, eq(notifications.schoolId, schools.id))
      .where(scope)
      .orderBy(desc(notifications.createdAt))
      .limit(limit);

    sendData(
      res,
      rows.map((row) =>
        notificationSchema.parse({
          id: row.id,
          channel: row.channel,
          purpose: row.purpose,
          toAddress: row.toAddress,
          subject: row.subject,
          body: row.body,
          status: row.status,
          error: row.error ?? null,
          createdAt: row.createdAt.toISOString(),
          sentAt: row.sentAt?.toISOString() ?? null,
          readAt: row.readAt?.toISOString() ?? null,
          recipientName: row.firstName ? `${row.firstName} ${row.lastName}` : null,
          schoolName: row.schoolName ?? null,
        })
      )
    );
  })
);

platformRouter.post(
  "/platform/notifications/read",
  requireAuth,
  requireRole("platform_admin", "school_admin", "academic_master", "secretary"),
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(markNotificationsReadRequestSchema, req.body ?? {});

    const scope = notificationScope(req);
    const where = and(
      isNull(notifications.readAt),
      ...(body.ids ? [inArray(notifications.id, body.ids)] : []),
      ...(scope ? [scope] : [])
    );

    const [before] = await db.select({ count: sql<number>`count(*)` }).from(notifications).where(where);
    const marked = Number(before?.count ?? 0);

    if (marked > 0) {
      await db.update(notifications).set({ readAt: new Date() }).where(where);
      await recordAudit({
        actorId: req.auth!.userId,
        action: body.ids ? "outbox.notifications.read" : "outbox.notifications.read_all",
        entity: "notification",
        metadata: { marked },
        ip: req.ip ?? null,
      });
    }

    sendData(res, { marked });
  })
);
