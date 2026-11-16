"use client";

import { useMemo, useState } from "react";
import {
  ChartBar,
  ChartLineUp,
  CheckCircle,
  ClipboardText,
  Clock,
  Cube,
  DownloadSimple,
  GraduationCap,
  Printer,
  Question,
  Target,
  Users,
} from "@phosphor-icons/react";
import { schoolReportSchema, type SchoolReport } from "@elimuar/shared";
import {
  ActivityChart,
  Btn,
  ConsolePage,
  ConsoleTable,
  Panel,
  SearchInput,
  Segmented,
  Select,
  Skeleton,
  StatCard,
} from "@/components/console/kit";
import { formatDate, formatNumber, formatRelative } from "@/lib/format";
import { useSchoolScope } from "@/lib/scope";
import { useApi } from "@/lib/useApi";

/** Reports: how learners are using the AR activities and how well they do, for a period and optionally one
   class or subject. */

const PERIODS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 12 months" },
];

const pct = (value: number | null) => (value == null ? "—" : `${value}%`);

function scoreTone(value: number | null, mastery: number) {
  if (value == null) return "text-ink-500";
  if (value >= mastery) return "font-semibold text-[#0F7A3D]";
  if (value < 50) return "font-semibold text-danger-600";
  return "text-ink-900";
}

