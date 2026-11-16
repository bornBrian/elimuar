"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { WarningCircle, type Icon } from "@phosphor-icons/react";
import { Wordmark } from "@/components/BrandMark";
import { ArShowcase } from "@/components/ArShowcase";

/** Sign-in and sign-up: the form on the left and, on wide screens, the same pictures as the front page on the right. */
export function AuthScene({ children }: { children: ReactNode }) {
  return (
    <main className="relative grid min-h-[100dvh] bg-white lg:h-[100dvh] lg:min-h-[640px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:p-3">
      <div className="flex min-w-0 flex-col px-5 py-5 sm:px-10 lg:overflow-y-auto lg:px-14 lg:py-7">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="ElimuAR home">
            <Wordmark />
          </Link>

          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-medium text-slate-500 transition-colors hover:text-ink-900">
              Need help?
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-line text-[12px] font-semibold">
                ?
              </span>
            </summary>
            <div className="absolute right-0 top-9 z-20 w-[300px] rounded-xl border border-line bg-white p-3.5 text-[12.5px] leading-5 text-ink-600 shadow-[0_22px_50px_-26px_rgba(10,33,56,0.45)]">
              <p className="font-semibold text-ink-800">Signing in</p>
              <p className="mt-1">
                Your school head or the ElimuAR platform team can set a new password for you. If your school loaded a
                phone number for your account, it can also send a code by SMS.
              </p>
            </div>
          </details>
        </header>

        <div className="flex flex-1 items-center justify-center py-10">
          <section className="w-full max-w-[400px]">{children}</section>
        </div>

        <footer className="text-center text-[12.5px] text-slate-400 lg:text-left">
          Real skills. Greater futures. · AR practicals for Tanzanian secondary schools
        </footer>
      </div>

      <ArShowcase className="hidden rounded-[28px] lg:block" sizes="50vw" />
    </main>
  );
}

export function AuthField({
  icon: Icon,
  trailing,
  children,
}: {
  icon: Icon;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className="relative block">
      <Icon
        size={17}
        weight="regular"
        aria-hidden
        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#9db0c9]"
      />
      {children}
      {trailing && <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>}
    </span>
  );
}

export function AuthError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-[13px] leading-5 text-danger-700"
    >
      <WarningCircle size={16} weight="regular" aria-hidden className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function AuthNotice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-[#C9E9D6] bg-[#EFFAF3] px-3.5 py-2.5 text-[13px] leading-5 text-[#0F5132]">
      {children}
    </p>
  );
}

export function EyeToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? "Hide password" : "Show password"}
      title={shown ? "Hide password" : "Show password"}
      className="flex h-10 w-10 items-center justify-center rounded-lg text-[#9db0c9] transition-colors hover:bg-white hover:text-ink-600"
    >
      <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden>
        <path
          d="M1.8 10S4.9 5 10 5s8.2 5 8.2 5-3.1 5-8.2 5-8.2-5-8.2-5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.5" />
        {shown && <path d="M4 16 16 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
      </svg>
    </button>
  );
}
