import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { ERROR_CODES, SCHOOL_STAFF_MANAGER_ROLES, type Role } from "@elimuar/shared";
import { db } from "../db/client.js";
import { memberships } from "../db/schema.js";
import { HttpError } from "../lib/http.js";
import { verifyAccessToken } from "../lib/tokens.js";

export interface AuthContext {
  userId: string;
  role: Role;
  schoolId: string | null;
}

export interface AuthedRequest extends Request {
  auth?: AuthContext;
}

const ACCESS_TTL_MS = 10_000;
const accessCache = new Map<string, { allowed: boolean; checkedAt: number }>();

async function membershipStillAllows(userId: string, schoolId: string): Promise<boolean> {
  const key = `${userId}:${schoolId}`;
  const cached = accessCache.get(key);
  const now = Date.now();
  if (cached && now - cached.checkedAt < ACCESS_TTL_MS) return cached.allowed;

  const [row] = await db
    .select({ status: memberships.status })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.schoolId, schoolId)))
    .limit(1);

  const allowed = row?.status === "active";
  accessCache.set(key, { allowed, checkedAt: now });
  if (accessCache.size > 5000) accessCache.clear();
  return allowed;
}

export function forgetAccess(userId: string): void {
  for (const key of accessCache.keys()) {
    if (key.startsWith(`${userId}:`)) accessCache.delete(key);
  }
}

export async function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(HttpError.unauthenticated());
    return;
  }
  const claims = verifyAccessToken(header.slice("Bearer ".length).trim());
  if (!claims) {
    next(HttpError.unauthenticated("Your session has expired. Sign in again."));
    return;
  }

  if (claims.role !== "platform_admin" && claims.schoolId) {
    if (!(await membershipStillAllows(claims.sub, claims.schoolId))) {
      next(
        new HttpError(
          403,
          ERROR_CODES.ACCOUNT_INACTIVE,
          "Your access to this school has been suspended or withdrawn."
        )
      );
      return;
    }
  }

  req.auth = { userId: claims.sub, role: claims.role, schoolId: claims.schoolId };
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(HttpError.unauthenticated());
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(HttpError.forbidden());
      return;
    }
    next();
  };
}

export function isPlatformStaff(role: Role): boolean {
  return role === "platform_admin";
}

export function isSchoolStaffManager(role: Role): boolean {
  return SCHOOL_STAFF_MANAGER_ROLES.includes(role);
}

export function requireSchoolManager() {
  return requireRole("school_admin", "academic_master", "secretary", "platform_admin");
}

export function resolveSchoolId(req: AuthedRequest): string {
  const auth = req.auth;
  if (!auth) throw HttpError.unauthenticated();
  if (isPlatformStaff(auth.role)) {
    const requested = (req.query.schoolId as string | undefined) ?? (req.body?.schoolId as string | undefined);
    if (!requested) throw HttpError.badRequest("schoolId is required for platform staff");
    return requested;
  }
  if (!auth.schoolId) throw HttpError.forbidden("Your account is not linked to a school");
  return auth.schoolId;
}
