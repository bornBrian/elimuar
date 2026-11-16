import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { insertReturning } from "../db/helpers.js";
import { notifications } from "../db/schema.js";

const FROM = process.env.MAIL_FROM_ADDRESS?.trim() ?? "";

function resendKey(): string | null {
  const key = process.env.RESEND_API_KEY ?? process.env.MAIL_PROVIDER_KEY ?? "";
  return key ? key : null;
}

function emailConfigured(): boolean {
  return resendKey() !== null && FROM.length > 0;
}

export function providerStatus(): { email: boolean; sms: boolean } {
  return { email: emailConfigured(), sms: process.env.SMS_PROVIDER_KEY !== undefined && process.env.SMS_PROVIDER_KEY !== "" };
}

export interface NotificationInput {
  userId?: string | null;
  schoolId?: string | null;
  channel: "email" | "sms";
  purpose: string;
  toAddress: string;
  subject?: string | null;
  body: string;
  html?: string | null;
}

const PORTAL_URL = process.env.PORTAL_URL ?? "http://localhost:3000";
const APP_LINK_URL = process.env.MOBILE_APP_URL ?? PORTAL_URL;

export async function queueNotification(input: NotificationInput): Promise<void> {
  try {
    const row = await insertReturning(notifications, {
      userId: input.userId ?? null,
      schoolId: input.schoolId ?? null,
      channel: input.channel,
      purpose: input.purpose,
      toAddress: input.toAddress,
      subject: input.subject ?? null,
      body: input.body,
    });

    if (process.env.NODE_ENV !== "production") {
      console.log(`[notify:${input.channel}] → ${input.toAddress} · ${input.purpose}`);
    }

    if (input.channel === "email" ? emailConfigured() : Boolean(process.env.SMS_PROVIDER_URL && process.env.SMS_PROVIDER_KEY)) {
      await deliver(row.id, input.html ?? null);
    }
  } catch (error) {
    console.error(`[notify] failed to queue ${input.purpose} for ${input.toAddress}:`, error);
  }
}

export function emailDeliverable(): boolean {
  return emailConfigured();
}

