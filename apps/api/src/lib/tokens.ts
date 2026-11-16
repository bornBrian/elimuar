import jwt from "jsonwebtoken";
import { and, eq, isNull } from "drizzle-orm";
import type { Role } from "@elimuar/shared";
import { db } from "../db/client.js";
import { refreshTokens } from "../db/schema.js";
import { randomToken, sha256 } from "./password.js";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? "dev-access-secret-change-me";
const REFRESH_TTL_DAYS = Number.parseInt(process.env.REFRESH_TOKEN_TTL_DAYS ?? "30", 10);
const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL ?? "15m";

export interface AccessClaims {
  sub: string;
  role: Role;
  schoolId: string | null;
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, ACCESS_SECRET, { expiresIn: ACCESS_TTL } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET);
    if (typeof decoded === "string") return null;
    return { sub: String(decoded.sub), role: decoded.role as Role, schoolId: (decoded.schoolId as string) ?? null };
  } catch {
    return null;
  }
}

function expiryDate(): Date {
  return new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export async function issueRefreshToken(userId: string): Promise<string> {
  const raw = randomToken(32);
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: sha256(raw),
    expiresAt: expiryDate(),
  });
  return raw;
}

export interface RotatedSession {
  userId: string;
  refreshToken: string;
}

export async function rotateRefreshToken(raw: string): Promise<RotatedSession | null> {
  const hash = sha256(raw);
  const [existing] = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.tokenHash, hash), isNull(refreshTokens.revokedAt)))
    .limit(1);

  if (!existing) return null;
  if (existing.expiresAt.getTime() < Date.now()) return null;

  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.id, existing.id));
  const refreshToken = await issueRefreshToken(existing.userId);
  return { userId: existing.userId, refreshToken };
}

export async function revokeRefreshToken(raw: string): Promise<void> {
  const hash = sha256(raw);
  await db.update(refreshTokens).set({ revokedAt: new Date() }).where(eq(refreshTokens.tokenHash, hash));
}

export function accessTokenTtlSeconds(): number {
  const match = /^(\d+)([smhd])$/.exec(ACCESS_TTL);
  if (!match) return 900;
  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  const factor = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86_400;
  return value * factor;
}
