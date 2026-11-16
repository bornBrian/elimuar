"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "@/lib/navigation";
import { z } from "zod";
import {
  Buildings,
  Eye,
  Gear,
  Monitor,
  Plus,
  ShieldCheck,
  ShieldSlash,
  UserGear,
} from "@phosphor-icons/react";
import { platformSchoolListSchema } from "@elimuar/shared";
import {
  Btn,
  CheckBox,
  ConsolePage,
  EmptyRow,
  IconTile,
  Panel,
  Pagination,
  RowMenu,
  SearchInput,
  Select,
  Skeleton,
  Status,
  useDebounced,
} from "@/components/console/kit";
import { toast } from "@/components/toast";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { formatDateTime, formatRelative } from "@/lib/format";

const mutationSchema = z.object({ id: z.string().uuid().optional() }).passthrough();

const STATUS_OPTIONS = [
  { value: "all", label: "All status" },
  { value: "active", label: "Active" },
  { value: "suspended", label: "Inactive" },
  { value: "pending", label: "Pending setup" },
];

export default function SchoolsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [page, setPage] = useState(1);

  const query = useDebounced(search);
  const { data, loading, error, reload } = useApi("/api/platform/console/schools", platformSchoolListSchema);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (data?.rows ?? []).filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (!term) return true;
      return (
        row.name.toLowerCase().includes(term) ||
        row.code.toLowerCase().includes(term) ||
        row.regionName.toLowerCase().includes(term) ||
        row.districtName.toLowerCase().includes(term) ||
        (row.headName ?? "").toLowerCase().includes(term)
      );
    });
  }, [data, query, status]);

  const pageSize = 8;
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);

  async function setSchoolStatus(schoolId: string, next: "active" | "suspended") {
    setBusyId(schoolId);
    try {
      await api(`/api/schools/${schoolId}`, mutationSchema, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      toast.success(next === "active" ? "School reactivated." : "School suspended. Everyone at it is signed out.");
      reload();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "Could not change that school's status.");
    } finally {
      setBusyId(null);
    }
  }

  async function bulkStatus(next: "active" | "suspended") {
    const targets = rows.filter((row) => selected.includes(row.id));
    const alreadyThere = targets.filter((row) => row.status === next);
    const actionable = targets.filter((row) => row.status !== next);

    if (actionable.length === 0) {
      toast.info(next === "active" ? "Those schools are already active." : "Those schools are already suspended.");
      setSelected([]);
      return;
    }

    setBulkBusy(true);
    const results = await Promise.allSettled(
      actionable.map((row) =>
        api(`/api/schools/${row.id}`, mutationSchema, { method: "PATCH", body: JSON.stringify({ status: next }) })
      )
    );

    const failed = results.filter((result) => result.status === "rejected").length;
    const done = actionable.length - failed;

    if (failed === 0) {
      toast.success(`${done} ${done === 1 ? "school" : "schools"} ${next === "active" ? "reactivated" : "suspended"}.`);
    } else {
      toast.error(`${done} updated, ${failed} could not be.`);
    }
    if (alreadyThere.length > 0) toast.info(`${alreadyThere.length} already ${next === "active" ? "active" : "suspended"}.`);

    setSelected([]);
    setBulkBusy(false);
    reload();
  }

  const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.includes(row.id));

  return (
    <ConsolePage
      crumbs={[{ label: "Schools" }]}
      title="Schools"
      subtitle="Manage schools, school heads and platform access."
      actions={
        <>
          <SearchInput value={search} onChange={setSearch} placeholder="Search schools..." className="w-full sm:w-[224px]" />
          <Select
            value={status}
            onChange={(value) => {
              setPage(1);
              setStatus(value);
            }}
            options={STATUS_OPTIONS}
            ariaLabel="Filter by status"
            className="w-[150px]"
          />
          <Btn href="/admin/schools/new" variant="primary">
            <Plus size={16} weight="bold" aria-hidden />
            Add school
          </Btn>
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {error}
        </p>
      )}

      <Panel
        icon={Buildings}
        title={
          loading || !data ? (
            <Skeleton className="h-5 w-28" />
          ) : (
            `${data.total} ${data.total === 1 ? "school" : "schools"}`
          )
        }
        meta={
          loading || !data ? (
            <Skeleton className="mt-1 h-4 w-56" />
          ) : (
            <>
              {data.active} active
              {" · "}
              {data.inactive} inactive
              {" · "}
              {data.pendingSetup} pending setup
            </>
          )
        }
        padded={false}
      >
        <div className="table-scroll border-t border-line">
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className="console-thead">
                <th className="console-th w-[44px] px-4">
                  <CheckBox
                    checked={allVisibleSelected}
                    ariaLabel="Select every school on this page"
                    onChange={(checked) =>
                      setSelected(checked ? [...new Set([...selected, ...visible.map((row) => row.id)])] : [])
                    }
                  />
                </th>
                <th className="console-th">School</th>
                <th className="console-th">Location</th>
                <th className="console-th">School head</th>
                <th className="console-th">Students</th>
                <th className="console-th">Teachers</th>
                <th className="console-th">Status</th>
                <th className="console-th">Last activity</th>
                <th className="console-th w-[64px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} aria-hidden className="console-row">
                    {Array.from({ length: 9 }).map((__, cell) => (
                      <td key={cell} className="console-cell">
                        <Skeleton className="h-4 w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              )}

              {!loading &&
                visible.map((row) => (
                  <tr key={row.id} className="console-row">
                    <td className="console-cell px-4">
                      <CheckBox
                        checked={selected.includes(row.id)}
                        ariaLabel={`Select ${row.name}`}
                        onChange={(checked) =>
                          setSelected((current) =>
                            checked ? [...new Set([...current, row.id])] : current.filter((id) => id !== row.id)
                          )
                        }
                      />
                    </td>
                    <td className="console-cell">
                      <Link href={`/admin/schools/${row.id}`} className="group block min-w-0">
                        <span className="block truncate text-[14px] font-semibold text-ink-800 group-hover:text-brand-600">
                          {row.name}
                        </span>
                        <span className="block text-[12px] text-ink-500">{row.code}</span>
                      </Link>
                    </td>
                    <td className="console-cell">
                      <span className="block truncate">{row.regionName}</span>
                      <span className="block text-[12px] text-ink-500">{row.districtName}</span>
                    </td>
                    <td className="console-cell">
                      {row.headName ? (
                        <span className="block truncate">{row.headName}</span>
                      ) : (
                        <span className="text-[13px] text-ink-500">Pending setup</span>
                      )}
                    </td>
                    <td className="console-cell num">{row.studentCount}</td>
                    <td className="console-cell num">{row.teacherCount}</td>
                    <td className="console-cell">
                      <Status value={row.status} />
                    </td>
                    <td className="console-cell">
                      {row.lastActivityAt ? (
                        <span title={formatDateTime(row.lastActivityAt)}>{formatRelative(row.lastActivityAt)}</span>
                      ) : (
                        <span className="text-ink-500">No activity yet</span>
                      )}
                    </td>
                    <td className="console-cell text-right">
                      <RowMenu
                        ariaLabel={`Actions for ${row.name}`}
                        items={[
                          {
                            label: "Open school",
                            icon: Eye,
                            onSelect: () => router.push(`/admin/schools/${row.id}`),
                          },
                          {
                            label: "See its people",
                            icon: UserGear,
                            onSelect: () => router.push(`/admin/users?schoolId=${row.id}`),
                          },
                          row.status === "suspended"
                            ? {
                                label: busyId === row.id ? "Reactivating…" : "Reactivate",
                                icon: ShieldCheck,
                                onSelect: () => void setSchoolStatus(row.id, "active"),
                              }
                            : {
                                label: busyId === row.id ? "Suspending…" : "Suspend",
                                icon: ShieldSlash,
                                tone: "danger" as const,
                                onSelect: () => void setSchoolStatus(row.id, "suspended"),
                              },
                        ]}
                      />
                    </td>
                  </tr>
                ))}

              {!loading && visible.length === 0 && (
                <EmptyRow
                  colSpan={9}
                  message={
                    rows.length === 0 && (query.trim() || status !== "all")
                      ? "No school matches that search or filter."
                      : "No schools are registered yet."
                  }
                />
              )}
            </tbody>
          </table>
        </div>

        {rows.length > pageSize && (
          <div className="border-t border-line">
            <Pagination page={page} pageSize={pageSize} total={rows.length} onChange={setPage} label="Showing" />
          </div>
        )}
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel icon={UserGear} title="School heads">
          <Link
            href="/admin/users?role=school_admin"
            className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-[13.5px] font-medium text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-700"
          >
            <UserGear size={16} weight="bold" aria-hidden />
            Manage heads
          </Link>
          <p className="mt-1 text-[12.5px] leading-5 text-ink-500">
            Every school on the platform is already in the list above. Add another with the button in the header.
          </p>
        </Panel>

        <Panel icon={Monitor} title="Work space">
          <p className="text-[13.5px] leading-6 text-ink-500">
            Change the platform logo, and keep the class and subject registers every school teaches from.
          </p>
          <Link
            href="/admin/settings"
            className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand-600 hover:text-brand-700"
          >
            Open platform settings
            <span aria-hidden>→</span>
          </Link>
        </Panel>

        <Panel icon={Gear} title="Recent updates" action={<Link href="/admin/logs" className="text-[13px] font-semibold text-brand-600 hover:text-brand-700">View all</Link>}>
          {loading || !data ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : data.recent.length === 0 ? (
            <p className="text-[13.5px] text-ink-500">No changes have been recorded yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.recent.slice(0, 3).map((row) => (
                <li key={row.id} className="py-2.5">
                  <p className="text-[13.5px] font-medium text-ink-700">
                    {row.title} <span className="text-ink-500">· {row.detail}</span>
                  </p>
                  <p className="mt-0.5 text-[12px] text-ink-500">{formatDateTime(row.at)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {selected.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-20 flex justify-center px-4">
          <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-white px-4 py-2.5 shadow-[0_20px_45px_-25px_rgba(10,33,56,0.5)]">
            <span className="text-[13px] font-semibold text-ink-800">
              {selected.length} {selected.length === 1 ? "school" : "schools"} selected
            </span>
            <span aria-hidden className="h-4 w-px bg-line" />
            <Btn size="sm" disabled={bulkBusy} onClick={() => void bulkStatus("active")}>
              <ShieldCheck size={14} weight="bold" aria-hidden />
              Reactivate
            </Btn>
            <Btn size="sm" disabled={bulkBusy} onClick={() => void bulkStatus("suspended")}>
              <ShieldSlash size={14} weight="bold" aria-hidden />
              Suspend
            </Btn>
            <span aria-hidden className="h-4 w-px bg-line" />
            <button
              type="button"
              onClick={() => setSelected([])}
              className="text-[13px] font-semibold text-brand-600 hover:text-brand-700"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </ConsolePage>
  );
}
