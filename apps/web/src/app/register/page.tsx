"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "@/lib/navigation";
import type { z } from "zod";
import { ArrowRight, At, Check, Key, Phone, ShieldCheck, User } from "@phosphor-icons/react";
import {
  registerCompleteRequestSchema,
  registerCompleteResultSchema,
  registerVerifyCodeRequestSchema,
  registerVerifyCodeResultSchema,
  registerVerifyRequestSchema,
  registerVerifyResultSchema,
} from "@elimuar/shared";
import { AuthError, AuthField, AuthNotice, AuthScene, EyeToggle } from "@/components/AuthScene";
import { ApiError, api } from "@/lib/api";
import { roleHome, saveSession } from "@/lib/session";

type VerifyResult = z.infer<typeof registerVerifyResultSchema>;
type CodeResult = z.infer<typeof registerVerifyCodeResultSchema>;

const ROLE_LABEL: Record<string, string> = {
  platform_admin: "Platform administrator",
  school_admin: "School head",
  academic_master: "Academic master",
  secretary: "Secretary",
  teacher: "Teacher",
};

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", phone: "" });
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"details" | "code" | "password">("details");
  const [details, setDetails] = useState<VerifyResult | null>(null);
  const [verified, setVerified] = useState<CodeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canVerify = form.email.includes("@") && form.firstName.trim().length > 1 && form.lastName.trim().length > 1;

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body = registerVerifyRequestSchema.parse({
        email: form.email.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      });
      const result = await api("/auth/register/verify", registerVerifyResultSchema, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setDetails(result);
      setStep("code");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "We could not check those details. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (!details) return;
    setBusy(true);
    setError(null);
    try {
      const body = registerVerifyCodeRequestSchema.parse({ email: form.email.trim(), code: code.trim() });
      const result = await api("/auth/register/verify-code", registerVerifyCodeResultSchema, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setVerified(result);
      setStep("password");
      setNotice(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "That code did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const body = registerVerifyRequestSchema.parse({
        email: form.email.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      });
      setDetails(
        await api("/auth/register/verify", registerVerifyResultSchema, { method: "POST", body: JSON.stringify(body) })
      );
      setNotice("A new code is on its way.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "We could not send another code.");
    } finally {
      setBusy(false);
    }
  }

  async function complete(event: FormEvent) {
    event.preventDefault();
    if (!verified) return;
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = registerCompleteRequestSchema.parse({ registrationToken: verified.registrationToken, password });
      const result = await api("/auth/register/complete", registerCompleteResultSchema, {
        method: "POST",
        body: JSON.stringify(body),
      });
      saveSession({ ...result.tokens, user: result.user });
      // Stay busy until the portal replaces this page.
      router.replace(roleHome(result.user.role));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "We could not set that password. Try again.");
      setBusy(false);
    }
  }

  function startAgain() {
    setStep("details");
    setDetails(null);
    setVerified(null);
    setCode("");
    setPassword("");
    setConfirm("");
    setError(null);
    setNotice(null);
  }

  return (
    <AuthScene>
      <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
        {(["details", "code", "password"] as const).map((key, index) => {
          const order = ["details", "code", "password"];
          const done = order.indexOf(step) > index;
          const active = step === key;
          return (
            <li key={key} className="flex flex-1 items-center gap-2">
              <span
                aria-hidden
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                  done || active ? "bg-brand-600 text-white" : "bg-[#E9F0FA] text-ink-500"
                }`}
              >
                {done ? <Check size={12} weight="bold" /> : index + 1}
              </span>
              {index < 2 && (
                <span aria-hidden className={`h-[2px] flex-1 rounded-full ${done ? "bg-brand-600" : "bg-[#E9F0FA]"}`} />
              )}
            </li>
          );
        })}
      </ol>

      {step === "details" && (
        <>
          <h1 className="text-[28px] font-bold leading-9 tracking-tight text-ink-900">Create account</h1>
          <p className="mt-1.5 text-[14px] leading-6 text-ink-500">
            Match the details your school loaded, then verify your email to choose a password.
          </p>

          <form onSubmit={verify} className="mt-6 space-y-3.5">
            <AuthField icon={At}>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                autoComplete="email"
                placeholder="Institutional email"
                aria-label="Institutional email"
                className="auth-input"
              />
            </AuthField>
            <div className="grid grid-cols-2 gap-3">
              <AuthField icon={User}>
                <input
                  value={form.firstName}
                  onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                  autoComplete="given-name"
                  placeholder="First name"
                  aria-label="First name"
                  className="auth-input"
                />
              </AuthField>
              <input
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                autoComplete="family-name"
                placeholder="Last name"
                aria-label="Last name"
                className="auth-input !pl-3.5"
              />
            </div>
            <AuthField icon={Phone}>
              <input
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                autoComplete="tel"
                placeholder="Phone (if the school has one)"
                aria-label="Phone"
                className="auth-input"
              />
            </AuthField>

            {error && <AuthError>{error}</AuthError>}

            <button
              type="submit"
              disabled={busy || !canVerify}
              className="auth-gradient-button mt-1.5 flex h-[50px] w-full items-center justify-center gap-2 rounded-[10px] text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy && <span aria-hidden className="spinner h-4 w-4" />}
              {busy ? "Checking…" : "Continue"}
              {!busy && <ArrowRight size={17} weight="bold" aria-hidden />}
            </button>

            <p className="pt-2 text-center text-[13px] text-ink-500">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700">
                Log in
              </Link>
            </p>
          </form>
        </>
      )}

      {step === "code" && details && (
        <>
          <h1 className="text-[28px] font-bold leading-9 tracking-tight text-ink-900">Check your email</h1>
          <p className="mt-1.5 text-[14px] leading-6 text-ink-500">
            A code was sent to <span className="font-semibold text-ink-700">{details.maskedEmail}</span>. Enter it to
            prove the account is yours. It expires in {Math.round(details.expiresInSeconds / 60)} minutes.
          </p>

          <form onSubmit={submitCode} className="mt-6 space-y-3.5">
            <AuthField icon={ShieldCheck}>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Verification code"
                aria-label="Verification code"
                className="auth-input font-mono tracking-[0.35em]"
                autoFocus
              />
            </AuthField>

            {error && <AuthError>{error}</AuthError>}
            {notice && <AuthNotice>{notice}</AuthNotice>}

            <button
              type="submit"
              disabled={busy || code.trim().length < 4}
              className="auth-gradient-button mt-1.5 flex h-[50px] w-full items-center justify-center rounded-[10px] text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy && <span aria-hidden className="spinner h-4 w-4" />}
              {busy ? "Checking…" : "Verify code"}
            </button>

            <div className="flex flex-col items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => void resend()}
                className="text-[13px] font-semibold text-brand-600 hover:text-brand-700"
              >
                Send another code
              </button>
              <button
                type="button"
                onClick={startAgain}
                className="text-[13px] font-medium text-ink-500 hover:text-ink-800"
              >
                Start again
              </button>
            </div>
          </form>
        </>
      )}

      {step === "password" && verified && (
        <>
          <h1 className="text-[28px] font-bold leading-9 tracking-tight text-ink-900">
            {verified.account.firstName} {verified.account.lastName}
          </h1>
          <p className="mt-1.5 text-[14px] leading-6 text-ink-500">
            {ROLE_LABEL[verified.account.role] ?? verified.account.role}
            {verified.account.schoolName ? ` · ${verified.account.schoolName}` : ""}
          </p>

          <form onSubmit={complete} className="mt-6 space-y-3.5">
            <AuthField icon={Key} trailing={<EyeToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="Choose a password"
                aria-label="Choose a password"
                className="auth-input pr-12"
              />
            </AuthField>
            <AuthField icon={Key}>
              <input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                placeholder="Repeat the password"
                aria-label="Repeat the password"
                className="auth-input"
              />
            </AuthField>
            <p className="text-[12.5px] text-ink-500">At least 8 characters, with a letter and a digit.</p>

            {error && <AuthError>{error}</AuthError>}

            <button
              type="submit"
              disabled={busy || password.length < 8}
              className="auth-gradient-button mt-1.5 flex h-[50px] w-full items-center justify-center rounded-[10px] text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy && <span aria-hidden className="spinner h-4 w-4" />}
              {busy ? "Creating…" : "Create password"}
            </button>

            <button
              type="button"
              onClick={startAgain}
              className="w-full pt-2 text-center text-[13px] font-medium text-ink-500 hover:text-ink-800"
            >
              Start again
            </button>
          </form>
        </>
      )}
    </AuthScene>
  );
}
