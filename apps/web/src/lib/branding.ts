"use client";

import { useEffect, useState } from "react";
import { brandingSchema, type Branding } from "@elimuar/shared";
import { api } from "./api";
import { getAccessToken } from "./session";

const FALLBACK: Branding = { logoUrl: null, updatedAt: null };

let cached: Branding | null = null;
let inFlight: Promise<Branding> | null = null;

const listeners = new Set<(branding: Branding) => void>();

export function useBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(cached ?? FALLBACK);

  useEffect(() => {
    listeners.add(setBranding);
    if (!cached) {
      let active = true;
      inFlight ??= api("/api/branding", brandingSchema).catch(() => FALLBACK);
      void inFlight.then((value) => {
        cached = value;
        if (active) setBranding(value);
      });
    }
    return () => {
      listeners.delete(setBranding);
    };
  }, []);

  return branding;
}

export function setBranding(next: Branding): void {
  cached = next;
  for (const listener of listeners) listener(next);
}

export async function uploadBranding(file: File): Promise<Branding> {
  const body = new FormData();
  body.append("logo", file);
  const token = getAccessToken();

  const response = await fetch("/api/branding", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message ?? "The upload failed");

  const next = brandingSchema.parse(payload.data);
  setBranding(next);
  return next;
}

export async function resetBranding(): Promise<Branding> {
  const token = getAccessToken();
  const response = await fetch("/api/branding", {
    method: "DELETE",
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error?.message ?? "Could not reset the mark");

  const next = brandingSchema.parse(payload.data);
  setBranding(next);
  return next;
}
