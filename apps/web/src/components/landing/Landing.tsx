"use client";

import Link from "next/link";
import { AndroidLogo, ArrowRight, ChartLineUp, Cube, DeviceMobile, type Icon } from "@phosphor-icons/react";
import { ArShowcase } from "@/components/ArShowcase";
import { Wordmark } from "@/components/BrandMark";

/** The public front page: one screen, no scrolling on a laptop. */

const APK = "/downloads/elimuar.apk";

const POINTS: { icon: Icon; title: string; detail: string }[] = [
  { icon: Cube, title: "3D on the desk", detail: "Walk around it, look inside" },
  { icon: DeviceMobile, title: "Android phones", detail: "One phone per group" },
  { icon: ChartLineUp, title: "Every run recorded", detail: "Scores go to the teacher" },
];

export function Landing() {
  return (
    <main className="relative grid min-h-[100dvh] bg-white text-ink-900 antialiased lg:h-[100dvh] lg:min-h-[660px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:p-3">
      <section className="flex min-w-0 flex-col px-5 pb-8 pt-5 sm:px-10 lg:px-12 lg:pb-8 lg:pt-6 xl:px-16 2xl:px-20">
        <header className="flex items-center justify-between">
          <Link href="/" aria-label="ElimuAR home">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-[14px] font-medium text-slate-500 transition-colors hover:text-ink-900">
              Sign in
            </Link>
            <a
              href={APK}
              download
              className="hidden h-9 items-center rounded-full border border-line px-4 text-[13.5px] font-medium text-ink-900 transition-colors hover:border-slate-300 sm:inline-flex"
            >
              Get the app
            </a>
          </div>
        </header>

        <div className="flex flex-1 flex-col justify-center py-12 lg:py-4">
          <span className="landing-rise inline-flex w-fit items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-[13px] font-medium text-brand-700">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
            AR practicals for Tanzanian secondary schools
          </span>
          <h1 className="landing-rise mt-6 max-w-[600px] text-[44px] font-semibold leading-[1.02] tracking-[-0.045em] [animation-delay:60ms] sm:text-[56px] xl:text-[60px] 2xl:text-[70px] [@media(max-height:760px)]:text-[48px]">
            The science lab,
            <br />
            <span className="text-slate-400">on every desk.</span>
          </h1>
          <p className="landing-rise mt-5 max-w-[460px] text-[17px] leading-[1.6] text-slate-500 [animation-delay:120ms]">
            Point a phone at the desk and a heart, an eye or a pair of lungs stands on it in 3D. Learners walk around it,
            hear what each part does, and answer questions.
          </p>
          <div className="landing-rise mt-8 flex flex-col gap-4 [animation-delay:180ms] sm:flex-row sm:items-center sm:gap-7">
            <a
              href={APK}
              download
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink-900 px-6 text-[15px] font-medium text-white shadow-[0_10px_24px_-12px_rgba(10,33,56,0.6)] transition-colors hover:bg-ink-800"
            >
              <AndroidLogo size={18} weight="fill" aria-hidden />
              Download for Android
            </a>
            <Link
              href="/login"
              className="group inline-flex items-center justify-center gap-1.5 text-[15px] font-medium text-brand-600 sm:justify-start"
            >
              Staff portal
              <ArrowRight size={15} aria-hidden className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        <ul className="grid grid-cols-3 gap-4 border-t border-line pt-5 sm:gap-8">
          {POINTS.map(({ icon: I, title, detail }) => (
            <li key={title}>
              <I size={20} weight="duotone" aria-hidden className="text-brand-600" />
              <p className="mt-3 text-[14px] font-semibold tracking-[-0.01em]">{title}</p>
              <p className="mt-0.5 text-[13px] leading-5 text-slate-500">{detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <ArShowcase
        className="mx-3 mb-3 h-[64vh] min-h-[380px] rounded-[24px] lg:m-0 lg:h-auto lg:rounded-[28px]"
        sizes="(min-width: 1024px) 50vw, 100vw"
      />
    </main>
  );
}