async function deliver(id: string, html: string | null): Promise<void> {
  const [row] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  if (!row || row.status !== "queued") return;

  try {
    if (row.channel === "email") {
      const key = resendKey();
      if (!key) return;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          from: FROM,
          to: [row.toAddress],
          subject: row.subject ?? "ElimuAR",
          html: html ?? `<pre style="font-family:Inter,Arial,sans-serif;font-size:14px;white-space:pre-wrap">${escapeHtml(row.body)}</pre>`,
          text: row.body,
        }),
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 300);
        await db
          .update(notifications)
          .set({ status: "failed", error: `HTTP ${response.status} ${detail}`.trim() })
          .where(eq(notifications.id, row.id));
        console.error(`[notify] email to ${row.toAddress} failed: HTTP ${response.status}`);
        return;
      }
    } else {
      const url = process.env.SMS_PROVIDER_URL;
      const key = process.env.SMS_PROVIDER_KEY;
      if (!url || !key) return;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ to: row.toAddress, body: row.body }),
      });
      if (!response.ok) {
        const detail = (await response.text().catch(() => "")).slice(0, 300);
        await db
          .update(notifications)
          .set({ status: "failed", error: `HTTP ${response.status} ${detail}`.trim() })
          .where(eq(notifications.id, row.id));
        console.error(`[notify] sms to ${row.toAddress} failed: HTTP ${response.status}`);
        return;
      }
    }

    await db.update(notifications).set({ status: "sent", sentAt: new Date() }).where(eq(notifications.id, row.id));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    await db
      .update(notifications)
      .set({ status: "failed", error: detail.slice(0, 300) })
      .where(eq(notifications.id, row.id));
    console.error(`[notify] ${row.channel} to ${row.toAddress} failed:`, detail);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function emailShell(options: {
  heading: string;
  intro: string;
  lines?: string[];
  cta?: { label: string; url: string; caption?: string };
  footerNote?: string;
  schoolName?: string | null;
}): string {
  const rows = (options.lines ?? [])
    .map(
      (line) => `<tr><td style="padding:2px 0;font-size:14px;line-height:22px;color:#334155">${line}</td></tr>`
    )
    .join("");

  const cta = options.cta
    ? `<tr><td style="padding:22px 0 6px">
        <a href="${options.cta.url}"
           style="display:inline-block;background:#163A70;color:#ffffff;font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:12px 26px;border-radius:8px">${options.cta.label}</a>
        ${options.cta.caption ? `<p style="margin:10px 0 0;font-size:12px;color:#64748b">${options.cta.caption}</p>` : ""}
      </td></tr>`
    : "";

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F7FA">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:28px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #E6EAF2">
    <tr><td style="background:#0A1F44;padding:22px 28px">
      <p style="margin:0;font-family:Inter,Arial,sans-serif;font-size:17px;font-weight:700;letter-spacing:0.02em;color:#ffffff">ElimuAR</p>
      <p style="margin:3px 0 0;font-family:Inter,Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9BB8DA">${escapeHtml(options.schoolName ?? "Platform team")}</p>
    </td></tr>
    <tr><td style="padding:28px 28px 8px;font-family:Inter,Arial,sans-serif">
      <h1 style="margin:0 0 10px;font-size:20px;line-height:28px;color:#0F172A">${options.heading}</h1>
      <p style="margin:0;font-size:14px;line-height:22px;color:#334155">${options.intro}</p>
      ${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px">${rows}</table>` : ""}
      ${cta}
    </td></tr>
    <tr><td style="padding:18px 28px 26px;font-family:Inter,Arial,sans-serif">
      <p style="margin:0;font-size:12px;line-height:19px;color:#94A3B8">${options.footerNote ?? `Sent by ElimuAR · ${PORTAL_URL}`}</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

function detailRows(details: Array<[string, string | null | undefined]>): string[] {
  return details
    .filter(([, value]) => value)
    .map(([label, value]) => `<strong style="color:#0F172A">${label}:</strong> ${escapeHtml(value!)}`);
}

export interface SchoolHead {
  userId: string;
  firstName: string;
  email: string;
  phone?: string | null;
  schoolId: string;
  schoolName: string;
}

export async function queueSchoolStatusNotice(
  head: SchoolHead,
  status: "active" | "suspended" | "pending"
): Promise<void> {
  const heading =
    status === "active"
      ? `${head.schoolName} is now active`
      : status === "suspended"
        ? `${head.schoolName} has been suspended`
        : `${head.schoolName} is set back to pending`;

  const intro =
    status === "active"
      ? `Hello ${head.firstName}, your school can now be used on ElimuAR. Your staff can sign in and load learners from the admission register.`
      : status === "suspended"
        ? `Hello ${head.firstName}, staff sign-in and new practicals are blocked until the school is reinstated.`
        : `Hello ${head.firstName}, your school is set back to pending on ElimuAR. Contact the platform team if this was not expected.`;

  await queueNotification({
    userId: head.userId,
    schoolId: head.schoolId,
    channel: "email",
    purpose: `school_${status}`,
    toAddress: head.email,
    subject: `${head.schoolName}: ${status === "active" ? "now active" : status}`,
    body: `Hello ${head.firstName},\n\n${heading} on ElimuAR.\n`,
    html: emailShell({
      heading,
      intro,
      schoolName: head.schoolName,
      cta: status === "active" ? { label: "Open the staff portal", url: PORTAL_URL } : undefined,
    }),
  });

  if (head.phone) {
    await queueNotification({
      userId: head.userId,
      schoolId: head.schoolId,
      channel: "sms",
      purpose: `school_${status}`,
      toAddress: head.phone,
      body:
        status === "active"
          ? `ElimuAR: ${head.schoolName} is active. Sign in at ${PORTAL_URL} and load your learners.`
          : status === "suspended"
            ? `ElimuAR: ${head.schoolName} has been suspended. Staff sign-in is blocked until it is reinstated.`
            : `ElimuAR: ${head.schoolName} is back to pending. Contact the platform team if this was not expected.`,
    });
  }
}

export interface ProvisionedPerson {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  role: string;
  schoolId: string;
  schoolName: string;
  setupUrl?: string | null;
  setupToken?: string | null;
}

function setupDestination(person: {
  role: string;
  setupUrl?: string | null;
  setupToken?: string | null;
}): string | null {
  if (!person.setupUrl) return null;
  if (person.role === "teacher" && person.setupToken) {
    return `${APP_LINK_URL}/teacher/invite/${encodeURIComponent(person.setupToken)}`;
  }
  return person.setupUrl;
}

function roleWords(role: string): string {
  if (role === "school_admin") return "school head";
  if (role === "academic_master") return "academic master";
  if (role === "secretary") return "secretary";
  if (role === "platform_admin") return "platform administrator";
  if (role === "student") return "learner";
  return "teacher";
}

export async function queueRegistrationInvite(person: ProvisionedPerson): Promise<void> {
  const name = `${person.firstName} ${person.lastName}`;
  const details = detailRows([
    ["Name", name],
    ["Email", person.email],
    ["Phone", person.phone],
    ["Role", roleWords(person.role)],
  ]);

  const destination = setupDestination(person);
  const hasLink = Boolean(destination);
  await queueNotification({
    userId: person.userId,
    schoolId: person.schoolId,
    channel: "email",
    purpose: "registration_invite",
    toAddress: person.email,
    subject: `${person.schoolName} added you to ElimuAR`,
    body: hasLink
      ? `Hello ${person.firstName},\n\n${person.schoolName} has added you to ElimuAR as a ${roleWords(person.role)}.\n\nSet your password: ${destination}\n`
      : `Hello ${person.firstName},\n\n${person.schoolName} has added you to ElimuAR as a ${roleWords(person.role)}. Open ${PORTAL_URL}/register to set your password.\n`,
    html: emailShell({
      heading: `You have been added to ${person.schoolName}`,
      intro: `Hello ${person.firstName}, ${person.schoolName} has added you to ElimuAR as a <strong>${roleWords(person.role)}</strong>. Choose your own password — nobody else sets it for you.`,
      lines: details,
      schoolName: person.schoolName,
      cta: hasLink
        ? {
            label:
              person.role === "teacher"
                ? "Open ElimuAR"
                : "Set your password",
            url: destination!,
            caption: "The link expires in 24 hours. If the button does not work, paste this address into your browser.",
          }
        : {
            label: "Finish setting up your account",
            url: `${PORTAL_URL}/register`,
          },
    }),
  });

  if (person.phone) {
    await queueNotification({
      userId: person.userId,
      schoolId: person.schoolId,
      channel: "sms",
      purpose: "registration_invite",
      toAddress: person.phone,
      body: `ElimuAR: ${person.schoolName} added you as a ${roleWords(person.role)}. Set your password at ${PORTAL_URL}/register.`,
    });
  }
}

export async function queueMembershipNotice(person: {
  userId: string;
  firstName: string;
  email: string;
  phone?: string | null;
  role: string;
  schoolId: string;
  schoolName: string;
  previousSchoolName?: string | null;
}): Promise<void> {
  const opening = person.previousSchoolName
    ? `You have moved from ${person.previousSchoolName} to ${person.schoolName} on ElimuAR.`
    : `You have been added to ${person.schoolName} on ElimuAR.`;

  await queueNotification({
    userId: person.userId,
    schoolId: person.schoolId,
    channel: "email",
    purpose: "membership_added",
    toAddress: person.email,
    subject: `${person.schoolName}: you have been added as ${roleWords(person.role)}`,
    body: `Hello ${person.firstName},\n\n${opening}\n\nSign in at ${PORTAL_URL} with your existing password.\n`,
    html: emailShell({
      heading: `Welcome to ${person.schoolName}`,
      intro: `Hello ${person.firstName}, ${opening} Sign in at ${PORTAL_URL} with your existing password — there is nothing to register.`,
      schoolName: person.schoolName,
      cta: { label: "Sign in", url: `${PORTAL_URL}/login` },
    }),
  });

  if (person.phone) {
    await queueNotification({
      userId: person.userId,
      schoolId: person.schoolId,
      channel: "sms",
      purpose: "membership_added",
      toAddress: person.phone,
      body: `ElimuAR: you are now at ${person.schoolName}. Sign in with your existing password.`,
    });
  }
}

export async function queueVerificationCode(person: {
  userId: string;
  email: string;
  firstName: string;
  code: string;
  ttlMinutes: number;
  purpose: string;
  subject: string;
  heading: string;
  intro: string;
}): Promise<void> {
  await queueNotification({
    userId: person.userId,
    channel: "email",
    purpose: person.purpose,
    toAddress: person.email,
    subject: person.subject,
    body: `Hello ${person.firstName},\n\nYour verification code is ${person.code}. It expires in ${person.ttlMinutes} minutes.\n`,
    html: emailShell({
      heading: person.heading,
      intro: person.intro,
      lines: [`<span style="font-family:'IBM Plex Mono',Courier,monospace;font-size:30px;letter-spacing:0.3em;font-weight:700;color:#0F172A">${escapeHtml(person.code)}</span>`],
      footerNote: `This code expires in ${person.ttlMinutes} minutes. If you were not expecting it, ignore this email — nothing changes until the code is used.`,
      schoolName: null,
    }),
  });
}

export async function queuePasswordResetLink(person: {
  userId: string;
  email: string;
  firstName: string;
  resetUrl: string;
}): Promise<void> {
  await queueNotification({
    userId: person.userId,
    channel: "email",
    purpose: "password_reset",
    toAddress: person.email,
    subject: "Reset your ElimuAR password",
    body: `Hello ${person.firstName},\n\nReset your password: ${person.resetUrl}\n\nThe link expires in 60 minutes.\n`,
    html: emailShell({
      heading: "Reset your password",
      intro: `Hello ${person.firstName}, a password reset was requested for your ElimuAR account.`,
      schoolName: null,
      cta: {
        label: "Choose a new password",
        url: person.resetUrl,
        caption: "The link expires in 60 minutes. If you did not ask for this, you can ignore this email — your password is unchanged.",
      },
    }),
  });
}

export async function flushOutbox(limit = 50): Promise<{ sent: number; failed: number; remaining: number }> {
  const queued = await db
    .select({ id: notifications.id, channel: notifications.channel })
    .from(notifications)
    .where(and(eq(notifications.status, "queued"), inArray(notifications.channel, ["email", "sms"])))
    .orderBy(notifications.createdAt)
    .limit(limit);

  for (const row of queued) await deliver(row.id, null);

  const [sentRows, failedRows, queuedRows] = await Promise.all([
    db.select({ id: notifications.id }).from(notifications).where(eq(notifications.status, "sent")),
    db.select({ id: notifications.id }).from(notifications).where(eq(notifications.status, "failed")),
    db.select({ id: notifications.id }).from(notifications).where(eq(notifications.status, "queued")),
  ]);

  return {
    sent: sentRows.length,
    failed: failedRows.length,
    remaining: queuedRows.length,
  };
}
