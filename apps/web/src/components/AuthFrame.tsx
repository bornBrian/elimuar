import type { ReactNode } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

export function AuthFrame({
  eyebrow,
  footer,
  children,
}: {
  eyebrow: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="auth-canvas flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="auth-frame flex w-full max-w-[440px] flex-col items-center">
        <div className="relative mb-6 flex flex-col items-center text-center">
          <span aria-hidden className="auth-mark-halo absolute -top-6 h-[110px] w-[110px] rounded-full" />
          <BrandMark size={56} className="relative" />
          <span className="mt-3 block text-[28px] font-bold leading-8 tracking-tight text-ink-900">
            Elimu<span className="text-brand-600">AR</span>
          </span>
          <span className="mt-0.5 block text-sm text-slate-500">{eyebrow}</span>
        </div>
        <section className="auth-panel w-full rounded-card border border-line bg-white p-6 shadow-card sm:p-7">{children}</section>
        <p className="mt-5 text-center text-xs text-slate-500">{footer}</p>
      </div>
    </main>
  );
}

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-primary-600 transition-colors hover:text-primary-800">
      {children}
    </Link>
  );
}
