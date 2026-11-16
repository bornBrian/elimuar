"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { ApiError, api } from "./api";

export function useApi<T extends z.ZodTypeAny>(
  path: string | null,
  schema: T,
  deps: unknown[] = [],
  options: { intervalMs?: number } = {}
): {
  data: z.infer<T> | null;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
  reload: () => void;
} {
  const [data, setData] = useState<z.infer<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  const intervalMs = options.intervalMs ?? 0;
  const reload = useCallback(() => setNonce((value) => value + 1), []);

  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);

    const load = (silent: boolean) =>
      api(path, schemaRef.current)
        .then((payload) => {
          if (!active) return;
          setData(payload);
          setUpdatedAt(Date.now());
          setError(null);
        })
        .catch((cause: unknown) => {
          if (!active) return;
          setError(cause instanceof ApiError ? cause.message : "Could not load this data");
        })
        .finally(() => {
          if (active && !silent) setLoading(false);
        });

    void load(false);
    const timer = intervalMs > 0 ? setInterval(() => void load(true), intervalMs) : null;

    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, intervalMs, ...deps]);

  return { data, loading, error, updatedAt, reload };
}
