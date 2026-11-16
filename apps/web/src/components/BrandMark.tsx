"use client";

import { useBranding } from "@/lib/branding";

export function BrandMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  const branding = useBranding();

  if (branding.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={branding.logoUrl}
        alt="ElimuAR"
        width={size}
        height={size}
        className={`rounded-full object-cover ring-1 ring-black/10 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-black/10 ${className}`}
      style={{ width: size, height: size }}
      title="ElimuAR — Tanzania"
    >
      <svg viewBox="0 0 40 40" width={size} height={size} role="img" aria-label="Tanzania">
        <defs>
          <clipPath id="elimuar-mark-clip">
            <circle cx="20" cy="20" r="20" />
          </clipPath>
        </defs>
        <g clipPath="url(#elimuar-mark-clip)">
          <rect width="40" height="40" fill="#1EB53A" />
          <polygon points="40,0 40,40 0,40" fill="#00A3DD" />
          <polygon points="0,40 0,30 30,0 40,0 40,10 10,40" fill="#FCD116" />
          <polygon points="0,40 0,33.5 33.5,0 40,0 40,6.5 6.5,40" fill="#141414" />
        </g>
      </svg>
    </span>
  );
}

/** The logo and "ElimuAR" (with "AR" in brand blue), the same on every page. */
export function Wordmark({ size = 34, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <BrandMark size={size} />
      <span className="font-bold leading-none tracking-tight text-ink-900" style={{ fontSize: Math.round(size * 0.68) }}>
        Elimu<span className="text-brand-600">AR</span>
      </span>
    </span>
  );
}
