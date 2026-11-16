"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "@elimuar/shared";
import { getUser } from "./session";

export interface SchoolScope {
  user: SessionUser | null;
  schoolId: string | null;
  isOverride: boolean;
}

export function useSchoolScope(): SchoolScope {
  const [scope, setScope] = useState<SchoolScope>({ user: null, schoolId: null, isOverride: false });

  useEffect(() => {
    const user = getUser();
    let override: string | null = null;
    try {
      override = new URLSearchParams(window.location.search).get("schoolId");
    } catch {
      override = null;
    }
    setScope({
      user,
      schoolId: override ?? user?.schoolId ?? null,
      isOverride: Boolean(override && override !== user?.schoolId),
    });
  }, []);

  return scope;
}
