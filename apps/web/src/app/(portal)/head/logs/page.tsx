"use client";

import { useMemo, useState } from "react";
import { Scroll } from "@phosphor-icons/react";
import { platformLogPageSchema } from "@elimuar/shared";
import {
  ConsolePage,
  EmptyRow,
  Panel,
  Pagination,
  SearchInput,
  Select,
  Skeleton,
  useDebounced,
} from "@/components/console/kit";
import { useSchoolScope } from "@/lib/scope";
import { useApi } from "@/lib/useApi";

const PERIODS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "0", label: "All time" },
];

const DATES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function stampParts(value: string): { date: string; time: string } {
  const at = new Date(value);
  return {
    date: `${at.getDate()} ${DATES[at.getMonth()]}`,
    time: `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`,
  };
}

const ROLE_TITLE: Record<string, string> = {
  platform_admin: "Platform Admin",
  school_admin: "School Head",
  academic_master: "Academic Master",
  secretary: "Secretary",
  teacher: "Teacher",
  student: "Student",
};

export default function HeadActivityLogsPage() {
  const scope = useSchoolScope();
  const schoolId = scope.schoolId;

  const [days, setDays] = useState("30");
  const [action, setAction] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const query = useDebounced(search);
  const pageSize = 10;

  const path = useMemo(() => {
    if (!schoolId) return null;
    const parts = [`page=${page}`, `pageSize=${pageSize}`, `action=${encodeURIComponent(action)}`];
    if (query.trim()) parts.push(`q=${encodeURIComponent(query.trim())}`);
    if (days !== "0") {
      parts.push(`from=${new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString()}`);
    }
    if (scope.isOverride) parts.push(`schoolId=${encodeURIComponent(schoolId)}`);
    return `/api/schools/${schoolId}/activity?${parts.join("&")}`;
  }, [schoolId, page, action, query, days, scope.isOverride]);

  const { data, loading, error } = useApi(path, platformLogPageSchema, [path]);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <ConsolePage
      crumbs={[{ label: "Activity Logs" }]}
      title="Activity Logs"
      subtitle="Who changed what at your school, newest first."
      actions={
        <>
          <Select
            value={days}
            onChange={(value) => {
              setPage(1);
              setDays(value);
            }}
            options={PERIODS}
            ariaLabel="Reporting period"
            className="w-[164px]"
          />
          <Select
            value={action}
            onChange={(value) => {
              setPage(1);
              setAction(value);
            }}
            options={[
              { value: "all", label: "All activities" },
              ...(data?.actions ?? []).map((row) => ({ value: row.key, label: row.label })),
            ]}
            ariaLabel="Activity"
            className="w-[210px]"
          />
          <SearchInput
            value={search}
            onChange={(value) => {
              setPage(1);
              setSearch(value);
            }}
            placeholder="Search activity"
            className="w-full sm:w-[200px]"
          />
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {error}
        </p>
      )}

      <Panel icon={Scroll} meta="Every action that changes who can reach what" padded={false}>
        <div className="table-scroll">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="console-thead">
                <th className="console-th">Date &amp; time</th>
                <th className="console-th">Who</th>
                <th className="console-th">Action</th>
                <th className="console-th">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: pageSize }).map((_, index) => (
                  <tr key={`skeleton-${index}`} aria-hidden className="console-row">
                    {Array.from({ length: 4 }).map((__, cell) => (
                      <td key={cell} className="console-cell">
                        <Skeleton className="h-4 w-24" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!loading &&
                rows.map((row) => {
                  const parts = stampParts(row.createdAt);
                  return (
                    <tr key={row.id} className="console-row">
                      <td className="console-cell whitespace-nowrap font-medium text-ink-800">
                        {parts.date}, {parts.time}
                      </td>
                      <td className="console-cell">
                        {row.actorName ? (
                          <>
                            <span className="block font-medium text-ink-800">{row.actorName}</span>
                            <span className="block text-[12px] text-ink-500">
                              {row.actorRole ? ROLE_TITLE[row.actorRole] ?? row.actorRole : "Unknown role"}
                            </span>
                          </>
                        ) : (
                          <span className="text-ink-500">System</span>
                        )}
                      </td>
                      <td className="console-cell font-medium">{row.actionLabel}</td>
                      <td className="console-cell">
                        <span className="block truncate">{row.detail}</span>
                      </td>
                    </tr>
                  );
                })}

              {!loading && rows.length === 0 && (
                <EmptyRow
                  colSpan={4}
                  message={
                    query.trim() || action !== "all"
                      ? "No entry matches those filters. Clear the search or widen the period."
                      : "Nothing has been recorded yet."
                  }
                />
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="border-t border-line">
            <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} label="Showing" />
          </div>
        )}
      </Panel>

      <p className="mt-3 text-[12.5px] text-ink-500">
        This is your school&apos;s own record. The platform keeps the same entries for its own console, so what you read
        here is what the ministry sees about your school — never another school&apos;s business.
      </p>
    </ConsolePage>
  );
}
