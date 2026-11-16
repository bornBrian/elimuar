"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "@/lib/navigation";
import { ArrowRight, Envelope, Lock } from "@phosphor-icons/react";
import {
  passwordRequestResultSchema,
  passwordResetRequestSchema,
  passwordResetResultSchema,
  passwordVerifyRequestSchema,
  passwordVerifyResultSchema,
} from "@elimuar/shared";
import { AuthError, AuthField, AuthNotice, AuthScene, EyeToggle } from "@/components/AuthScene";
import { ApiError, api, login } from "@/lib/api";
import { roleHome, saveSession } from "@/lib/session";

type Mode = "signin" | "recover";

export default function LoginPage() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [mode, setMode] = useState<Mode>("signin");
  const [stage, setStage] = useState<"code" | "reset">("code");
  const [recoveryId, setRecoveryId] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("error");
    if (reason === "expired") setNotice("Your session ended. Sign in again to continue.");
    else if (reason === "role") setNotice("That account cannot use the web portal. Ask your school head which one to use.");
    else if (reason === "teacher") setNotice("Teachers sign in on the ElimuAR mobile app, not the web portal.");
    else if (reason === "student") setNotice("Learners sign in on the ElimuAR mobile app, not the web portal.");
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { user, tokens } = await login(identifier.trim(), password);
      saveSession({ ...tokens, user });
      // Stay busy until the portal replaces this page.
      router.replace(roleHome(user.role));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Sign-in failed. Try again.");
      setBusy(false);
    }
  }

  function openRecovery() {
    setMode("recover");
    setStage("code");
    setRecoveryId(identifier.trim());
    setCode("");
    setCodeSent(false);
    setResetToken(null);
    setError(null);
    setNotice(null);
  }

  function backToSignin() {
    setMode("signin");
    setError(null);
    setNotice(null);
  }

  async function requestCode() {
    setBusy(true);
    setError(null);
    try {
      const result = await api("/auth/password/request", passwordRequestResultSchema, {
        method: "POST",
        body: JSON.stringify({ identifier: recoveryId.trim() }),
      });
      setCodeSent(true);
      setNotice(`A code was sent by ${result.channel === "sms" ? "SMS" : "email"}. It expires shortly.`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not send a code to that account.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setBusy(true);
    setError(null);
    try {
      const body = passwordVerifyRequestSchema.parse({ identifier: recoveryId.trim(), code: code.trim() });
      const result = await api("/auth/password/verify", passwordVerifyResultSchema, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResetToken(result.resetToken);
      setStage("reset");
      setNotice("Code verified. Choose a new password.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "That code was not accepted.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    if (!resetToken) return;
    if (newPassword !== confirmPassword) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = passwordResetRequestSchema.parse({ resetToken, newPassword });
      await api("/auth/password/reset", passwordResetResultSchema, { method: "POST", body: JSON.stringify(body) });
      setMode("signin");
      setIdentifier(recoveryId);
      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Password updated. Sign in with your new password.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not set that password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScene>
      {mode === "signin" ? (
        <>
          <h1 className="text-[30px] font-bold leading-9 tracking-tight text-ink-900">Welcome</h1>
          <p className="mt-1.5 text-[14px] text-ink-500">Sign in to continue</p>

          <form onSubmit={onSubmit} className="mt-7 space-y-3.5">
            <AuthField icon={Envelope}>
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
                autoFocus
                placeholder="Email or admission number"
                aria-label="Email or admission number"
                className="auth-input"
              />
            </AuthField>

            <AuthField icon={Lock} trailing={<EyeToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Password"
                aria-label="Password"
                className="auth-input pr-12"
              />
            </AuthField>

            {error && <AuthError>{error}</AuthError>}
            {notice && <AuthNotice>{notice}</AuthNotice>}

            <button
              type="submit"
              disabled={busy}
              className="auth-gradient-button mt-1.5 flex h-[52px] w-full items-center justify-center gap-2 rounded-[10px] text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-80"
            >
              {busy && <span aria-hidden className="spinner h-4 w-4" />}
              {busy ? "Signing in…" : "Log in"}
              {!busy && <ArrowRight size={17} weight="bold" aria-hidden />}
            </button>

            <div className="flex flex-col items-center gap-3 pt-3">
              <button
                type="button"
                onClick={openRecovery}
                className="text-[13.5px] font-semibold text-brand-600 hover:text-brand-700"
              >
                Forgot password?
              </button>
              <Link href="/register" className="text-[13.5px] font-semibold text-brand-600 hover:text-brand-700">
                Create account
              </Link>
            </div>
          </form>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={backToSignin}
            className="text-[13px] font-medium text-ink-500 transition-colors hover:text-ink-800"
          >
            ← Back to sign in
          </button>
          <h1 className="mt-3 text-[26px] font-bold leading-8 tracking-tight text-ink-900">Reset password</h1>
          <p className="mt-1.5 text-[14px] text-ink-500">
            We will send a single-use code to the contact details on your account.
          </p>

          <div className="mt-6 space-y-3.5">
            {error && <AuthError>{error}</AuthError>}
            {notice && <AuthNotice>{notice}</AuthNotice>}

            {stage === "code" && (
              <>
                <AuthField icon={Envelope}>
                  <input
                    value={recoveryId}
                    onChange={(event) => setRecoveryId(event.target.value)}
                    placeholder="Email or phone"
                    aria-label="Email or phone"
                    className="auth-input"
                  />
                </AuthField>
                {codeSent && (
                  <AuthField icon={Lock}>
                    <input
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="Six-digit code"
                      aria-label="Six-digit code"
                      className="auth-input font-mono tracking-[0.35em]"
                    />
                  </AuthField>
                )}
                {codeSent ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void verifyCode()}
                      disabled={busy || code.trim().length < 6}
                      className="auth-gradient-button flex h-[50px] w-full items-center justify-center rounded-[10px] text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy && <span aria-hidden className="spinner h-4 w-4" />}
                      {busy ? "Checking…" : "Verify code"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void requestCode()}
                      className="w-full text-center text-[13px] font-semibold text-brand-600 hover:text-brand-700"
                    >
                      Resend the code
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => void requestCode()}
                    disabled={busy || recoveryId.trim().length < 3}
                    className="auth-gradient-button flex h-[50px] w-full items-center justify-center rounded-[10px] text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy && <span aria-hidden className="spinner h-4 w-4" />}
                    {busy ? "Sending…" : "Send code"}
                  </button>
                )}
              </>
            )}

            {stage === "reset" && (
              <>
                <AuthField icon={Lock}>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="New password"
                    aria-label="New password"
                    className="auth-input"
                  />
                </AuthField>
                <AuthField icon={Lock}>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    placeholder="Repeat new password"
                    aria-label="Repeat new password"
                    className="auth-input"
                  />
                </AuthField>
                <p className="text-[12.5px] text-ink-500">At least 8 characters, with a letter and a digit.</p>
                <button
                  type="button"
                  onClick={() => void resetPassword()}
                  disabled={busy || newPassword.length < 8}
                  className="auth-gradient-button flex h-[50px] w-full items-center justify-center rounded-[10px] text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy && <span aria-hidden className="spinner h-4 w-4" />}
                  {busy ? "Saving…" : "Set new password"}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </AuthScene>
  );
}
