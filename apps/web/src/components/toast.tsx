"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

type ToastTone = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: ReactNode;
  duration: number;
}

type Push = (toast: Omit<ToastItem, "id">) => void;

let push: Push | null = null;
let nextId = 1;

function emit(tone: ToastTone, message: ReactNode, duration: number) {
  push?.({ tone, message, duration });
}

export const toast = {
  success: (message: ReactNode, duration = 4500) => emit("success", message, duration),
  error: (message: ReactNode, duration = 8000) => emit("error", message, duration),
  info: (message: ReactNode, duration = 4500) => emit("info", message, duration),
  warning: (message: ReactNode, duration = 6500) => emit("warning", message, duration),
};

const TONES: Record<ToastTone, { label: string; rule: string; word: string }> = {
  success: { label: "Done", rule: "border-success-200 bg-white", word: "text-success-700" },
  error: { label: "Could not do that", rule: "border-danger-200 bg-white", word: "text-danger-700" },
  warning: { label: "Still needed", rule: "border-warning-200 bg-white", word: "text-warning-700" },
  info: { label: "Note", rule: "border-primary-200 bg-white", word: "text-primary-700" },
};

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    push = (item) => {
      const id = nextId++;
      setItems((current) => [...current.slice(-4), { ...item, id }]);
    };
    return () => {
      push = null;
    };
  }, []);

  function dismiss(id: number) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed left-1/2 top-4 z-toast flex w-[min(420px,calc(100vw-24px))] -translate-x-1/2 flex-col items-center gap-2 print:hidden"
      aria-live="polite"
    >
      {items.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={dismiss} />
      ))}
    </div>,
    document.body
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [leaving, setLeaving] = useState(false);
  const tone = TONES[item.tone];

  useEffect(() => {
    const timer = window.setTimeout(() => setLeaving(true), item.duration);
    return () => window.clearTimeout(timer);
  }, [item.duration]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => onDismiss(item.id), 180);
    return () => window.clearTimeout(timer);
  }, [leaving, item.id, onDismiss]);

  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      className={`toast-card ${leaving ? "toast-leave" : "toast-enter"} rounded-control border bg-white shadow-pop ${tone.rule}`}
    >
      <div className="px-3.5 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm leading-5 text-slate-700">
            <span className={`font-semibold ${tone.word}`}>{tone.label}: </span>
            {item.message}
          </p>
          <button
            type="button"
            onClick={() => setLeaving(true)}
            aria-label="Dismiss"
            className="-mr-1 -mt-0.5 shrink-0 rounded px-1 text-base leading-none text-slate-400 hover:text-slate-700"
          >
            ✕
          </button>
        </div>
      </div>
      <span className="block h-0.5 overflow-hidden rounded-b-control bg-line">
        <span
          className="toast-progress block h-full"
          style={{
            background: item.tone === "error" ? "#B91C1C" : item.tone === "warning" ? "#B45309" : "#163A70",
            animationDuration: `${item.duration}ms`,
          }}
        />
      </span>
    </div>
  );
}
