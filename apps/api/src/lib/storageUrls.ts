import { createHmac, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";

const KEY_LABEL = "elimuar.storage-url.v1";

export function storageLinkTtlSeconds(): number {
  const raw = Number(process.env.STORAGE_URL_TTL_SECONDS ?? "");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 3600;
}

export function apiOrigin(): string {
  return process.env.PUBLIC_API_URL ?? "http://localhost:4000";
}

function signingKey(): Buffer {
  const secret = process.env.JWT_ACCESS_SECRET ?? "dev-access-secret";
  return createHmac("sha256", secret).update(KEY_LABEL).digest();
}

function pathnameOf(relative: string): string {
  return `/storage/${relative.replace(/^\/+/, "")}`;
}

export function storageSignature(pathname: string, expiresAt: number): string {
  return createHmac("sha256", signingKey()).update(`${pathname}\n${expiresAt}`).digest("hex");
}

export function signStoragePath(relative: string, ttlSeconds = storageLinkTtlSeconds()): string {
  const pathname = pathnameOf(relative);
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${pathname}?exp=${expiresAt}&sig=${storageSignature(pathname, expiresAt)}`;
}

export function signedStorageUrl(relative: string, ttlSeconds = storageLinkTtlSeconds()): string {
  return `${apiOrigin()}${signStoragePath(relative, ttlSeconds)}`;
}

export function verifyStorageSignature(originalUrl: string): boolean {
  const [pathname, query] = originalUrl.split("?");
  if (!pathname) return false;

  const params = new URLSearchParams(query ?? "");
  const expiresAt = Number(params.get("exp"));
  const given = params.get("sig") ?? "";

  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;

  const expected = Buffer.from(storageSignature(pathname, expiresAt), "hex");
  const provided = Buffer.from(given, "hex");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/** Where uploaded files (logos, avatars) are kept on disk, served under /storage/assets. */
export const assetStorageDir = resolve(process.env.STORAGE_DIR ?? "./storage", "assets");
