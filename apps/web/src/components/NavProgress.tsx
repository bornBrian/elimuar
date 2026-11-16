"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/** A thin bar along the top of the window that starts the moment a link is clicked, so a navigation never
   looks like nothing happened while Next.js fetches the next page. */

const START_EVENT = "elimuar:navigation-start";
const FINISH_EVENT = "elimuar:navigation-finish";
const GIVE_UP_MS = 12_000;

export function startNavigation() {
  window.dispatchEvent(new Event(START_EVENT));
}

function isPageLink(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = (event.target as Element | null)?.closest?.("a");
  if (!anchor || anchor.hasAttribute("download")) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  const next = new URL(anchor.href, window.location.href);
  if (next.origin !== window.location.origin) return false;
  if (next.pathname.startsWith("/api/") || next.pathname.startsWith("/downloads/")) return false;
  return next.pathname !== window.location.pathname || next.search !== window.location.search;
}

export function NavProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const loading = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clear = () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
    const finish = () => {
      clear();
      loading.current = false;
      setState("done");
      timers.current.push(window.setTimeout(() => setState("idle"), 450));
    };
    const start = () => {
      clear();
      loading.current = true;
      setState("loading");
      timers.current.push(window.setTimeout(finish, GIVE_UP_MS));
    };
    const onClick = (event: MouseEvent) => {
      if (isPageLink(event)) start();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener(START_EVENT, start);
    window.addEventListener(FINISH_EVENT, finish);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(START_EVENT, start);
      window.removeEventListener(FINISH_EVENT, finish);
      clear();
    };
  }, []);

  useEffect(() => {
    if (loading.current) window.dispatchEvent(new Event(FINISH_EVENT));
  }, [pathname]);

  if (state === "idle") return null;
  return <div aria-hidden className="nav-progress" data-state={state} />;
}
