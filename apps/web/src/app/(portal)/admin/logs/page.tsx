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

export default function LogsPage() {
  const [days, setDays] = useState("30");
  const [action, setAction] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const query = useDebounced(search);
  const pageSize = 8;

  const path = useMemo(() => {
    const parts = [`page=${page}`, `pageSize=${pageSize}`];
    parts.push(`action=${encodeURIComponent(action)}`);
    if (query.trim()) parts.push(`q=${encodeURIComponent(query.trim())}`);
    if (days !== "0") {
      const from = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
      parts.push(`from=${from.toISOString()}`);
    }
    return `/api/platform/console/logs?${parts.join("&")}`;
  }, [page, action, query, days]);

  const { data, loading, error } = useApi(path, platformLogPageSchema, [path]);

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <ConsolePage
      crumbs={[{ label: "Logs" }]}
      title="Logs"
      subtitle="View system activities, user actions and important events across the platform."
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
            className="w-[190px]"
          />
          <SearchInput
            value={search}
            onChange={(value) => {
              setPage(1);
              setSearch(value);
            }}
            placeholder="Search logs"
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

      <Panel icon={Scroll} padded={false}>
        <div className="table-scroll">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="console-thead">
                <th className="console-th">Date &amp; Time</th>
                <th className="console-th">User</th>
                <th className="console-th">Action</th>
                <th className="console-th">Details</th>
                <th className="console-th">IP Address</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: pageSize }).map((_, index) => (
                  <tr key={`skeleton-${index}`} aria-hidden className="console-row">
                    {Array.from({ length: 5 }).map((__, cell) => (
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
                      <td className="console-cell">
                        <span
                          className="block font-medium text-ink-800"
                          title={new Date(row.createdAt).toISOString().replace("T", " ").slice(0, 16)}
                        >
                          {parts.date}, {parts.time}
                        </span>
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
                        {row.schoolName && row.schoolName !== row.detail && (
                          <span className="block truncate text-[12px] text-ink-500">{row.schoolName}</span>
                        )}
                      </td>
                      <td className="console-cell text-ink-600">{row.ip ?? "—"}</td>
                    </tr>
                  );
                })}

              {!loading && rows.length === 0 && (
                <EmptyRow
                  colSpan={5}
                  message={
                    query.trim() || action !== "all" || days !== "0"
                      ? "No entry matches those filters. Widen the period or clear the search."
                      : "Nothing has been recorded yet."
                  }
                />
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="border-t border-line">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onChange={setPage}
              label="Showing"
            />
          </div>
        )}
      </Panel>

      <p className="mt-3 text-[12.5px] text-ink-500">
        Every privileged action is written here as it happens, including the address it came from.
      </p>
    </ConsolePage>
  );
}
