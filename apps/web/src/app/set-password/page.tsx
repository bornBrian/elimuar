"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "@/lib/navigation";
import { useSearchParams } from "next/navigation";
import type { z } from "zod";
import {
  registerCompleteRequestSchema,
  registerCompleteResultSchema,
  registerContextRequestSchema,
  registerContextResultSchema,
} from "@elimuar/shared";
import { AuthFrame } from "@/components/AuthFrame";
import { Alert, Button, Field, controlClass } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { roleHome, saveSession } from "@/lib/session";

type Context = z.infer<typeof registerContextResultSchema>;

function roleWords(role: string): string {
  if (role === "school_admin") return "School head";
  if (role === "platform_admin") return "Platform administrator";
  if (role === "academic_master") return "Academic master";
  if (role === "secretary") return "Secretary";
  if (role === "student") return "Student";
  return "Teacher";
}

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <AuthFrame
          eyebrow="ElimuAR staff access"
          footer={
            <>
              Already set up? <a href="/login" className="font-semibold text-primary-600 hover:text-primary-700">Sign in</a>
            </>
          }
        >
          <div className="space-y-4" aria-live="polite">
            <span className="skeleton block h-7 w-2/3" />
            <span className="skeleton block h-4 w-full" />
            <span className="skeleton block h-10 w-full" />
            <span className="skeleton block h-10 w-full" />
          </div>
        </AuthFrame>
      }
    >
      <SetPasswordForm />
    </Suspense>
  );
}

function SetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [context, setContext] = useState<Context | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setInvalid("This link is missing its token. Ask your school to send the invitation again.");
      setLoading(false);
      return;
    }
    let active = true;
    api("/api/auth/register/context", registerContextResultSchema, {
      method: "POST",
      body: JSON.stringify(registerContextRequestSchema.parse({ token })),
    })
      .then((result) => {
        if (active) setContext(result);
      })
      .catch((cause: unknown) => {
        if (active) {
          setInvalid(
            cause instanceof ApiError ? cause.message : "This link is not valid. Ask for a new invitation."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = registerCompleteRequestSchema.parse({ registrationToken: token, password });
      const result = await api("/api/auth/register/complete", registerCompleteResultSchema, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if ("tokens" in result && result.tokens) {
        saveSession({ ...result.tokens, user: result.user });
        router.replace(roleHome(result.user.role));
      } else {
        router.replace("/login?reset=1");
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not set that password. Try again.");
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      eyebrow="ElimuAR staff access"
      footer={
        <>
          Already set up? <a href="/login" className="font-semibold text-primary-600 hover:text-primary-700">Sign in</a>
        </>
      }
    >
      {loading ? (
        <div className="space-y-4" aria-live="polite">
          <span className="skeleton block h-7 w-2/3" />
          <span className="skeleton block h-4 w-full" />
          <span className="skeleton block h-10 w-full" />
          <span className="skeleton block h-10 w-full" />
        </div>
      ) : invalid ? (
        <>
          <h1 className="text-page font-semibold tracking-tight text-slate-900">Link not valid</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{invalid}</p>
          <a
            href="/login"
            className="mt-5 block rounded-control bg-primary-700 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-primary-800"
          >
            Go to sign in
          </a>
        </>
      ) : context ? (
        <>
          <h1 className="text-page font-semibold tracking-tight text-slate-900">
            {context.isReset ? "Choose a new password" : "Set your password"}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {context.firstName} {context.lastName} · {roleWords(context.role)}
            {context.schoolName ? ` · ${context.schoolName}` : ""}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="Email">
              <input value={context.email} readOnly disabled className={`${controlClass} h-10`} />
            </Field>
            {context.phone && (
              <Field label="Phone">
                <input value={context.phone} readOnly disabled className={`${controlClass} h-10`} />
              </Field>
            )}
            <Field label="Password">
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                autoFocus
                className={`${controlClass} h-10`}
              />
            </Field>
            <Field label="Confirm password">
              <input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                className={`${controlClass} h-10`}
              />
            </Field>

            {error && <Alert tone="danger">{error}</Alert>}

            <Button type="submit" loading={busy} disabled={password.length < 8} className="h-11 w-full text-base">
              {context.isReset ? "Set new password" : "Create password"}
            </Button>
          </form>
        </>
      ) : null}
    </AuthFrame>
  );
}
