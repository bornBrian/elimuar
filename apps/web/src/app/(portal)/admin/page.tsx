"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BoundingBox,
  BookBookmark,
  Buildings,
  CaretRight,
  CubeTransparent,
  GraduationCap,
  User,
  Users,
  Warning,
} from "@phosphor-icons/react";
import { platformDashboardSchema } from "@elimuar/shared";
import {
  ActivityChart,
  ConsolePage,
  IconTile,
  MiniStat,
  Panel,
  PanelLink,
  RankedList,
  Skeleton,
  StatCard,
} from "@/components/console/kit";
import { useApi } from "@/lib/useApi";
import { getUser } from "@/lib/session";

function claimedCaption(group: { total: number; pending: number }) {
  const activated = group.total - group.pending;
  if (group.pending === 0) return <>All {activated} activated</>;
  return (
    <>
      {activated} of {group.total} activated · {group.pending} pending
    </>
  );
}

const PERIODS = [
  { key: "7", label: "7D" },
  { key: "30", label: "30D" },
  { key: "90", label: "90D" },
  { key: "365", label: "12M" },
];

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function PlatformOverviewPage() {
  const [days, setDays] = useState("30");
  const { data, loading, error } = useApi(`/api/platform/console/dashboard?days=${days}`, platformDashboardSchema, [days]);
  const user = getUser();

  const rangeLabel = days === "365" ? "Last 12 months" : `Last ${days} days`;

  return (
    <ConsolePage
      lead={`${greeting()}${user ? `, ${user.firstName}` : ""}`}
      title="Platform Overview"
      subtitle="Here's what's happening across your ElimuAR platform today."
    >
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {loading || !data ? (
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="console-card px-5 py-4">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="mt-3 h-7 w-16" />
              <Skeleton className="mt-2 h-4 w-32" />
            </div>
          ))
        ) : (
          <>
            <StatCard
              icon={Buildings}
              label="Schools"
              value={data.schools.total}
              trend={data.trends.schools}
              caption={
                <>
                  {data.schools.active} active
                  {data.schools.suspended > 0 && (
                    <>
                      {" · "}
                      {data.schools.suspended} suspended
                    </>
                  )}
                  {data.schools.pending > 0 && (
                    <>
                      {" · "}
                      {data.schools.pending} pending
                    </>
                  )}
                </>
              }
            />
            <StatCard
              icon={GraduationCap}
              label="Students"
              value={data.students.total}
              trend={data.trends.students}
              caption={claimedCaption(data.students)}
            />
            <StatCard
              icon={User}
              label="Teachers"
              value={data.teachers.total}
              trend={data.trends.teachers}
              caption={claimedCaption(data.teachers)}
            />
            <StatCard
              icon={CubeTransparent}
              label="AR Practicals"
              value={data.content.total}
              trend={data.trends.content}
              caption={
                <>
                  {data.content.published} published
                  {data.content.draft + data.content.needsReview > 0 && (
                    <>
                      {" · "}
                      {data.content.draft + data.content.needsReview} not published
                    </>
                  )}
                </>
              }
            />
          </>
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)]">
        <Panel
          title="Platform activity"
          meta="User engagement and learning activity across the platform."
          bodyClassName="pt-1"
          action={
            <div className="flex items-center gap-1 rounded-lg bg-[#F4F8FE] p-0.5">
              {PERIODS.map((period) => (
                <button
                  key={period.key}
                  type="button"
                  aria-pressed={days === period.key}
                  onClick={() => setDays(period.key)}
                  className={`h-7 rounded-md px-2.5 text-[12.5px] font-semibold transition-colors ${
                    days === period.key ? "bg-brand-600 text-white" : "text-ink-500 hover:text-ink-800"
                  }`}
                >
                  {period.label}
                </button>
              ))}
            </div>
          }
        >
          {loading || !data ? (
            <div className="px-1 py-4">
              <Skeleton className="h-[240px] w-full" />
            </div>
          ) : (
            <ActivityChart labels={data.activityLabels} series={data.activity} />
          )}
        </Panel>

        <Panel
          icon={Warning}
          title="Needs attention"
          action={<PanelLink href="/admin/schools">View all</PanelLink>}
          padded={false}
        >
          {loading || !data ? (
            <div className="space-y-3 px-5 pb-5">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : data.needsAttention.length === 0 ? (
            <p className="px-5 pb-5 text-[13.5px] text-ink-500">
              Nothing is waiting on the platform team right now.
            </p>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {data.needsAttention.map((item) => (
                <li key={item.id}>
                  <Link href={item.href} className="flex items-center gap-3.5 px-5 py-4 transition-colors hover:bg-[#F8FBFF]">
                    <span className="w-3 shrink-0 text-[19px] font-bold leading-6 text-ink-900">{item.count}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink-800">{item.title}</span>
                      <span className="block truncate text-[12px] text-ink-500">{item.detail}</span>
                    </span>
                    <CaretRight size={16} weight="bold" aria-hidden className="shrink-0 text-[#b9c8da]" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Panel
          icon={Users}
          title="Onboarding status"
          action={<PanelLink href="/admin/users">View all</PanelLink>}
          padded={false}
        >
          {loading || !data ? (
            <div className="space-y-3 px-5 pb-5">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-11 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {data.onboarding.map((row) => (
                <li key={row.key} className="flex items-center gap-3.5 px-5 py-3.5">
                  <IconTile icon={row.key === "students" ? GraduationCap : User} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink-800">{row.label}</span>
                    <span className="block text-[12px] text-ink-500">
                      {row.activated} / {row.total} activated
                    </span>
                  </span>
                  {row.pending > 0 ? (
                    <span className="shrink-0 text-[12.5px] font-semibold text-[#a3600a]">{row.pending} pending</span>
                  ) : (
                    <span className="shrink-0 text-[12.5px] font-semibold text-[#0f7a3d]">All activated</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          icon={BoundingBox}
          title="Content overview"
          action={<PanelLink href="/admin/registry">View all</PanelLink>}
        >
          {loading || !data ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2">
                <MiniStat label="Total" value={data.content.total} />
                <MiniStat label="Published" value={data.content.published} />
                <MiniStat label="Draft" value={data.content.draft} />
                <MiniStat
                  label="Needs review"
                  value={data.content.needsReview}
                  tone={data.content.needsReview > 0 ? "warning" : "default"}
                />
              </div>
              <h3 className="mt-5 text-[13px] font-semibold text-ink-800">By subject</h3>
              <div className="mt-1">
                <RankedList
                  rows={data.bySubject.map((row) => ({ label: row.subject, value: row.count }))}
                  emptyLabel="No practicals published yet."
                />
              </div>
            </>
          )}
        </Panel>

        <Panel
          icon={BookBookmark}
          title="Academic structure"
          action={<PanelLink href="/admin/academic">Manage</PanelLink>}
        >
          {loading || !data ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/admin/academic?tab=classes"
                  className="group flex items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-brand-50"
                >
                  <IconTile icon={Buildings} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-[11.5px] font-medium text-ink-500">Classes</span>
                    <span className="block text-[22px] font-bold leading-7 text-ink-900 group-hover:text-brand-700">
                      {data.academic.classes}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-500">{data.academic.formsCovered}</span>
                  </span>
                </Link>
                <Link
                  href="/admin/academic?tab=subjects"
                  className="group flex items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-brand-50"
                >
                  <IconTile icon={BookBookmark} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-[11.5px] font-medium text-ink-500">Subjects</span>
                    <span className="block text-[22px] font-bold leading-7 text-ink-900 group-hover:text-brand-700">
                      {data.academic.subjects}
                    </span>
                    <span className="block truncate text-[11.5px] text-ink-500">{data.academic.formsCovered}</span>
                  </span>
                </Link>
              </div>
              <h3 className="mt-5 text-[13px] font-semibold text-ink-800">Top subjects by engagement</h3>
              <div className="mt-1">
                <RankedList
                  rows={data.academic.topSubjects.map((row) => ({ label: row.subject, value: row.value }))}
                  emptyLabel={`No practice sessions in the ${rangeLabel.toLowerCase()}.`}
                />
              </div>
            </>
          )}
        </Panel>
      </div>
    </ConsolePage>
  );
}
