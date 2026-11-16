"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { handInSchema } from "@elimuar/shared";
import { CaretDown, CaretRight, ChartBar, CheckCircle, Cube, Tray, Users } from "@phosphor-icons/react";
import { ConsolePage, Note, Panel, SearchInput, Select, Skeleton, StatCard, TD, TH } from "@/components/console/kit";
import { useApi } from "@/lib/useApi";
import { formatDateTime } from "@/lib/format";

const resultSchema = z.object({
  studentName: z.string(),
  studentIdentifier: z.string().nullable(),
  classId: z.string(),
  className: z.string(),
  schoolName: z.string(),
  activityKey: z.string(),
  activityTitle: z.string(),
  activitySubject: z.string().nullable().optional(),
  status: z.string(),
  bestScorePercent: z.number().nullable(),
  latestScorePercent: z.number().nullable(),
  attempts: z.number(),
  lastDurationSeconds: z.number().nullable(),
  lastPlayedAt: z.string().nullable(),
});
const listSchema = z.array(resultSchema);

// An assignment handed in from the app (GET /assignments/handins).
const handInListSchema = z.array(handInSchema);

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  mastered: "Mastered",
};

function scoreTone(score: number | null) {
  if (score == null) return "text-ink-400";
  if (score >= 70) return "text-[#138A2B]";
  if (score >= 40) return "text-[#B26A00]";
  return "text-[#C62828]";
}

/** The learners' runs on the phone's AR activities, as they arrive from the app: who played what, how far
   they got, their best and latest score, and how often. */
export function ArResults({ showSchool }: { showSchool: boolean }) {
  return (
    <ConsolePage title="AR Activities" subtitle="How learners score in the app's activities.">
      <ArResultsPanel showSchool={showSchool} />
    </ConsolePage>
  );
}

