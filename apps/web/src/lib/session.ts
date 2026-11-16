"use client";

import { sessionUserSchema, type SessionUser } from "@elimuar/shared";

const ACCESS_KEY = "elimuar.access";
const REFRESH_KEY = "elimuar.refresh";
const USER_KEY = "elimuar.user";

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export function saveSession(session: StoredSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_KEY, session.accessToken);
  localStorage.setItem(REFRESH_KEY, session.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const parsed = sessionUserSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveTokens(accessToken: string, refreshToken: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function getSessionRole(): SessionUser["role"] | null {
  return getUser()?.role ?? null;
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

export function roleHome(role: SessionUser["role"]): string {
  switch (role) {
    case "platform_admin":
      return "/admin";
    case "school_admin":
    case "academic_master":
    case "secretary":
      return "/head";
    case "teacher":
      return "/login?error=teacher";
    default:
      return "/login?error=student";
  }
}
