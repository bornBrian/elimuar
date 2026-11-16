"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "@/components/BrandMark";

export function useDelayedLoading(loading: boolean, delayMs = 200): boolean {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!loading) {
      setDelayed(false);
      return;
    }
    const timer = window.setTimeout(() => setDelayed(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [loading, delayMs]);

  return loading && delayed;
}

export function Skeleton({
  className = "h-4 w-full",
  row,
}: {
  className?: string;
  row?: number;
}) {
  const stagger = row ? ` skeleton-row-${Math.min(6, Math.max(1, row))}` : "";
  return <span aria-hidden className={`skeleton ${className}${stagger}`} />;
}

export function SkeletonText({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-label="Loading">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} row={index + 1} className={index === lines - 1 ? "h-3.5 w-2/3" : "h-3.5 w-full"} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-white p-4 sm:p-5 ${className}`} role="status" aria-label="Loading">
      <Skeleton className="h-3 w-24" row={1} />
      <Skeleton className="mt-3 h-7 w-20" row={2} />
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" row={3} />
        <Skeleton className="h-3 w-4/5" row={4} />
      </div>
    </div>
  );
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return <span role="status" aria-label="Loading" className={`spinner ${className}`} />;
}

/** The full-page wait. Invisible for its first 150ms, so a quick load never flashes it. */
export function PageLoader() {
  return (
    <div className="page-loader flex min-h-screen flex-col items-center justify-center gap-6 px-6" role="status" aria-live="polite" aria-label="Loading">
      <BrandMark size={40} />
      <span aria-hidden className="page-loader-bar" />
    </div>
  );
}

export function InlineLoader({ label = "Refreshing" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-500" role="status">
      <span aria-hidden className="loader-bars flex items-end gap-0.5 [&>span]:h-2.5 [&>span]:w-0.5">
        <span />
        <span />
        <span />
      </span>
      {label}
    </span>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="w-full" role="status" aria-label="Loading rows">
      <div className="flex gap-4 border-b border-line px-4 py-2.5">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-0">
          {Array.from({ length: columns }).map((_, column) => (
            <Skeleton key={column} row={row + 1} className={column === 0 ? "h-3.5 flex-[2]" : "h-3.5 flex-1"} />
          ))}
        </div>
      ))}
    </div>
  );
}
