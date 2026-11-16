"use client";

import Link from "next/link";
import { BookOpen, ChartLineUp, Cube, GraduationCap, User, Users, Warning } from "@phosphor-icons/react";
import { platformLogPageSchema, schoolOverviewSchema } from "@elimuar/shared";
import { ActivityChart, Btn, ConsolePage, Panel, PanelLink, Skeleton, StatCard } from "@/components/console/kit";
import { formatNumber, formatRelative } from "@/lib/format";
import { useSchoolScope } from "@/lib/scope";
import { useApi } from "@/lib/useApi";

/** The head of school's home: the school's size, how much learners used the AR activities this week, each
   class at a glance, and what needs attention. */

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const STATUS_WORD: Record<string, string> = {
  in_progress: "Started",
  completed: "Finished",
  mastered: "Mastered",
  not_started: "Not started",
};

export default function HeadOverviewPage() {
  const scope = useSchoolScope();
  const schoolId = scope.schoolId;
  const suffix = scope.isOverride && schoolId ? `?schoolId=${schoolId}` : "";

  const overview = useApi(schoolId ? `/api/reports/school/overview${suffix}` : null, schoolOverviewSchema, [schoolId], {
    intervalMs: 30_000,
  });
  const activity = useApi(
    schoolId ? `/api/schools/${schoolId}/activity?pageSize=5` : null,
    platformLogPageSchema,
    [schoolId]
  );
  const data = overview.data;
  const days = data?.windowDays ?? 7;

  return (
    <ConsolePage
      lead={scope.user?.firstName ? `${greeting()}, ${scope.user.firstName}` : undefined}
      title={data?.schoolName ?? scope.user?.schoolName ?? "Your school"}
      subtitle="Your school at a glance."
      actions={
        <Btn loading={overview.loading} onClick={() => overview.reload()}>
          Refresh
        </Btn>
      }
    >
      {overview.error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {overview.error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={GraduationCap}
          label="Students"
          value={data ? formatNumber(data.counts.students) : <Skeleton className="h-8 w-16" />}
          caption={data ? `${formatNumber(data.activeStudents)} used AR in the last ${days} days` : "Enrolled"}
        />
        <StatCard
          icon={User}
          label="Teachers"
          value={data ? formatNumber(data.counts.teachers) : <Skeleton className="h-8 w-12" />}
          caption="On the staff"
        />
        <StatCard
          icon={BookOpen}
          label="Classes"
          value={data ? formatNumber(data.counts.classes) : <Skeleton className="h-8 w-10" />}
          caption={data ? `${formatNumber(data.counts.subjects)} subjects taught` : "This year"}
        />
        <StatCard
          icon={Cube}
          label="Activity runs"
          value={data ? formatNumber(data.runsInWindow) : <Skeleton className="h-8 w-14" />}
          caption={
            data
              ? data.averageScore != null
                ? `Average score ${data.averageScore}% · last ${days} days`
                : `Last ${days} days`
              : "AR activities played"
          }
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Panel icon={ChartLineUp} title="Activity" meta="Runs started and finished, last 14 days" action={<PanelLink href="/head/reports">Open reports</PanelLink>}>
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

        <Panel icon={Warning} title="Needs attention" meta="Things to follow up">
          {data && data.attention.length === 0 && (
            <p className="rounded-xl border border-line bg-[#F7FAFE] px-3.5 py-3 text-[13px] text-ink-500">
              Nothing needs attention right now.
            </p>
          )}
          <ul className="space-y-2">
            {(data?.attention ?? []).map((item) => (
              <li key={item.title}>
                <Link href={item.href} className="block rounded-xl border border-line px-3.5 py-2.5 hover:border-brand-200 hover:bg-brand-50/40">
                  <p className="text-[13.5px] font-semibold text-ink-900">{item.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-500">{item.detail}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Panel icon={Users} title="Classes" meta={`Learners who used AR in the last ${days} days`} action={<PanelLink href="/head/classes">Manage</PanelLink>}>
          <ul className="divide-y divide-line">
            {(data?.classes ?? []).map((c) => {
              const share = c.students > 0 ? Math.round((100 * c.activeStudents) / c.students) : 0;
              return (
                <li key={c.classId} className="py-2.5">
                  <div className="flex items-center justify-between gap-3 text-[13.5px]">
                    <span className="font-semibold text-ink-900">{c.className}</span>
                    <span className="text-ink-500">
                      {c.activeStudents} of {c.students} learners
                      {c.averageScore != null ? ` · average ${c.averageScore}%` : ""}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#EDF2F9]">
                    <div className="h-full rounded-full bg-brand-600" style={{ width: `${share}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          {data && data.classes.length === 0 && <p className="text-[13px] text-ink-500">No classes yet.</p>}
        </Panel>

        <Panel icon={Cube} title="Latest runs" meta="The most recent activities learners played">
          <ul className="divide-y divide-line">
            {(data?.recentRuns ?? []).map((run, i) => (
              <li key={`${run.playedAt}-${i}`} className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink-900">{run.studentName}</span>
                  <span className="block truncate text-[12.5px] text-ink-500">
                    {run.activityTitle}
                    {run.className ? ` · ${run.className}` : ""} · {formatRelative(run.playedAt)}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold text-ink-900">{run.scorePercent != null ? `${run.scorePercent}%` : "—"}</span>
                  <span className="block text-[12px] text-ink-500">{STATUS_WORD[run.status] ?? run.status}</span>
                </span>
              </li>
            ))}
          </ul>
          {data && data.recentRuns.length === 0 && (
            <p className="text-[13px] text-ink-500">No learner has played an activity yet. Runs appear here as they happen.</p>
          )}
        </Panel>
      </div>

      <Panel className="mt-4" title="Recent changes" meta="What staff changed at your school" action={<PanelLink href="/head/logs">View all</PanelLink>}>
        <ul className="divide-y divide-line">
          {(activity.data?.rows ?? []).map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]">
              <span className="min-w-0">
                <span className="block font-semibold text-ink-900">{row.actionLabel}</span>
                <span className="block truncate text-[12.5px] text-ink-500">
                  {row.detail} · {row.actorName ?? "System"}
                </span>
              </span>
              <span className="shrink-0 text-[12.5px] text-ink-500">{formatRelative(row.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </ConsolePage>
  );
}
