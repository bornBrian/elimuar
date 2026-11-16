"use client";

import type { MembershipStatus, ProgressStatus } from "@elimuar/shared";

export type SignalTone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";

const TONE_CLASS: Record<SignalTone, string> = {
  neutral: "text-slate-500",
  info: "text-primary-700",
  success: "text-success-700",
  warning: "text-warning-700",
  danger: "text-danger-700",
  accent: "text-accent-700",
};

function Signal({ tone, label }: { tone: SignalTone; label: string }) {
  return <span className={`whitespace-nowrap text-sm font-semibold ${TONE_CLASS[tone]}`}>{label}</span>;
}

const PROGRESS: Record<ProgressStatus, { tone: SignalTone; label: string }> = {
  not_started: { tone: "neutral", label: "Not started" },
  in_progress: { tone: "info", label: "In progress" },
  completed: { tone: "success", label: "Completed" },
  mastered: { tone: "accent", label: "Mastered" },
};

export function ProgressChip({ status }: { status: ProgressStatus }) {
  return <Signal {...PROGRESS[status]} />;
}

const ASSIGNMENT: Record<string, { tone: SignalTone; label: string }> = {
  scheduled: { tone: "info", label: "Scheduled" },
  open: { tone: "success", label: "Open" },
  closed: { tone: "neutral", label: "Closed" },
};

export function AssignmentChip({ status }: { status: string }) {
  return <Signal {...(ASSIGNMENT[status] ?? { tone: "neutral" as SignalTone, label: status })} />;
}

const SUBMISSION: Record<string, { tone: SignalTone; label: string }> = {
  auto_graded: { tone: "info", label: "Scored on submit" },
  needs_review: { tone: "warning", label: "Partly scored" },
  graded: { tone: "success", label: "Marked" },
};

export function SubmissionChip({ status }: { status: string }) {
  return <Signal {...(SUBMISSION[status] ?? { tone: "neutral" as SignalTone, label: status })} />;
}

const MEMBERSHIP: Record<MembershipStatus, { tone: SignalTone; label: string }> = {
  active: { tone: "success", label: "Active" },
  suspended: { tone: "warning", label: "Suspended" },
  transferred: { tone: "info", label: "Transferred" },
  removed: { tone: "danger", label: "Removed" },
};

export function MembershipChip({ status }: { status: MembershipStatus }) {
  return <Signal {...MEMBERSHIP[status]} />;
}

export function RegistrationSignal({ awaiting }: { awaiting: boolean }) {
  return awaiting ? (
    <Signal tone="warning" label="Not registered yet" />
  ) : (
    <Signal tone="success" label="Registered" />
  );
}

const LESSON: Record<string, { tone: SignalTone; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  in_review: { tone: "warning", label: "In review" },
  published: { tone: "success", label: "Published" },
  archived: { tone: "danger", label: "Archived" },
};

export function LessonChip({ status }: { status: string }) {
  return <Signal {...(LESSON[status] ?? { tone: "neutral" as SignalTone, label: status })} />;
}

const ASSET: Record<string, { tone: SignalTone; label: string }> = {
  draft: { tone: "neutral", label: "Draft" },
  approved: { tone: "success", label: "Approved" },
  archived: { tone: "danger", label: "Archived" },
};

export function AssetChip({ status }: { status: string }) {
  return <Signal {...(ASSET[status] ?? { tone: "neutral" as SignalTone, label: status })} />;
}

const SCHOOL: Record<string, { tone: SignalTone; label: string }> = {
  active: { tone: "success", label: "Active" },
  pending: { tone: "warning", label: "Pending" },
  suspended: { tone: "danger", label: "Suspended" },
};

export function SchoolChip({ status }: { status: string }) {
  return <Signal {...(SCHOOL[status] ?? { tone: "neutral" as SignalTone, label: status })} />;
}

const ENROLLMENT: Record<string, { tone: SignalTone; label: string }> = {
  active: { tone: "success", label: "Active" },
  transferred: { tone: "warning", label: "Transferred" },
  withdrawn: { tone: "danger", label: "Withdrawn" },
};

export function EnrollmentChip({ status }: { status: string }) {
  return <Signal {...(ENROLLMENT[status] ?? { tone: "neutral" as SignalTone, label: status })} />;
}