export default function ReportsPage() {
  const scope = useSchoolScope();
  const schoolId = scope.schoolId;
  const [days, setDays] = useState("30");
  const [classId, setClassId] = useState("");
  const [subject, setSubject] = useState("");

  const params = new URLSearchParams({ days });
  if (classId) params.set("classId", classId);
  if (subject) params.set("subject", subject);
  if (scope.isOverride && schoolId) params.set("schoolId", schoolId);
  const report = useApi(schoolId ? `/api/reports/school?${params}` : null, schoolReportSchema, [schoolId, days, classId, subject]);
  const data = report.data;
  const mastery = data?.masteryPercent ?? 80;

  return (
    <ConsolePage
      title="Reports"
      subtitle="How learners use the AR activities, and how well they do."
      actions={
        <>
          <Select value={days} onChange={setDays} ariaLabel="Period" options={PERIODS} className="w-40" />
          <Select
            value={classId}
            onChange={setClassId}
            ariaLabel="Class"
            className="w-36"
            options={[{ value: "", label: "All classes" }, ...(data?.filters.classes ?? []).map((c) => ({ value: c.id, label: c.name }))]}
          />
          <Select
            value={subject}
            onChange={setSubject}
            ariaLabel="Subject"
            className="w-44"
            options={[{ value: "", label: "All subjects" }, ...(data?.filters.subjects ?? []).map((s) => ({ value: s, label: s }))]}
          />
          <Btn onClick={() => window.print()} aria-label="Print">
            <Printer size={16} weight="bold" aria-hidden /> Print
          </Btn>
          <Btn variant="primary" disabled={!data} onClick={() => data && exportWorkbook(data)}>
            <DownloadSimple size={16} weight="bold" aria-hidden /> Export
          </Btn>
        </>
      }
    >
      {report.error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {report.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          icon={Users}
          label="Active learners"
          value={data ? `${data.totals.activeStudents}/${data.totals.students}` : <Skeleton className="h-8 w-20" />}
          caption="Played at least one activity"
        />
        <StatCard
          icon={Cube}
          label="Activity runs"
          value={data ? formatNumber(data.totals.runs) : <Skeleton className="h-8 w-14" />}
          caption={data ? `${formatNumber(data.totals.finishedRuns)} finished` : "Started"}
        />
        <StatCard
          icon={ChartBar}
          label="Average score"
          value={data ? pct(data.totals.averageScore) : <Skeleton className="h-8 w-14" />}
          caption="Of finished runs"
        />
        <StatCard
          icon={Target}
          label="Mastery"
          value={data ? pct(data.totals.masteryRate) : <Skeleton className="h-8 w-14" />}
          caption={`Runs scoring ${mastery}% or more`}
        />
        <StatCard
          icon={Clock}
          label="Time on AR"
          value={data ? (data.totals.minutesPlayed >= 120 ? `${Math.round(data.totals.minutesPlayed / 60)} h` : `${data.totals.minutesPlayed} min`) : <Skeleton className="h-8 w-14" />}
          caption="Spent in activities"
        />
        <StatCard
          icon={ClipboardText}
          label="Hand-in rate"
          value={data ? pct(data.totals.handInRate) : <Skeleton className="h-8 w-14" />}
          caption={data ? `${data.totals.assignments} assignment${data.totals.assignments === 1 ? "" : "s"} · ${data.totals.lateHandIns} late` : "Assignments"}
        />
      </div>

      <Panel className="mt-4" icon={ChartLineUp} title="Activity over time" meta="Runs started and finished each day">
        {data ? (
          <ActivityChart
            labels={data.trend.map((d) => d.date.slice(5))}
            series={[
              { key: "runs", label: "Started", color: "#2F7CF6", values: data.trend.map((d) => d.runs) },
              { key: "finished", label: "Finished", color: "#16A34A", values: data.trend.map((d) => d.finished) },
            ]}
          />
        ) : (
          <Skeleton className="h-[260px] w-full" />
        )}
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel icon={Users} title="Classes" meta="Each class side by side" padded={false}>
          <ConsoleTable
            loading={report.loading && !data}
            paginate={false}
            rows={(data?.classes ?? []).map((c) => ({ ...c, id: c.classId }))}
            emptyMessage="No classes."
            columns={[
              { key: "name", header: "Class", render: (c) => <span className="font-semibold text-ink-900">{c.className}</span> },
              { key: "active", header: "Active", numeric: true, render: (c) => `${c.activeStudents}/${c.students}` },
              { key: "runs", header: "Runs", numeric: true, render: (c) => c.runs },
              { key: "avg", header: "Average", numeric: true, render: (c) => <span className={scoreTone(c.averageScore, mastery)}>{pct(c.averageScore)}</span> },
              { key: "mastery", header: "Mastery", numeric: true, render: (c) => pct(c.masteryRate) },
              { key: "handin", header: "Hand-in", numeric: true, render: (c) => pct(c.handInRate) },
            ]}
          />
        </Panel>

        <Panel icon={GraduationCap} title="Grades" meta="Learners by their average score">
          <GradeBars grades={data?.grades ?? []} />
        </Panel>
      </div>

      <Panel className="mt-4" icon={Cube} title="Activities" meta="Which activities are used, and how well learners do in them" padded={false}>
        <ConsoleTable
          loading={report.loading && !data}
          paginate={false}
          rows={(data?.activities ?? []).map((a) => ({ ...a, id: a.activityKey }))}
          emptyMessage="No activities for this subject."
          columns={[
            {
              key: "title",
              header: "Activity",
              render: (a) => (
                <span>
                  <span className="block font-semibold text-ink-900">{a.title}</span>
                  <span className="block text-[12px] text-ink-500">
                    {a.subject ?? "—"} · {a.gradeLevel}
                  </span>
                </span>
              ),
            },
            { key: "runs", header: "Runs", numeric: true, render: (a) => a.runs },
            { key: "learners", header: "Learners", numeric: true, render: (a) => a.learners },
            { key: "avg", header: "Average", numeric: true, render: (a) => <span className={scoreTone(a.averageScore, mastery)}>{pct(a.averageScore)}</span> },
            { key: "mastery", header: "Mastery", numeric: true, render: (a) => pct(a.masteryRate) },
            { key: "time", header: "Time per run", numeric: true, render: (a) => (a.averageMinutes == null ? "—" : `${a.averageMinutes} min`) },
          ]}
        />
      </Panel>

      <div className="mt-4 grid gap-4">
        <Panel icon={ClipboardText} title="Assignments" meta="Work teachers set, and how much came back" padded={false}>
          <ConsoleTable
            loading={report.loading && !data}
            pageSize={6}
            rows={data?.assignments ?? []}
            emptyMessage="No assignments set yet."
            columns={[
              {
                key: "title",
                header: "Assignment",
                render: (a) => (
                  <span>
                    <span className="block font-semibold text-ink-900">{a.title}</span>
                    <span className="block text-[12px] text-ink-500">
                      {a.className} · {a.teacherName}
                    </span>
                  </span>
                ),
              },
              { key: "due", header: "Due", render: (a) => (a.dueAt ? formatDate(a.dueAt) : "—") },
              { key: "in", header: "Handed in", numeric: true, render: (a) => `${a.handedIn}/${a.students}` },
              { key: "late", header: "Late", numeric: true, render: (a) => (a.late ? <span className="font-semibold text-[#a3600a]">{a.late}</span> : 0) },
              { key: "avg", header: "Average", numeric: true, render: (a) => <span className={scoreTone(a.averageScore, mastery)}>{pct(a.averageScore)}</span> },
            ]}
          />
        </Panel>

        <Panel icon={Question} title="Hardest questions" meta="Answered wrongly most often in hand-ins">
          {data && data.questions.length === 0 && (
            <p className="text-[13px] text-ink-500">Questions appear here once learners hand in assignments.</p>
          )}
          <ul className="divide-y divide-line">
            {(data?.questions ?? []).map((q) => (
              <li key={`${q.activityTitle}-${q.prompt}`} className="flex items-start justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-[13.5px] text-ink-900">{q.prompt}</span>
                  <span className="block text-[12px] text-ink-500">
                    {q.activityTitle} · answered {q.answered} time{q.answered === 1 ? "" : "s"}
                  </span>
                </span>
                <span className={`shrink-0 text-[13.5px] ${scoreTone(q.correctRate, mastery)}`}>{q.correctRate}% right</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <LearnersPanel data={data} loading={report.loading && !data} mastery={mastery} />
    </ConsolePage>
  );
}

function GradeBars({ grades }: { grades: SchoolReport["grades"] }) {
  const most = Math.max(1, ...grades.map((g) => g.count));
  const total = grades.reduce((n, g) => n + g.count, 0);
  if (total === 0) return <p className="text-[13px] text-ink-500">Grades appear once learners finish activities.</p>;
  return (
    <ul className="space-y-2.5">
      {grades.map((g) => (
        <li key={g.label} className="grid grid-cols-[34px_minmax(0,1fr)_56px] items-center gap-3">
          <span className="text-[15px] font-bold text-ink-900">{g.label}</span>
          <span className="h-3 overflow-hidden rounded-full bg-[#EDF2F9]">
            <span className="block h-full rounded-full bg-brand-600" style={{ width: `${(100 * g.count) / most}%` }} />
          </span>
          <span className="text-right text-[12.5px] text-ink-500">
            {g.count} · {g.min}%+
          </span>
        </li>
      ))}
    </ul>
  );
}

function LearnersPanel({ data, loading, mastery }: { data: SchoolReport | null; loading: boolean; mastery: number }) {
  const [view, setView] = useState<"all" | "support" | "idle">("all");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.students ?? [])
      .filter((s) => (view === "support" ? s.needsSupport : view === "idle" ? s.runs === 0 : true))
      .filter((s) => !needle || s.name.toLowerCase().includes(needle) || (s.admissionNumber ?? "").toLowerCase().includes(needle))
      .map((s) => ({ ...s, id: s.studentId }));
  }, [data, view, query]);
  const support = data?.students.filter((s) => s.needsSupport).length ?? 0;
  const idle = data?.students.filter((s) => s.runs === 0).length ?? 0;

  return (
    <Panel
      className="mt-4"
      icon={GraduationCap}
      title="Learners"
      meta="Every learner in the period, best average first"
      padded={false}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: "All" },
              { value: "support", label: `Needs support (${support})` },
              { value: "idle", label: `Not started (${idle})` },
            ]}
          />
          <SearchInput value={query} onChange={setQuery} placeholder="Name or admission no." className="w-56" />
        </div>
      }
    >
      <ConsoleTable
        loading={loading}
        pageSize={12}
        rows={rows}
        emptyMessage="No learners match."
        columns={[
          {
            key: "name",
            header: "Learner",
            render: (s) => (
              <span className="flex items-center gap-2">
                <span className="font-semibold text-ink-900">{s.name}</span>
                {s.needsSupport && <span className="rounded-full bg-danger-50 px-2 py-0.5 text-[11px] font-semibold text-danger-700">Needs support</span>}
              </span>
            ),
          },
          { key: "adm", header: "Admission no.", render: (s) => <span className="font-mono text-[12.5px] text-ink-600">{s.admissionNumber ?? "—"}</span> },
          { key: "class", header: "Class", render: (s) => s.className },
          { key: "runs", header: "Runs", numeric: true, render: (s) => s.runs },
          { key: "acts", header: "Activities", numeric: true, render: (s) => s.activities },
          { key: "avg", header: "Average", numeric: true, render: (s) => <span className={scoreTone(s.averageScore, mastery)}>{pct(s.averageScore)}</span> },
          { key: "best", header: "Best", numeric: true, render: (s) => pct(s.bestScore) },
          { key: "grade", header: "Grade", render: (s) => <span className="font-bold text-ink-900">{s.grade ?? "—"}</span> },
          { key: "last", header: "Last played", render: (s) => (s.lastPlayedAt ? formatRelative(s.lastPlayedAt) : <span className="text-ink-500">Not yet</span>) },
        ]}
      />
      <div className="flex items-center gap-2 px-5 pb-4 text-[12px] text-ink-500">
        <CheckCircle size={14} weight="bold" aria-hidden className="text-[#0F7A3D]" /> Green: {mastery}% or more (mastery). Red: below 50%.
      </div>
    </Panel>
  );
}

