"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  BellRinging,
  CaretRight,
  CircleHalf,
  Globe,
  Info,
  Key,
  Translate,
  EnvelopeSimple,
  ShieldCheck,
  Sun,
  Moon,
  UploadSimple,
} from "@phosphor-icons/react";
import { meResponseSchema, passwordChangeRequestSchema, passwordChangeResultSchema } from "@elimuar/shared";
import {
  Btn,
  ConsolePage,
  Panel,
  RoleLabel,
  Segmented,
  Skeleton,
} from "@/components/console/kit";
import { toast } from "@/components/toast";
import { ApiError, api } from "@/lib/api";
import { applyConsoleTheme, readConsoleTheme, type ConsoleTheme } from "@/lib/consoleTheme";
import { getAccessToken, getRefreshToken, getUser, saveSession } from "@/lib/session";

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "sw", label: "Kiswahili" },
];

function initialsOf(first: string, last: string): string {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

export default function ProfilePage() {
  const [user, setUser] = useState(() => getUser());
  const [theme, setTheme] = useState<ConsoleTheme>("light");
  const [language, setLanguage] = useState("en");
  const [savingLanguage, setSavingLanguage] = useState(false);

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [nameOpen, setNameOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nameBusy, setNameBusy] = useState(false);

  useEffect(() => {
    setTheme(readConsoleTheme());
    const session = getUser();
    setUser(session);
    if (session) {
      setFirstName(session.firstName);
      setLastName(session.lastName);
    }
  }, []);

  const fullName = useMemo(() => (user ? `${user.firstName} ${user.lastName}` : "—"), [user]);

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      setPasswordError("The two passwords do not match.");
      return;
    }
    setPasswordBusy(true);
    setPasswordError(null);
    try {
      const body = passwordChangeRequestSchema.parse({
        currentPassword,
        newPassword,
        ...(getRefreshToken() ? { refreshToken: getRefreshToken() as string } : {}),
      });
      const result = await api("/auth/password/change", passwordChangeResultSchema, {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success(
        result.otherSessionsEnded > 0
          ? `Password changed. ${result.otherSessionsEnded} other session(s) were signed out.`
          : "Password changed."
      );
      setPasswordOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (cause) {
      setPasswordError(cause instanceof ApiError ? cause.message : "Could not change the password.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function saveName() {
    if (firstName.trim().length < 1 || lastName.trim().length < 1) return;
    setNameBusy(true);
    try {
      const fresh = await api("/auth/me", meResponseSchema, {
        method: "PATCH",
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim() }),
      });
      const token = getAccessToken();
      const refresh = getRefreshToken();
      if (token && refresh) saveSession({ accessToken: token, refreshToken: refresh, user: fresh.user });
      setUser(fresh.user);
      setNameOpen(false);
      toast.success("Name updated.");
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "Could not save the name.");
    } finally {
      setNameBusy(false);
    }
  }

  async function saveLanguage() {
    setSavingLanguage(true);
    try {
      const fresh = await api("/auth/me", meResponseSchema, {
        method: "PATCH",
        body: JSON.stringify({ locale: language }),
      });
      const token = getAccessToken();
      const refresh = getRefreshToken();
      if (token && refresh) saveSession({ accessToken: token, refreshToken: refresh, user: fresh.user });
      setUser(fresh.user);
      toast.success(language === "sw" ? "Kiswahili imehifadhiwa." : "Language saved.");
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "Could not save the language.");
    } finally {
      setSavingLanguage(false);
    }
  }

  if (!user) {
    return (
      <ConsolePage crumbs={[{ label: "Profile" }]} title="Profile">
        <Skeleton className="h-40 w-full" />
      </ConsolePage>
    );
  }

  return (
    <ConsolePage
      crumbs={[{ label: "Profile" }]}
      title="Profile"
      subtitle="Manage your account and preferences."
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <Panel>
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            <span
              aria-hidden
              className="flex h-[86px] w-[86px] items-center justify-center rounded-full text-[28px] font-bold text-white"
              style={{ background: "linear-gradient(140deg, #38BDF8 0%, #2563EB 100%)" }}
            >
              {initialsOf(user.firstName, user.lastName)}
            </span>
            {nameOpen ? (
              <div className="grid w-full max-w-[320px] gap-3 text-left">
                <label className="block">
                  <span className="console-label">First name</span>
                  <input
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className="console-input"
                  />
                </label>
                <label className="block">
                  <span className="console-label">Last name</span>
                  <input
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className="console-input"
                  />
                </label>
                <div className="flex items-center justify-end gap-2">
                  <Btn size="sm" onClick={() => setNameOpen(false)}>
                    Cancel
                  </Btn>
                  <Btn size="sm" variant="primary" loading={nameBusy} onClick={() => void saveName()}>
                    Save name
                  </Btn>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="text-[19px] font-bold text-ink-900">{fullName}</h2>
                  <p className="mt-0.5 text-[13.5px] font-semibold text-brand-600">
                    <RoleLabel role={user.role} />
                  </p>
                </div>
                <p className="text-[13px] text-ink-500">{user.email}</p>
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-brand-700">
                  <ShieldCheck size={13} weight="bold" aria-hidden />
                  <RoleLabel role={user.role} />
                </span>
                <button
                  type="button"
                  onClick={() => setNameOpen(true)}
                  className="mt-1 text-[13px] font-semibold text-brand-600 hover:text-brand-700"
                >
                  Change name
                </button>
              </>
            )}
          </div>
        </Panel>

        <Panel icon={EnvelopeSimple} title="Account Information">
          <dl className="divide-y divide-line">
            {[
              { label: "Full name", value: fullName },
              { label: "Email", value: user.email },
              { label: "Role", value: <RoleLabel role={user.role} /> },
              { label: "School", value: user.schoolName ?? "Platform-wide" },
              ...(user.className ? [{ label: "Class", value: user.className }] : []),
            ].map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4 py-3">
                <dt className="shrink-0 text-[13px] text-ink-500">{row.label}</dt>
                <dd className="min-w-0 truncate text-[13.5px] font-medium text-ink-800">{row.value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel icon={Key} title="Settings">
          <ul className="divide-y divide-line">
            <li>
              <button
                type="button"
                onClick={() => setPasswordOpen((current) => !current)}
                className="flex w-full items-center gap-3 py-3.5 text-left"
              >
                <Key size={16} weight="regular" aria-hidden className="text-ink-500" />
                <span className="flex-1 text-[13.5px] font-medium text-ink-700">Change password</span>
                <CaretRight size={16} weight="bold" aria-hidden className="text-[#c2d2e6]" />
              </button>

              {passwordOpen && (
                <div className="space-y-3.5 pb-4 pl-7">
                  <label className="block">
                    <span className="console-label">Current password</span>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      autoComplete="current-password"
                      className="console-input"
                    />
                  </label>
                  <label className="block">
                    <span className="console-label">New password</span>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      autoComplete="new-password"
                      className="console-input"
                    />
                  </label>
                  <label className="block">
                    <span className="console-label">Re-enter the new password</span>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      className="console-input"
                    />
                  </label>
                  <p className="text-[12.5px] text-ink-500">At least 8 characters, with a letter and a digit.</p>
                  {passwordError && (
                    <p role="alert" className="text-[12.5px] text-danger-700">
                      {passwordError}
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Btn size="sm" onClick={() => setPasswordOpen(false)}>
                      Cancel
                    </Btn>
                    <Btn
                      size="sm"
                      variant="primary"
                      loading={passwordBusy}
                      disabled={currentPassword.length === 0 || newPassword.length < 8}
                      onClick={() => void changePassword()}
                    >
                      Save password
                    </Btn>
                  </div>
                </div>
              )}
            </li>

            <li>
              <Link href="/admin/logs" className="flex items-center gap-3 py-3.5">
                <Bell size={16} weight="regular" aria-hidden className="text-ink-500" />
                <span className="flex-1 text-[13.5px] font-medium text-ink-700">Notification activity</span>
                <CaretRight size={16} weight="bold" aria-hidden className="text-[#c2d2e6]" />
              </Link>
            </li>

            <li className="flex items-center gap-3 py-3.5">
              <CircleHalf size={16} weight="regular" aria-hidden className="text-ink-500" />
              <span className="flex-1 text-[13.5px] font-medium text-ink-700">Appearance</span>
              <span className="text-[13px] font-semibold text-ink-800">{theme === "dark" ? "Dark" : "Light"}</span>
            </li>

            <li>
              <Link href="/admin/registry" className="flex items-center gap-3 py-3.5">
                <UploadSimple size={16} weight="regular" aria-hidden className="text-ink-500" />
                <span className="flex-1 text-[13.5px] font-medium text-ink-700">Download centre</span>
                <CaretRight size={16} weight="bold" aria-hidden className="text-[#c2d2e6]" />
              </Link>
            </li>
          </ul>
        </Panel>

        <Panel icon={Globe} title="System preferences">
          <div className="space-y-5">
            <div>
              <p className="console-label">Theme</p>
              <Segmented
                value={theme}
                onChange={(next) => {
                  setTheme(next);
                  applyConsoleTheme(next);
                }}
                options={[
                  { value: "light", label: "Light", icon: Sun },
                  { value: "dark", label: "Dark", icon: Moon },
                ]}
              />
              <p className="mt-1.5 text-[12.5px] text-ink-500">
                Applies to the console on this device, and is remembered between visits.
              </p>
            </div>

            <div>
              <p className="console-label">Language</p>
              <div className="flex items-center gap-2.5">
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  aria-label="Language"
                  className="console-input max-w-[220px]"
                >
                  {LANGUAGES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <Btn size="sm" loading={savingLanguage} onClick={() => void saveLanguage()}>
                  <Translate size={14} weight="bold" aria-hidden />
                  Save
                </Btn>
              </div>
              <p className="mt-1.5 text-[12.5px] text-ink-500">
                Saved on your account, so it follows you to the mobile app.
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel icon={Info} title="About ElimuAR" className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-[640px] text-[13.5px] leading-6 text-ink-600">
            ElimuAR is a practical learning platform that uses AR to help students build real world skills and digital
            literacy.
          </p>
          <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-ink-500">
            <BellRinging size={13} weight="bold" aria-hidden />
            Version 1.0.0
          </span>
        </div>
      </Panel>
    </ConsolePage>
  );
}
