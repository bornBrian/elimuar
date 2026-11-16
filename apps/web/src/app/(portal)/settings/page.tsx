"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/lib/navigation";
import {
  emailChangeConfirmRequestSchema,
  emailChangeRequestResultSchema,
  emailChangeRequestSchema,
  meResponseSchema,
  passwordChangeRequestSchema,
  passwordChangeResultSchema,
  revokeSessionsResultSchema,
  type SessionUser,
} from "@elimuar/shared";
import { Btn, ConsolePage, Field, Panel } from "@/components/console/kit";
import { Avatar } from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { clearSession, getAccessToken, getRefreshToken, getUser, saveSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";

export default function SettingsPage() {
  const me = useApi("/api/auth/me", meResponseSchema);
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState({ firstName: "", lastName: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingOutEverywhere, setSigningOutEverywhere] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [emailStage, setEmailStage] = useState<"idle" | "awaiting-code">("idle");
  const [newEmail, setNewEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailMasked, setEmailMasked] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    const stored = getUser();
    setUser(stored);
    if (stored) setProfile({ firstName: stored.firstName, lastName: stored.lastName, phone: "" });
  }, []);

  useEffect(() => {
    if (me.data?.user) {
      setUser(me.data.user);
    }
  }, [me.data]);

  async function uploadAvatar(file: File) {
    setUploadingAvatar(true);
    setError(null);
    setProfileNotice(null);
    try {
      const body = new FormData();
      body.append("picture", file);
      const result = await api("/api/auth/me/avatar", meResponseSchema, { method: "POST", body });
      setUser(result.user);
      const accessToken = getAccessToken();
      const refreshToken = getRefreshToken();
      if (accessToken && refreshToken) saveSession({ accessToken, refreshToken, user: result.user });
      setProfileNotice("Your picture is saved.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "That picture could not be used.");
    } finally {
      setUploadingAvatar(false);
      if (avatarInput.current) avatarInput.current.value = "";
    }
  }

  async function removeAvatar() {
    setRemovingAvatar(true);
    setError(null);
    try {
      const result = await api("/api/auth/me/avatar", meResponseSchema, { method: "DELETE" });
      setUser(result.user);
      const accessToken = getAccessToken();
      const refreshToken = getRefreshToken();
      if (accessToken && refreshToken) saveSession({ accessToken, refreshToken, user: result.user });
      setProfileNotice("Your picture was removed.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not remove the picture.");
    } finally {
      setRemovingAvatar(false);
    }
  }

  async function saveProfile() {
    setSavingProfile(true);
    setError(null);
    setProfileNotice(null);
    try {
      const result = await api("/api/auth/me", meResponseSchema, {
        method: "PATCH",
        body: JSON.stringify({
          firstName: profile.firstName.trim(),
          lastName: profile.lastName.trim(),
          phone: profile.phone.trim() ? profile.phone.trim() : null,
        }),
      });
      setUser(result.user);
      const accessToken = getAccessToken();
      const refreshToken = getRefreshToken();
      if (accessToken && refreshToken) {
        saveSession({ accessToken, refreshToken, user: result.user });
      }
      setProfileNotice("Profile saved. Your name updates everywhere on the next page.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not save your profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      setError("The two new passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    setSecurityNotice(null);
    try {
      const body = passwordChangeRequestSchema.parse({
        currentPassword,
        newPassword,
        refreshToken: getRefreshToken() ?? undefined,
      });
      const result = await api("/api/auth/password/change", passwordChangeResultSchema, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSecurityNotice(
        result.otherSessionsEnded > 0
          ? `Password changed. ${result.otherSessionsEnded} other session${result.otherSessionsEnded === 1 ? "" : "s"} signed out.`
          : "Password changed. Use it the next time you sign in."
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not change your password.");
    } finally {
      setBusy(false);
    }
  }

  async function requestEmailChange() {
    setEmailBusy(true);
    setEmailError(null);
    setEmailNotice(null);
    try {
      const body = emailChangeRequestSchema.parse({ newEmail: newEmail.trim() });
      const result = await api("/api/auth/email/change", emailChangeRequestResultSchema, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setEmailMasked(result.currentEmailMasked);
      setEmailStage("awaiting-code");
      setEmailNotice(`A verification code was sent to your current address ${result.currentEmailMasked}.`);
    } catch (cause) {
      setEmailError(cause instanceof ApiError ? cause.message : "Could not start the email change.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function confirmEmailChange() {
    setEmailBusy(true);
    setEmailError(null);
    try {
      const body = emailChangeConfirmRequestSchema.parse({
        code: emailCode.trim(),
        newEmail: newEmail.trim(),
      });
      const result = await api("/api/auth/email/change/confirm", meResponseSchema, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setUser(result.user);
      const accessToken = getAccessToken();
      const refreshToken = getRefreshToken();
      if (accessToken && refreshToken) saveSession({ accessToken, refreshToken, user: result.user });
      setEmailStage("idle");
      setNewEmail("");
      setEmailCode("");
      setEmailMasked(null);
      setEmailNotice("Your email has been updated. Other sessions were signed out.");
    } catch (cause) {
      setEmailError(cause instanceof ApiError ? cause.message : "Could not confirm the change.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function signOutEverywhere() {
    setSigningOutEverywhere(true);
    setError(null);
    try {
      await api("/api/auth/sessions/revoke", revokeSessionsResultSchema, { method: "POST" });
      clearSession();
      router.replace("/login");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not end your sessions.");
      setSigningOutEverywhere(false);
    }
  }

  return (
    <ConsolePage
      crumbs={[{ label: "Account settings" }]}
      title="Account settings"
      subtitle="Your own record: your name, your picture, your password and your sessions."
    >
      {(me.error || error) && (
        <p role="alert" className="mb-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {me.error ?? error}
        </p>
      )}
      {profileNotice && (
        <p className="mb-4 rounded-xl border border-[#C8EBD6] bg-[#F1FBF5] px-4 py-3 text-sm text-[#0F7A3D]">
          {profileNotice}
        </p>
      )}
      {securityNotice && (
        <p className="mb-4 rounded-xl border border-[#C8EBD6] bg-[#F1FBF5] px-4 py-3 text-sm text-[#0F7A3D]">
          {securityNotice}
        </p>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Panel title="Profile" meta="How your name appears across the platform">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 border-b border-line pb-4">
              <Avatar name={`${profile.firstName} ${profile.lastName}`.trim() || "?"} size={64} src={user?.avatarUrl} />
              <div className="flex flex-wrap items-center gap-2">
                <Btn size="sm" loading={uploadingAvatar} onClick={() => avatarInput.current?.click()}>
                  {user?.avatarUrl ? "Replace picture" : "Upload picture"}
                </Btn>
                {user?.avatarUrl && (
                  <Btn size="sm" loading={removingAvatar} onClick={() => void removeAvatar()}>
                    Remove
                  </Btn>
                )}
              </div>
              <input
                ref={avatarInput}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadAvatar(file);
                }}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name">
                <input
                  value={profile.firstName}
                  onChange={(event) => setProfile({ ...profile, firstName: event.target.value })}
                  className="console-input"
                />
              </Field>
              <Field label="Last name">
                <input
                  value={profile.lastName}
                  onChange={(event) => setProfile({ ...profile, lastName: event.target.value })}
                  className="console-input"
                />
              </Field>
              <Field label="Phone">
                <input
                  value={profile.phone}
                  onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                  className="console-input"
                />
              </Field>
              <Field label="Email">
                <input value={user?.email ?? ""} readOnly disabled className="console-input" />
              </Field>
            </div>

            <div className="flex justify-end border-t border-line pt-4">
              <Btn
                variant="primary"
                loading={savingProfile}
                disabled={!profile.firstName.trim() || !profile.lastName.trim()}
                onClick={() => void saveProfile()}
              >
                Save
              </Btn>
            </div>

            <div className="space-y-3 border-t border-line pt-4">
              {emailNotice && (
                <p className="rounded-xl border border-[#C8EBD6] bg-[#F1FBF5] px-3.5 py-2.5 text-[13px] text-[#0F7A3D]">
                  {emailNotice}
                </p>
              )}
              {emailError && (
                <p className="rounded-xl border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
                  {emailError}
                </p>
              )}
              {emailStage === "idle" ? (
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Change email — new address">
                    <input
                      type="email"
                      value={newEmail}
                      onChange={(event) => setNewEmail(event.target.value)}
                      placeholder="new.name@s0206.elimuar.tz"
                      className="console-input"
                    />
                  </Field>
                  <Btn
                    loading={emailBusy}
                    disabled={!newEmail.includes("@") || newEmail.trim() === (user?.email ?? "")}
                    onClick={() => void requestEmailChange()}
                  >
                    Send verification code
                  </Btn>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label="Verification code">
                      <input
                        value={emailCode}
                        onChange={(event) => setEmailCode(event.target.value)}
                        inputMode="numeric"
                        className="console-input mono w-[160px]"
                      />
                    </Field>
                    <Btn
                      variant="primary"
                      loading={emailBusy}
                      disabled={emailCode.trim().length < 4}
                      onClick={() => void confirmEmailChange()}
                    >
                      Confirm change
                    </Btn>
                    <Btn
                      onClick={() => {
                        setEmailStage("idle");
                        setEmailCode("");
                        setEmailNotice(null);
                        setEmailError(null);
                      }}
                    >
                      Cancel
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="Security" meta="Your password and the devices holding your session">
          <div className="space-y-4">
            <Field label="Current password">
              <input
                type="password"
                value={currentPassword}
                autoComplete="current-password"
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="console-input"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="New password">
                <input
                  type="password"
                  value={newPassword}
                  autoComplete="new-password"
                  onChange={(event) => setNewPassword(event.target.value)}
                  className="console-input"
                />
              </Field>
              <Field label="Repeat new password">
                <input
                  type="password"
                  value={confirmPassword}
                  autoComplete="new-password"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="console-input"
                />
              </Field>
            </div>

            <div className="flex justify-end border-t border-line pt-4">
              <Btn
                variant="primary"
                loading={busy}
                disabled={!currentPassword || newPassword.length < 8 || confirmPassword.length < 8}
                onClick={() => void changePassword()}
              >
                Change password
              </Btn>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <span className="text-[13px] text-ink-600">
                Sign out on every device
                <span className="block text-[12.5px] text-ink-500">Including this one — you will sign in again.</span>
              </span>
              <Btn variant="danger" size="sm" loading={signingOutEverywhere} onClick={() => void signOutEverywhere()}>
                Sign out everywhere
              </Btn>
            </div>
          </div>
        </Panel>
      </div>
    </ConsolePage>
  );
}