/** The whole report as an Excel workbook, one sheet per table. */
async function exportWorkbook(data: SchoolReport) {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  const add = (name: string, rows: Array<Record<string, unknown>>) =>
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "Nothing in this period" }]), name);
  const t = data.totals;
  add("Summary", [
    { Measure: "Period", Value: `${formatDate(data.period.from)} – ${formatDate(data.period.to)}` },
    { Measure: "Learners active", Value: `${t.activeStudents} of ${t.students}` },
    { Measure: "Activity runs", Value: t.runs },
    { Measure: "Runs finished", Value: t.finishedRuns },
    { Measure: "Average score %", Value: t.averageScore ?? "" },
    { Measure: `Mastery % (${data.masteryPercent}%+)`, Value: t.masteryRate ?? "" },
    { Measure: "Minutes on AR", Value: t.minutesPlayed },
    { Measure: "Assignments", Value: t.assignments },
    { Measure: "Hand-in rate %", Value: t.handInRate ?? "" },
    { Measure: "Late hand-ins", Value: t.lateHandIns },
  ]);
  add("Classes", data.classes.map((c) => ({ Class: c.className, Learners: c.students, Active: c.activeStudents, Runs: c.runs, "Average %": c.averageScore ?? "", "Mastery %": c.masteryRate ?? "", "Hand-in %": c.handInRate ?? "" })));
  add("Activities", data.activities.map((a) => ({ Activity: a.title, Subject: a.subject ?? "", Form: a.gradeLevel, Runs: a.runs, Learners: a.learners, "Average %": a.averageScore ?? "", "Mastery %": a.masteryRate ?? "", "Minutes per run": a.averageMinutes ?? "" })));
  add("Learners", data.students.map((s) => ({ Learner: s.name, "Admission no.": s.admissionNumber ?? "", Class: s.className, Runs: s.runs, Activities: s.activities, "Average %": s.averageScore ?? "", "Best %": s.bestScore ?? "", Grade: s.grade ?? "", "Needs support": s.needsSupport ? "Yes" : "", "Last played": s.lastPlayedAt ? formatDate(s.lastPlayedAt) : "" })));
  add("Assignments", data.assignments.map((a) => ({ Assignment: a.title, Class: a.className, Teacher: a.teacherName, Due: a.dueAt ? formatDate(a.dueAt) : "", Learners: a.students, "Handed in": a.handedIn, Late: a.late, "Average %": a.averageScore ?? "" })));
  add("Questions", data.questions.map((q) => ({ Activity: q.activityTitle, Question: q.prompt, Answered: q.answered, "Right %": q.correctRate })));
  XLSX.writeFile(book, `ElimuAR report ${data.period.to.slice(0, 10)}.xlsx`);
}