export function ArResultsPanel({ showSchool }: { showSchool: boolean }) {
  const { data, loading, error } = useApi("/ar-activities/results", listSchema, [], { intervalMs: 20_000 });
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState("all");
  const [klass, setKlass] = useState("all");
  const [subject, setSubject] = useState("all");

  const activities = useMemo(() => Array.from(new Set((data ?? []).map((r) => r.activityTitle))).sort(), [data]);
  const classes = useMemo(() => Array.from(new Set((data ?? []).map((r) => r.className))).sort(), [data]);
  const subjects = useMemo(
    () => Array.from(new Set((data ?? []).map((r) => r.activitySubject).filter((s): s is string => !!s))).sort(),
    [data]
  );
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (r) =>
        (activity === "all" || r.activityTitle === activity) &&
        (klass === "all" || r.className === klass) &&
        (subject === "all" || r.activitySubject === subject) &&
        (!q || r.studentName.toLowerCase().includes(q) || (r.studentIdentifier ?? "").toLowerCase().includes(q))
    );
  }, [data, query, activity, klass, subject]);

  const finished = rows.filter((r) => r.status === "completed" || r.status === "mastered");
  const average = finished.length
    ? Math.round(finished.reduce((n, r) => n + (r.bestScorePercent ?? 0), 0) / finished.length)
    : null;
  const learners = new Set(rows.map((r) => r.studentName + r.studentIdentifier)).size;

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatCard icon={Users} label="Learners" value={learners} caption="who played" />
        <StatCard icon={CheckCircle} label="Finished" value={finished.length} caption="activities" />
        <StatCard icon={ChartBar} label="Average" value={average == null ? "—" : `${average}%`} caption="best score" />
      </div>
      <Panel
        icon={Cube}
        title="Runs"
        meta={data ? `${rows.length} record${rows.length === 1 ? "" : "s"}` : undefined}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Select ariaLabel="Activity" value={activity} onChange={setActivity} options={[{ value: "all", label: "All activities" }, ...activities.map((a) => ({ value: a, label: a }))]} />
            <Select ariaLabel="Class" value={klass} onChange={setKlass} options={[{ value: "all", label: "All classes" }, ...classes.map((c) => ({ value: c, label: c }))]} />
            <Select ariaLabel="Subject" value={subject} onChange={setSubject} options={[{ value: "all", label: "All subjects" }, ...subjects.map((s) => ({ value: s, label: s }))]} />
            <SearchInput value={query} onChange={setQuery} placeholder="Search learners" />
          </div>
        }
        padded={false}
      >
        {error && <div className="px-5 pb-4"><Note>{error}</Note></div>}
        {loading && !data ? (
          <div className="px-5 pb-5"><Skeleton className="h-40" /></div>
        ) : rows.length === 0 ? (
          <div className="px-5 pb-5"><Note>No results yet.</Note></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr>
                  <th className={TH}>Learner</th>
                  <th className={TH}>Class</th>
                  {showSchool && <th className={TH}>School</th>}
                  <th className={TH}>Activity</th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Best</th>
                  <th className={TH}>Latest</th>
                  <th className={TH}>Runs</th>
                  <th className={TH}>Last played</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.studentIdentifier}-${r.classId}-${r.activityKey}`}>
                    <td className={TD}>
                      <span className="font-semibold text-ink-900">{r.studentName}</span>
                      {r.studentIdentifier && <span className="block text-[12px] text-ink-500">{r.studentIdentifier}</span>}
                    </td>
                    <td className={TD}>{r.className}</td>
                    {showSchool && <td className={TD}>{r.schoolName}</td>}
                    <td className={TD}>{r.activityTitle}</td>
                    <td className={TD}>{STATUS_LABEL[r.status] ?? r.status}</td>
                    <td className={`${TD} font-bold ${scoreTone(r.bestScorePercent)}`}>
                      {r.bestScorePercent == null ? "—" : `${Math.round(r.bestScorePercent)}%`}
                    </td>
                    <td className={`${TD} ${scoreTone(r.latestScorePercent)}`}>
                      {r.latestScorePercent == null ? "—" : `${Math.round(r.latestScorePercent)}%`}
                    </td>
                    <td className={TD}>{r.attempts}</td>
                    <td className={TD}>{r.lastPlayedAt ? formatDateTime(r.lastPlayedAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <HandIns activity={activity} klass={klass} query={query} />
    </>
  );
}

/** Assignments handed in from the app, newest first: the score, how the attempt ended (finished, left
   part-way, time ran out, app closed), and every question with the learner's answer. */
function HandIns({ activity, klass, query }: { activity: string; klass: string; query: string }) {
  const { data, loading, error } = useApi("/assignments/handins", handInListSchema, [], { intervalMs: 20_000 });
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? [])
      .filter(
        (r) =>
          (activity === "all" || r.activityTitle === activity) &&
          (klass === "all" || r.className === klass) &&
          (!q || r.studentName.toLowerCase().includes(q) || (r.admissionNumber ?? "").toLowerCase().includes(q))
      )
      .sort((a, b) => b.handedInAt.localeCompare(a.handedInAt));
  }, [data, activity, klass, query]);

  return (
    <Panel
      icon={Tray}
      title="Hand-ins"
      meta={data ? `${rows.length} assignment attempt${rows.length === 1 ? "" : "s"}` : undefined}
      className="mt-4"
      padded={false}
    >
      {error && <div className="px-5 pb-4"><Note>{error}</Note></div>}
      {loading && !data ? (
        <div className="px-5 pb-5"><Skeleton className="h-24" /></div>
      ) : rows.length === 0 ? (
        <div className="px-5 pb-5"><Note>No assignments handed in yet.</Note></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr>
                <th className={TH}>Learner</th>
                <th className={TH}>Class</th>
                <th className={TH}>Activity</th>
                <th className={TH}>Score</th>
                <th className={TH}>Ended</th>
                <th className={TH}>Handed in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const score = r.scorePercent;
                const expanded = open === r.id;
                return [
                  <tr key={r.id} className="cursor-pointer hover:bg-[#F7FAFE]" onClick={() => setOpen(expanded ? null : r.id)}>
                    <td className={TD}>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-ink-900">
                        {expanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
                        {r.studentName}
                      </span>
                      {r.admissionNumber && <span className="block pl-[18px] text-[12px] text-ink-500">{r.admissionNumber}</span>}
                    </td>
                    <td className={TD}>{r.className}</td>
                    <td className={TD}>{r.activityTitle}</td>
                    <td className={`${TD} font-bold ${scoreTone(score)}`}>{`${Math.round(score)}%`}</td>
                    <td className={TD}>
                      {endedLabel(r.endReason)}
                      {r.late && <span className="ml-1.5 rounded-full bg-[#FFF4E5] px-2 py-0.5 text-[11px] font-semibold text-[#a3600a]">Late</span>}
                    </td>
                    <td className={TD}>{formatDateTime(r.handedInAt)}</td>
                  </tr>,
                  expanded && (
                    <tr key={`${r.id}-items`}>
                      <td colSpan={6} className="bg-[#F7FAFE] px-5 py-3">
                        {r.answers.length === 0 ? (
                          <Note>No questions were recorded for this attempt.</Note>
                        ) : (
                          <ol className="space-y-2">
                            {r.answers.map((q, i) => (
                              <li key={i} className="text-[13px] leading-5">
                                <span className={`mr-2 font-bold ${q.correct ? "text-[#138A2B]" : "text-[#C62828]"}`}>
                                  {q.correct ? "✓" : "✗"} Q{i + 1}
                                </span>
                                <span className="text-ink-900">{q.prompt}</span>
                                <span className="block pl-9 text-ink-500">
                                  Answered: {q.chosen ?? "not answered"}
                                  {!q.correct && q.answer ? ` · Correct: ${q.answer}` : ""}
                                </span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function endedLabel(reason: string | null) {
  if (reason === "time_up") return "Time ran out";
  if (reason === "app_closed") return "App closed";
  if (reason === "exited") return "Left early";
  return "Finished";
}
