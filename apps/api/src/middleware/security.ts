import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { ERROR_CODES } from "@elimuar/shared";
import { HttpError } from "../lib/http.js";
import { verifyStorageSignature } from "../lib/storageUrls.js";

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  if (req.path.startsWith("/api")) {
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    res.setHeader("Cache-Control", "no-store");
  }

  next();
}

export function requireStorageSignature(req: Request, res: Response, next: NextFunction) {
  if (verifyStorageSignature(req.originalUrl)) {
    next();
    return;
  }

  res.status(403).json({
    ok: false,
    error: {
      code: ERROR_CODES.FORBIDDEN,
      message: "This file link is missing a valid signature. Fetch the file again from the API.",
    },
  });
}

export function allowedOrigins(): string[] {
  const origins = new Set<string>();

  const add = (value: string | undefined) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    try {
      origins.add(new URL(trimmed).origin);
    } catch {
    }
  };

  add(process.env.PORTAL_URL);
  for (const entry of (process.env.CORS_ORIGINS ?? "").split(",")) add(entry);

  if (process.env.NODE_ENV !== "production") {
    add("http://localhost:3000");
    add("http://127.0.0.1:3000");
  }

  return [...origins];
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1") return true;

  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;

  const parts = [match[1], match[2], match[3], match[4]].map((part) => Number(part));
  if (parts.some((part) => part > 255)) return false;

  const [first, second] = parts;
  if (first === 10) return true;
  if (first === 127) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 169 && second === 254) return true;
  return false;
}

export function originAllowed(origin: string | undefined, named: string[] = allowedOrigins()): boolean {
  if (!origin) return true;
  if (named.includes(origin)) return true;
  if (process.env.NODE_ENV === "production") return false;

  try {
    return isPrivateHost(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  scope: string;
  message?: string;
  countOnlyFailures?: boolean;
}

interface Bucket {
  hits: number[];
}

export function rateLimit(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  let lastSweep = Date.now();

  const sweep = (now: number) => {
    if (now - lastSweep < 60_000) return;
    lastSweep = now;
    for (const [key, bucket] of buckets) {
      bucket.hits = bucket.hits.filter((stamp) => now - stamp < options.windowMs);
      if (bucket.hits.length === 0) buckets.delete(key);
    }
  };

  return function limiter(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    sweep(now);

    const key = `${options.scope}:${callerKey(req)}`;
    const bucket = buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((stamp) => now - stamp < options.windowMs);

    if (bucket.hits.length >= options.max) {
      const oldest = bucket.hits[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((options.windowMs - (now - oldest)) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.setHeader("RateLimit-Limit", String(options.max));
      res.setHeader("RateLimit-Remaining", "0");
      res.setHeader("RateLimit-Reset", String(retryAfterSeconds));
      buckets.set(key, bucket);
      next(
        new HttpError(
          429,
          ERROR_CODES.TOO_MANY_ATTEMPTS,
          options.message ?? "Too many requests. Try again shortly.",
          { retryAfterSeconds }
        )
      );
      return;
    }

    const stamp = now;
    bucket.hits.push(stamp);
    buckets.set(key, bucket);

    res.setHeader("RateLimit-Limit", String(options.max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, options.max - bucket.hits.length)));

    if (options.countOnlyFailures) {
      res.on("finish", () => {
        if (res.statusCode < 400) return;
        const current = buckets.get(key);
        if (!current) return;
        const index = current.hits.indexOf(stamp);
        if (index >= 0) current.hits.splice(index, 1);
      });
    }

    next();
  };
}

function callerKey(req: Request): string {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return `token:${digest(header.slice("Bearer ".length).trim())}`;
  }

  const body = req.body as Record<string, unknown> | undefined;
  const identifier =
    (typeof body?.identifier === "string" && body.identifier) ||
    (typeof body?.studentIdentifier === "string" && body.studentIdentifier) ||
    (typeof body?.email === "string" && body.email) ||
    "";

  const address = req.ip ?? req.socket.remoteAddress ?? "unknown";
  return identifier ? `ip:${address}|id:${digest(identifier.trim().toLowerCase())}` : `ip:${address}`;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
