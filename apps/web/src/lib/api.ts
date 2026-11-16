"use client";

import { z } from "zod";
import { apiFailureSchema } from "@elimuar/shared";
import { clearSession, getAccessToken, getRefreshToken, getSessionRole, saveTokens } from "./session";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function refreshOnce(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const body = await response.json();
    if (!response.ok || !body?.ok) return false;
    const tokens = z.object({ accessToken: z.string(), refreshToken: z.string() }).safeParse(body.data.tokens);
    if (!tokens.success) return false;
    saveTokens(tokens.data.accessToken, tokens.data.refreshToken);
    return true;
  } catch {
    return false;
  }
}

export async function api<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  init: RequestInit = {},
  retry = true
): Promise<z.infer<T>> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(path.startsWith("/api") ? path : `/api${path}`, { ...init, headers });

  if (response.status === 401 && retry && (await refreshOnce())) {
    return api(path, schema, init, false);
  }

  const raw = await response.json().catch(() => null);

  if (!response.ok || (raw && raw.ok === false)) {
    const parsed = apiFailureSchema.safeParse(raw);
    if (parsed.success) {
      throw new ApiError(response.status, parsed.data.error.code, parsed.data.error.message, parsed.data.error.details);
    }
    throw new ApiError(response.status, "INTERNAL", "The server could not complete that request");
  }

  const data = z.object({ ok: z.literal(true), data: schema }).safeParse(raw);
  if (!data.success) {
    throw new ApiError(response.status, "SCHEMA_MISMATCH", "The server returned an unexpected shape", data.error.flatten());
  }
  return data.data.data as z.infer<T>;
}

export async function login(identifier: string, password: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password, portal: true }),
  });
  const raw = await response.json().catch(() => null);
  if (!response.ok || raw?.ok === false) {
    const parsed = apiFailureSchema.safeParse(raw);
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.error.code : "INTERNAL",
      parsed.success ? parsed.data.error.message : "Sign-in failed"
    );
  }
  return raw.data as { user: import("@elimuar/shared").SessionUser; tokens: { accessToken: string; refreshToken: string } };
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  const role = getSessionRole();
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(role ? { "x-role": role } : {}) },
      body: JSON.stringify({ refreshToken }),
    });
  } finally {
    clearSession();
  }
}
