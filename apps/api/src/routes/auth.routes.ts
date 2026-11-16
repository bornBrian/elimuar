import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { Router } from "express";
import multer from "multer";
import { and, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import {
  ERROR_CODES,
  WEB_ROLES,
  emailChangeConfirmRequestSchema,
  emailChangeRequestSchema,
  loginRequestSchema,
  passwordChangeRequestSchema,
  passwordRequestSchema,
  passwordResetRequestSchema,
  passwordVerifyRequestSchema,
  refreshRequestSchema,
  registerCompleteRequestSchema,
  registerContextRequestSchema,
  registerVerifyCodeRequestSchema,
  registerVerifyRequestSchema,
  studentLoginRequestSchema,
  updateProfileRequestSchema,
  type Membership,
  type Role,
  type SessionUser,
} from "@elimuar/shared";
import { db } from "../db/client.js";
import { newId } from "../db/helpers.js";

import { classes, memberships, passwordResetCodes, refreshTokens, schools, studentEnrollments, users } from "../db/schema.js";
import { recordAudit } from "../lib/audit.js";
import { HttpError, asyncHandler, parse, sendData } from "../lib/http.js";
import { signedStorageUrl } from "../lib/storageUrls.js";
import { generateOtp, hashPassword, sha256, verifyPassword } from "../lib/password.js";
import {
  accessTokenTtlSeconds,
  issueRefreshToken,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from "../lib/tokens.js";
import { AVATAR_MAX_BYTES, sanitizeAvatar } from "../lib/imageIntake.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import {
  queueNotification,
  queuePasswordResetLink,
  queueVerificationCode,
} from "../lib/notify.js";

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "your email";
  const visible = name.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(name.length - 1, 3))}@${domain}`;
}

export const authRouter = Router();

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const SETUP_TTL_MS = 15 * 60 * 1000;
const PORTAL_URL = process.env.PORTAL_URL ?? "http://localhost:3000";

function makeSetupToken(rowId: string, code: string): string {
  return `${rowId}.${code}.${sha256(`${rowId}:${code}`)}`;
}

async function consumeSetupToken(token: string) {
  const [rowId, code, signature] = token.split(".");
  const invalid = () => new HttpError(400, ERROR_CODES.INVALID_TOKEN, "This link is not valid. Start again.");
  if (!rowId || !code || !signature) throw invalid();
  if (signature !== sha256(`${rowId}:${code}`)) throw invalid();

  const [row] = await db.select().from(passwordResetCodes).where(eq(passwordResetCodes.id, rowId)).limit(1);
  if (!row) throw invalid();
  if (row.codeHash !== sha256(code)) throw invalid();
  if (row.expiresAt.getTime() < Date.now()) throw new HttpError(400, ERROR_CODES.TOKEN_EXPIRED, "This link has expired");
  return row;
}

function sameWords(a: string, b: string): boolean {
  return a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");
}

function phoneTail(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "").slice(-9);
}

async function findUserByIdentifier(identifier: string) {
  const raw = identifier.trim();
  const lowered = raw.toLowerCase();

  if (lowered.includes("@")) {
    const [byEmail] = await db.select().from(users).where(eq(users.email, lowered)).limit(1);
    return byEmail ?? null;
  }

  const [byPhone] = await db.select().from(users).where(eq(users.phone, raw)).limit(1);
  if (byPhone) return byPhone;

  const compact = raw.replace(/[\/\s-]/g, "");
  const [enrollment] = await db
    .select({ studentId: studentEnrollments.studentId })
    .from(studentEnrollments)
    .where(
      or(
        eq(studentEnrollments.studentIdentifier, raw),
        like(studentEnrollments.studentIdentifier, raw),
        eq(
          sql`replace(replace(${studentEnrollments.studentIdentifier}, '/', ''), ' ', '')`,
          compact
        )
      )
    )
    .limit(1);

  if (!enrollment) return null;
  const [student] = await db.select().from(users).where(eq(users.id, enrollment.studentId)).limit(1);
  return student ?? null;
}

export function avatarUrlFor(path: string | null): string | null {
  if (!path) return null;
  return signedStorageUrl(`avatars/${basename(path)}`);
}

async function studentEnrolment(
  studentId: string,
): Promise<{ className: string | null; studentIdentifier: string | null }> {
  const [row] = await db
    .select({
      className: classes.gradeLevel,
      studentIdentifier: studentEnrollments.studentIdentifier,
    })
    .from(studentEnrollments)
    .innerJoin(classes, eq(studentEnrollments.classId, classes.id))
    .where(
      and(
        eq(studentEnrollments.studentId, studentId),
        eq(studentEnrollments.status, "active"),
      ),
    )
    .limit(1);

  return {
    className: row?.className ?? null,
    studentIdentifier: row?.studentIdentifier ?? null,
  };
}

async function buildSessionUser(user: typeof users.$inferSelect, activeRole?: Role): Promise<SessionUser> {
  const rows = await db
    .select({
      membershipId: memberships.id,
      role: memberships.role,
      status: memberships.status,
      schoolId: memberships.schoolId,
      schoolName: schools.name,
    })
    .from(memberships)
    .leftJoin(schools, eq(memberships.schoolId, schools.id))
    .where(eq(memberships.userId, user.id));

  const list: Membership[] = rows
    .filter((r) => r.status === "active")
    .map((r) => ({
      membershipId: r.membershipId,
      role: r.role,
      status: r.status,
      schoolId: r.schoolId,
      schoolName: r.schoolName,
    }));

  const priority: Role[] = [
    "platform_admin",
    "school_admin",
    "academic_master",
    "secretary",
    "teacher",
    "student",
  ];
  const role = activeRole ?? priority.find((r) => list.some((m) => m.role === r)) ?? "student";
  const active = list.find((m) => m.role === role) ?? list[0] ?? null;

  const mustChangePassword = role === "student" ? !user.pinChangedAt : !user.pinChangedAt && !user.claimedAt;

  const enrolment = role === "student"
    ? await studentEnrolment(user.id)
    : { className: null, studentIdentifier: null };

  return {
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    schoolId: active?.schoolId ?? null,
    schoolName: active?.schoolName ?? null,
    className: enrolment.className,
    studentIdentifier: enrolment.studentIdentifier,
    avatarUrl: avatarUrlFor(user.avatarPath),
    role,
    memberships: list,
    mustChangePassword,
  };
}

async function issueSession(user: SessionUser) {
  const tokens = {
    accessToken: signAccessToken({ sub: user.userId, role: user.role, schoolId: user.schoolId }),
    refreshToken: await issueRefreshToken(user.userId),
    expiresInSeconds: accessTokenTtlSeconds(),
  };
  return tokens;
}

async function schoolAccessStatus(schoolId: string | null): Promise<"active" | "suspended" | "pending" | null> {
  if (!schoolId) return null;
  const [row] = await db.select({ status: schools.status }).from(schools).where(eq(schools.id, schoolId)).limit(1);
  return row?.status ?? null;
}

function refuseInactiveSchool(status: "suspended" | "pending"): HttpError {
  return new HttpError(
    403,
    ERROR_CODES.ACCOUNT_INACTIVE,
    status === "suspended"
      ? "This school's ElimuAR access is suspended. Contact the platform administrator."
      : "This school is still being set up. Contact the platform administrator."
  );
}

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = parse(loginRequestSchema, req.body);
    const user = await findUserByIdentifier(body.identifier);

    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      if (user && !user.claimedAt) {
        throw new HttpError(
          403,
          ERROR_CODES.ACCOUNT_NOT_REGISTERED,
          "This account was created for you. Register to choose your own password."
        );
      }
      throw new HttpError(401, ERROR_CODES.INVALID_CREDENTIALS, "Those details do not match an account");
    }

    const sessionUser = await buildSessionUser(user, body.intent);
    if (sessionUser.memberships.length === 0) {
      throw new HttpError(403, ERROR_CODES.ACCOUNT_INACTIVE, "This account has no active membership");
    }

    const schoolStatus = await schoolAccessStatus(sessionUser.schoolId);
    if (schoolStatus && schoolStatus !== "active") throw refuseInactiveSchool(schoolStatus);

    if (body.asRole === "student" && sessionUser.role !== "student") {
      throw new HttpError(
        403,
        ERROR_CODES.FORBIDDEN,
        "Those are staff credentials. Sign in from the staff portal instead."
      );
    }

    if (body.portal && !WEB_ROLES.includes(sessionUser.role)) {
      throw new HttpError(
        403,
        ERROR_CODES.STUDENT_WEB_ACCESS_DISABLED,
        "Student accounts sign in on the ElimuAR mobile app, not the web portal"
      );
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    sendData(res, { user: sessionUser, tokens: await issueSession(sessionUser) });
  })
);

authRouter.post(
  "/student/login",
  asyncHandler(async (req, res) => {
    const body = parse(studentLoginRequestSchema, req.body);
    const identifier = body.studentIdentifier.trim();

    const compactId = identifier.replace(/[/\s-]/g, "");
    const rows = await db
      .select({
        schoolId: studentEnrollments.schoolId,
        enrollmentId: studentEnrollments.id,
        status: studentEnrollments.status,
        userId: users.id,
        passwordHash: users.passwordHash,
        claimedAt: users.claimedAt,
      })
      .from(studentEnrollments)
      .innerJoin(users, eq(studentEnrollments.studentId, users.id))
      .where(
        or(
          eq(studentEnrollments.studentIdentifier, identifier),
          eq(
            sql`replace(replace(${studentEnrollments.studentIdentifier}, '/', ''), ' ', '')`,
            compactId
          )
        )
      )
      .limit(20);

    const refused = new HttpError(
      401,
      ERROR_CODES.INVALID_CREDENTIALS,
      "That admission number and password do not match a student record"
    );
    const candidates = body.schoolId ? rows.filter((r) => r.schoolId === body.schoolId) : rows;
    if (candidates.length === 0) throw refused;

    const row = candidates.find((candidate) => verifyPassword(body.password, candidate.passwordHash));
    if (!row) throw refused;

    if (row.status !== "active") {
      throw new HttpError(
        403,
        ERROR_CODES.ACCOUNT_INACTIVE,
        "This student is no longer enrolled at this school. Ask your teacher."
      );
    }

    const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    const sessionUser = await buildSessionUser(user);
    if (sessionUser.memberships.length === 0) {
      throw new HttpError(403, ERROR_CODES.ACCOUNT_INACTIVE, "This account has no active membership");
    }

    const schoolStatus = await schoolAccessStatus(body.schoolId ?? row.schoolId);
    if (schoolStatus && schoolStatus !== "active") throw refuseInactiveSchool(schoolStatus);

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    sendData(res, { user: sessionUser, tokens: await issueSession(sessionUser) });
  })
);

authRouter.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const body = parse(refreshRequestSchema, req.body);
    const rotated = await rotateRefreshToken(body.refreshToken);
    if (!rotated) throw new HttpError(401, ERROR_CODES.INVALID_TOKEN, "Session expired. Sign in again.");

    const [row] = await db.select().from(users).where(eq(users.id, rotated.userId)).limit(1);
    if (!row) throw new HttpError(401, ERROR_CODES.INVALID_TOKEN, "Session expired. Sign in again.");

    const user = await buildSessionUser(row);
    sendData(res, { tokens: await issueSession(user) });
  })
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    if (typeof req.body?.refreshToken === "string") {
      await revokeRefreshToken(req.body.refreshToken);
    }
    sendData(res, { revoked: true });
  })
);

async function endOpenSessions(userId: string, keepHash: string | null): Promise<number> {
  const open = await db
    .select({ id: refreshTokens.id, tokenHash: refreshTokens.tokenHash })
    .from(refreshTokens)
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));

  const targets = open.filter((row) => row.tokenHash !== keepHash);
  if (targets.length === 0) return 0;

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      inArray(
        refreshTokens.id,
        targets.map((row) => row.id)
      )
    );

  return targets.length;
}

authRouter.post(
  "/password/change",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(passwordChangeRequestSchema, req.body);
    const auth = req.auth!;

    const [user] = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
    if (!user) throw HttpError.notFound("Account not found");

    if (!verifyPassword(body.currentPassword, user.passwordHash)) {
      throw new HttpError(400, ERROR_CODES.INVALID_CREDENTIALS, "That is not your current password.");
    }
    if (body.currentPassword === body.newPassword) {
      throw HttpError.badRequest("The new password is the same as the current one.");
    }

    await db
      .update(users)
      .set({
        passwordHash: hashPassword(body.newPassword),
        pinChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    const ended = await endOpenSessions(user.id, body.refreshToken ? sha256(body.refreshToken) : null);

    await recordAudit({
      actorId: user.id,
      action: "account.password_change",
      entity: "user",
      entityId: user.id,
      schoolId: auth.schoolId,
      metadata: { otherSessionsEnded: ended },
      ip: req.ip ?? null,
    });

    sendData(res, { message: "Your password has been changed.", otherSessionsEnded: ended });
  })
);

authRouter.post(
  "/sessions/revoke",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const auth = req.auth!;
    const ended = await endOpenSessions(auth.userId, null);

    await recordAudit({
      actorId: auth.userId,
      action: "account.sessions_revoked",
      entity: "user",
      entityId: auth.userId,
      schoolId: auth.schoolId,
      metadata: { sessionsEnded: ended },
      ip: req.ip ?? null,
    });

    sendData(res, {
      message: ended === 1 ? "Your session has been signed out." : `${ended} sessions have been signed out.`,
      revoked: ended,
    });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const [user] = await db.select().from(users).where(eq(users.id, req.auth!.userId)).limit(1);
    if (!user) throw HttpError.notFound("Account not found");
    sendData(res, { user: await buildSessionUser(user, req.auth!.role) });
  })
);

authRouter.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(updateProfileRequestSchema, req.body);
    await db
      .update(users)
      .set({
        ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
        ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.locale !== undefined ? { locale: body.locale } : {}),
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.auth!.userId));

    const [user] = await db.select().from(users).where(eq(users.id, req.auth!.userId)).limit(1);
    sendData(res, { user: await buildSessionUser(user, req.auth!.role) });
  })
);

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
});

authRouter.post(
  "/me/avatar",
  requireAuth,
  avatarUpload.single("picture"),
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!req.file) throw HttpError.badRequest("Attach a JPG or PNG in the `picture` field");

    const cleaned = sanitizeAvatar(req.file.buffer);
    if (!cleaned.ok) throw new HttpError(400, ERROR_CODES.VALIDATION_FAILED, cleaned.reason);

    const dir = resolve(process.env.STORAGE_DIR ?? "./storage", "avatars");
    mkdirSync(dir, { recursive: true });

    const filename = `${req.auth!.userId}-${Date.now()}.${cleaned.kind === "jpeg" ? "jpg" : "png"}`;
    writeFileSync(resolve(dir, filename), cleaned.bytes);

    const [previous] = await db
      .select({ avatarPath: users.avatarPath })
      .from(users)
      .where(eq(users.id, req.auth!.userId))
      .limit(1);

    await db
      .update(users)
      .set({ avatarPath: `avatars/${filename}`, updatedAt: new Date() })
      .where(eq(users.id, req.auth!.userId));

    if (previous?.avatarPath) {
      try {
        const stale = resolve(process.env.STORAGE_DIR ?? "./storage", previous.avatarPath);
        if (existsSync(stale)) unlinkSync(stale);
      } catch {
      }
    }

    const [user] = await db.select().from(users).where(eq(users.id, req.auth!.userId)).limit(1);
    sendData(res, { user: await buildSessionUser(user, req.auth!.role) });
  })
);

authRouter.delete(
  "/me/avatar",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const [previous] = await db
      .select({ avatarPath: users.avatarPath })
      .from(users)
      .where(eq(users.id, req.auth!.userId))
      .limit(1);

    await db.update(users).set({ avatarPath: null, updatedAt: new Date() }).where(eq(users.id, req.auth!.userId));

    if (previous?.avatarPath) {
      try {
        const stale = resolve(process.env.STORAGE_DIR ?? "./storage", previous.avatarPath);
        if (existsSync(stale)) unlinkSync(stale);
      } catch {
      }
    }

    const [user] = await db.select().from(users).where(eq(users.id, req.auth!.userId)).limit(1);
    sendData(res, { user: await buildSessionUser(user, req.auth!.role) });
  })
);

authRouter.post(
  "/email/change",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(emailChangeRequestSchema, req.body);
    const auth = req.auth!;

    const [user] = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
    if (!user) throw HttpError.notFound("Account not found");

    const newEmail = body.newEmail.trim().toLowerCase();
    if (newEmail === user.email) {
      throw HttpError.badRequest("That is already your email address.");
    }

    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, newEmail)).limit(1);
    if (taken) {
      throw HttpError.conflict("That email address is already in use by another account.");
    }

    const code = generateOtp(6);
    await db.insert(passwordResetCodes).values({
      userId: user.id,
      codeHash: sha256(code),
      channel: "email",
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    await queueVerificationCode({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      code,
      ttlMinutes: Math.round(OTP_TTL_MS / 60000),
      purpose: "email_change_code",
      subject: "Confirm your ElimuAR email change",
      heading: "Confirm your email change",
      intro: `A request was made to change the email on your ElimuAR account to ${newEmail}. Enter this code on the profile screen to confirm.`,
    });

    sendData(res, {
      sent: true,
      expiresInSeconds: OTP_TTL_MS / 1000,
      currentEmailMasked: maskEmail(user.email),
    });
  })
);

authRouter.post(
  "/email/change/confirm",
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parse(emailChangeConfirmRequestSchema, req.body);
    const auth = req.auth!;

    const [user] = await db.select().from(users).where(eq(users.id, auth.userId)).limit(1);
    if (!user) throw HttpError.notFound("Account not found");

    const newEmail = body.newEmail.trim().toLowerCase();
    if (newEmail === user.email) {
      throw HttpError.badRequest("That is already your email address.");
    }

    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, newEmail)).limit(1);
    if (taken) {
      throw HttpError.conflict("That email address is already in use by another account.");
    }

    const [row] = await db
      .select()
      .from(passwordResetCodes)
      .where(and(eq(passwordResetCodes.userId, user.id), eq(passwordResetCodes.codeHash, sha256(body.code))))
      .limit(1);

    if (!row) throw new HttpError(400, ERROR_CODES.INVALID_CODE, "That code is not valid");
    if (row.expiresAt.getTime() < Date.now()) {
      throw new HttpError(400, ERROR_CODES.CODE_EXPIRED, "That code has expired. Request a new one.");
    }
    if (row.attempts >= MAX_OTP_ATTEMPTS) throw HttpError.tooMany();

    await db.delete(passwordResetCodes).where(eq(passwordResetCodes.id, row.id));
    await db.update(users).set({ email: newEmail, updatedAt: new Date() }).where(eq(users.id, user.id));

    await endOpenSessions(user.id, null);

    await recordAudit({
      actorId: user.id,
      action: "account.email_change",
      entity: "user",
      entityId: user.id,
      schoolId: auth.schoolId,
      metadata: { from: maskEmail(user.email), to: maskEmail(newEmail) },
      ip: req.ip ?? null,
    });

    const [updated] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    sendData(res, {
      message: "Your email has been updated.",
      user: await buildSessionUser(updated, auth.role),
    });
  })
);

authRouter.post(
  "/password/request",
  asyncHandler(async (req, res) => {
    const body = parse(passwordRequestSchema, req.body);
    const user = await findUserByIdentifier(body.identifier);
    const channel: "email" | "sms" = body.identifier.includes("@") ? "email" : "sms";

    if (!user) {
      sendData(res, { sent: true, channel, expiresInSeconds: OTP_TTL_MS / 1000 });
      return;
    }

    if (channel === "email") {
      const code = generateOtp(6);
      const rowId = newId();
      await db.insert(passwordResetCodes).values({
        id: rowId,
        userId: user.id,
        codeHash: sha256(code),
        channel,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      });
      const resetToken = makeSetupToken(rowId, code);
      await queuePasswordResetLink({
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        resetUrl: `${PORTAL_URL}/set-password?token=${encodeURIComponent(resetToken)}&mode=reset`,
      });
      sendData(res, { sent: true, channel, expiresInSeconds: 60 * 60 });
      return;
    }

    const code = generateOtp(6);
    await db.insert(passwordResetCodes).values({
      userId: user.id,
      codeHash: sha256(code),
      channel,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });
    await queueNotification({
      userId: user.id,
      channel: "sms",
      purpose: "password_reset",
      toAddress: user.phone ?? body.identifier,
      body: `ElimuAR: your password reset code is ${code}. It expires in 10 minutes.`,
    });
    sendData(res, { sent: true, channel, expiresInSeconds: OTP_TTL_MS / 1000 });
  })
);

authRouter.post(
  "/password/verify",
  asyncHandler(async (req, res) => {
    const body = parse(passwordVerifyRequestSchema, req.body);
    const user = await findUserByIdentifier(body.identifier);
    if (!user) throw new HttpError(400, ERROR_CODES.INVALID_CODE, "That code is not valid");

    const [row] = await db
      .select()
      .from(passwordResetCodes)
      .where(and(eq(passwordResetCodes.userId, user.id), eq(passwordResetCodes.codeHash, sha256(body.code))))
      .limit(1);

    if (!row) throw new HttpError(400, ERROR_CODES.INVALID_CODE, "That code is not valid");
    if (row.expiresAt.getTime() < Date.now()) throw new HttpError(400, ERROR_CODES.CODE_EXPIRED, "That code has expired");
    if (row.attempts >= MAX_OTP_ATTEMPTS) throw HttpError.tooMany();

    await db
      .update(passwordResetCodes)
      .set({ attempts: row.attempts + 1, consumedAt: new Date() })
      .where(eq(passwordResetCodes.id, row.id));

    const resetToken = makeSetupToken(row.id, body.code);
    sendData(res, { resetToken, expiresInSeconds: SETUP_TTL_MS / 1000 });
  })
);

authRouter.post(
  "/password/reset",
  asyncHandler(async (req, res) => {
    const body = parse(passwordResetRequestSchema, req.body);
    const row = await consumeSetupToken(body.resetToken);
    if (!row.consumedAt) throw new HttpError(400, ERROR_CODES.INVALID_TOKEN, "Verify the code first");

    await db
      .update(users)
      .set({ passwordHash: hashPassword(body.newPassword), updatedAt: new Date() })
      .where(eq(users.id, row.userId));
    await db.delete(passwordResetCodes).where(eq(passwordResetCodes.userId, row.userId));

    sendData(res, { message: "Password updated. You can sign in now." });
  })
);

authRouter.post(
  "/register/verify",
  asyncHandler(async (req, res) => {
    const body = parse(registerVerifyRequestSchema, req.body);
    const email = body.email.trim().toLowerCase();

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const mismatch = new HttpError(
      404,
      ERROR_CODES.NOT_FOUND,
      "We could not find an account waiting for those details. Check with your school head, or sign in if you already set a password."
    );

    if (!user) throw mismatch;
    if (user.claimedAt) {
      throw new HttpError(
        409,
        ERROR_CODES.CONFLICT,
        "This account has already been registered. Sign in instead, or use “Forgot your password?”."
      );
    }
    if (!sameWords(user.firstName, body.firstName) || !sameWords(user.lastName, body.lastName)) throw mismatch;

    if (user.phone && phoneTail(user.phone) !== phoneTail(body.phone)) throw mismatch;

    const [membership] = await db
      .select({ role: memberships.role, schoolId: memberships.schoolId, schoolName: schools.name })
      .from(memberships)
      .leftJoin(schools, eq(memberships.schoolId, schools.id))
      .where(and(eq(memberships.userId, user.id), eq(memberships.status, "active")))
      .limit(1);

    if (!membership) {
      throw new HttpError(403, ERROR_CODES.ACCOUNT_INACTIVE, "This account has no active membership at a school");
    }

    const code = generateOtp(6);
    await db.insert(passwordResetCodes).values({
      userId: user.id,
      codeHash: sha256(code),
      channel: "email",
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    await queueVerificationCode({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      code,
      ttlMinutes: Math.round(OTP_TTL_MS / 60000),
      purpose: "registration_code",
      subject: "Finish setting up your ElimuAR account",
      heading: "Finish setting up your account",
      intro: "Enter this code on the registration page to confirm your details and choose your password.",
    });

    sendData(res, {
      maskedEmail: maskEmail(user.email),
      expiresInSeconds: OTP_TTL_MS / 1000,
    });
  })
);

authRouter.post(
  "/register/context",
  asyncHandler(async (req, res) => {
    const body = parse(registerContextRequestSchema, req.body);
    const row = await consumeSetupToken(body.token);

    const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (!user) throw new HttpError(400, ERROR_CODES.INVALID_TOKEN, "This link is not valid. Start again.");

    const [membership] = await db
      .select({ role: memberships.role, schoolName: schools.name })
      .from(memberships)
      .leftJoin(schools, eq(memberships.schoolId, schools.id))
      .where(and(eq(memberships.userId, user.id), eq(memberships.status, "active")))
      .limit(1);

    sendData(res, {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: membership?.role ?? "teacher",
      schoolName: membership?.schoolName ?? null,
      isReset: user.claimedAt !== null,
      expiresInSeconds: SETUP_TTL_MS / 1000,
    });
  })
);

authRouter.post(
  "/register/verify-code",
  asyncHandler(async (req, res) => {
    const body = parse(registerVerifyCodeRequestSchema, req.body);
    const email = body.email.trim().toLowerCase();

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || user.claimedAt) throw new HttpError(400, ERROR_CODES.INVALID_CODE, "That code is not valid");

    const [row] = await db
      .select()
      .from(passwordResetCodes)
      .where(and(eq(passwordResetCodes.userId, user.id), eq(passwordResetCodes.codeHash, sha256(body.code))))
      .limit(1);

    if (!row) throw new HttpError(400, ERROR_CODES.INVALID_CODE, "That code is not valid");
    if (row.expiresAt.getTime() < Date.now()) {
      throw new HttpError(400, ERROR_CODES.CODE_EXPIRED, "That code has expired. Start registration again.");
    }
    if (row.attempts >= MAX_OTP_ATTEMPTS) throw HttpError.tooMany();

    await db
      .update(passwordResetCodes)
      .set({ attempts: row.attempts + 1, consumedAt: new Date() })
      .where(eq(passwordResetCodes.id, row.id));

    const [membership] = await db
      .select({ role: memberships.role, schoolId: memberships.schoolId, schoolName: schools.name })
      .from(memberships)
      .leftJoin(schools, eq(memberships.schoolId, schools.id))
      .where(and(eq(memberships.userId, user.id), eq(memberships.status, "active")))
      .limit(1);

    sendData(res, {
      registrationToken: makeSetupToken(row.id, body.code),
      expiresInSeconds: SETUP_TTL_MS / 1000,
      account: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: membership?.role ?? "teacher",
        schoolName: membership?.schoolName ?? null,
      },
    });
  })
);

authRouter.post(
  "/register/complete",
  asyncHandler(async (req, res) => {
    const body = parse(registerCompleteRequestSchema, req.body);
    const row = await consumeSetupToken(body.registrationToken);

    const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
    if (!user) throw new HttpError(400, ERROR_CODES.INVALID_TOKEN, "This link is not valid. Start again.");
    const isReset = user.claimedAt !== null;

    await db
      .update(users)
      .set({
        passwordHash: hashPassword(body.password),
        ...(isReset ? {} : { claimedAt: new Date(), pinChangedAt: new Date() }),
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
    await db.delete(passwordResetCodes).where(eq(passwordResetCodes.userId, user.id));

    if (isReset) {
      await endOpenSessions(user.id, null);
      sendData(res, { message: "Password updated. You can sign in now." });
      return;
    }

    const sessionUser = await buildSessionUser(user);
    if (sessionUser.memberships.length === 0) {
      throw new HttpError(403, ERROR_CODES.ACCOUNT_INACTIVE, "This account has no active membership");
    }
    sendData(res, { user: sessionUser, tokens: await issueSession(sessionUser) });
  })
);
