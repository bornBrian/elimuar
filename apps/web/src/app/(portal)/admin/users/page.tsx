"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "@/lib/navigation";
import { z } from "zod";
import { DownloadSimple, UserCheck, UserPlus, Users as UsersIcon, UserMinus, X } from "@phosphor-icons/react";
import { platformSchoolListSchema, platformUserListSchema, type PlatformSchool } from "@elimuar/shared";
import {
  Btn,
  CheckBox,
  ConsolePage,
  EmptyRow,
  Pagination,
  Panel,
  RoleLabel,
  RowMenu,
  SearchInput,
  Segmented,
  Select,
  Skeleton,
  Status,
  Tabs,
  useDebounced,
} from "@/components/console/kit";
import { toast } from "@/components/toast";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { downloadRows } from "@/lib/spreadsheet";
import { formatRelative } from "@/lib/format";

const TABS = [
  { key: "all", label: "All" },
  { key: "school_admin", label: "School Heads" },
  { key: "teacher", label: "Teachers" },
  { key: "student", label: "Students" },
];

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function UsersPage() {
  const router = useRouter();
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [schoolFilter, setSchoolFilter] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSchoolFilter(params.get("schoolId"));
    const role = params.get("role");
    if (role && TABS.some((entry) => entry.key === role)) setTab(role);
  }, []);

  const query = useDebounced(search);
  const path = useMemo(() => {
    const parts = [`role=${tab === "all" ? "all" : tab}`];
    if (query.trim()) parts.push(`q=${encodeURIComponent(query.trim())}`);
    return `/api/platform/console/users?${parts.join("&")}`;
  }, [tab, query]);

  const { data, loading, error, reload } = useApi(path, platformUserListSchema, [path]);

  const rows = useMemo(() => {
    const list = data?.rows ?? [];
    if (!schoolFilter) return list;
    return list.filter((row) => row.schoolId === schoolFilter);
  }, [data, schoolFilter]);

  useEffect(() => {
    if (!schoolFilter || schoolName) return;
    const match = (data?.rows ?? []).find((row) => row.schoolId === schoolFilter && row.schoolName);
    if (match?.schoolName) setSchoolName(match.schoolName);
  }, [data, schoolFilter, schoolName]);

  const pageSize = 8;
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);
  const allSelected = visible.length > 0 && visible.every((row) => selected.includes(row.membershipId));

  const counts = data?.counts;
  const tabs = TABS.map((entry) => ({
    ...entry,
    count:
      counts === undefined
        ? undefined
        : entry.key === "all"
          ? counts.all
          : entry.key === "school_admin"
            ? counts.schoolHead
            : entry.key === "teacher"
              ? counts.teacher
              : counts.student,
  }));

  function exportRows() {
    if (rows.length === 0) {
      toast.error("There is nothing in this view to export.");
      return;
    }
    void downloadRows(
      "elimuar-users.xlsx",
      "Users",
      rows.map((row) => ({
        Name: row.fullName,
        "Email / admission no.": row.role === "student" ? row.admissionNumber ?? "" : row.email,
        School: row.schoolName ?? "Platform",
        Class: row.className ?? "",
        Role: row.role,
        Status: row.awaitingRegistration ? "Invited" : row.status,
        "Last active": row.lastLoginAt ? new Date(row.lastLoginAt).toISOString().slice(0, 19).replace("T", " ") : "",
      })),
      [
        `Exported ${new Date().toISOString().slice(0, 19).replace("T", " ")}.`,
        `Filter: ${tab === "all" ? "all roles" : tab}${query.trim() ? `, search “${query.trim()}”` : ""}.`,
        "One row per membership: a person who has moved schools appears once per school.",
      ]
    );
    toast.success(`${rows.length} ${rows.length === 1 ? "row" : "rows"} exported.`);
  }

  async function bulkStatus(status: "active" | "suspended") {
    const targets = rows.filter((row) => selected.includes(row.membershipId));
    const actionable = targets.filter((row) => row.schoolId !== null);

    if (actionable.length === 0) {
      toast.error("Platform staff have no school, so their membership is not managed here.");
      return;
    }

    setBulkBusy(true);
    const results = await Promise.allSettled(
      actionable.map((row) =>
        api(`/api/schools/${row.schoolId}/members/${row.membershipId}`, z.object({}).passthrough(), {
          method: "PATCH",
          body: JSON.stringify({ status }),
        })
      )
    );

    const failed = results.filter((result) => result.status === "rejected").length;
    const done = actionable.length - failed;
    const skipped = targets.length - actionable.length;

    if (failed === 0) {
      toast.success(
        `${done} ${done === 1 ? "membership" : "memberships"} ${status === "active" ? "activated" : "suspended"}.`
      );
    } else {
      toast.error(`${done} updated, ${failed} could not be.`);
    }
    if (skipped > 0) toast.info(`${skipped} platform account(s) were left alone.`);

    setSelected([]);
    setBulkBusy(false);
    reload();
  }

  return (
    <ConsolePage
      crumbs={[{ label: "Users" }]}
      title="Users"
      subtitle="Manage all platform users and their roles."
      actions={
        <>
          <SearchInput value={search} onChange={setSearch} placeholder="Search users..." className="w-full sm:w-[220px]" />
          <Btn onClick={exportRows}>
            <DownloadSimple size={15} weight="bold" aria-hidden />
            Export
          </Btn>
          <Btn variant="primary" onClick={() => setAddOpen(true)}>
            <UserPlus size={15} weight="bold" aria-hidden />
            Add user
          </Btn>
        </>
      }
    >
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {error}
        </p>
      )}

      {schoolFilter && (
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-600">
            School: <span className="font-semibold text-ink-800">{schoolName ?? "…"}</span>
            <button
              type="button"
              aria-label="Clear the school filter"
              onClick={() => {
                setSchoolFilter(null);
                setSchoolName(null);
                router.replace("/admin/users");
              }}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50 hover:text-ink-800"
            >
              <X size={13} weight="bold" aria-hidden />
            </button>
          </span>
        </div>
      )}

      <Tabs
        tabs={tabs}
        value={tab}
        onChange={(key) => {
          setPage(1);
          setTab(key);
        }}
      />

      <Panel icon={UsersIcon} className="mt-0 rounded-t-none" padded={false}>
        <div className="table-scroll">
          <table className="w-full min-w-[980px]">
            <thead>
              <tr className="console-thead">
                <th className="console-th w-[44px] px-4">
                  <CheckBox
                    checked={allSelected}
                    ariaLabel="Select every user on this page"
                    onChange={(checked) =>
                      setSelected(checked ? [...new Set([...selected, ...visible.map((row) => row.membershipId)])] : [])
                    }
                  />
                </th>
                <th className="console-th">Name</th>
                <th className="console-th">Email / admission no.</th>
                <th className="console-th">School / Class</th>
                <th className="console-th">Role</th>
                <th className="console-th">Status</th>
                <th className="console-th">Last active</th>
                <th className="console-th w-[64px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} aria-hidden className="console-row">
                    {Array.from({ length: 8 }).map((__, cell) => (
                      <td key={cell} className="console-cell">
                        <Skeleton className="h-4 w-24" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!loading &&
                visible.map((row) => (
                  <tr key={row.membershipId} className="console-row">
                    <td className="console-cell px-4">
                      <CheckBox
                        checked={selected.includes(row.membershipId)}
                        ariaLabel={`Select ${row.fullName}`}
                        onChange={(checked) =>
                          setSelected((current) =>
                            checked ? [...new Set([...current, row.membershipId])] : current.filter((id) => id !== row.membershipId)
                          )
                        }
                      />
                    </td>
                    <td className="console-cell">
                      <span className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold text-white"
                          style={{ background: "linear-gradient(140deg, #7FB6F7 0%, #2F7BF6 100%)" }}
                        >
                          {initialsOf(row.fullName)}
                        </span>
                        <span className="min-w-0 truncate font-semibold text-ink-800">{row.fullName}</span>
                      </span>
                    </td>
                    <td className="console-cell text-ink-600">
                      {row.role === "student" ? <span className="font-mono text-[12.5px]">{row.admissionNumber ?? "—"}</span> : row.email}
                    </td>
                    <td className="console-cell">
                      {row.className ? (
                        <span className="block truncate">{row.className}</span>
                      ) : row.schoolName ? (
                        <Link
                          href={`/admin/schools/${row.schoolId}`}
                          className="block truncate hover:text-brand-600 hover:underline"
                        >
                          {row.schoolName}
                        </Link>
                      ) : (
                        <span className="text-ink-500">Platform staff</span>
                      )}
                    </td>
                    <td className="console-cell">
                      <RoleLabel role={row.role} />
                    </td>
                    <td className="console-cell">
                      {row.awaitingRegistration ? (
                        <span className="console-status console-status-pending">Invited</span>
                      ) : (
                        <Status value={row.status} />
                      )}
                    </td>
                    <td className="console-cell">
                      {row.lastLoginAt ? formatRelative(row.lastLoginAt) : <span className="text-ink-500">Never</span>}
                    </td>
                    <td className="console-cell text-right">
                      <RowMenu
                        ariaLabel={`Actions for ${row.fullName}`}
                        items={[
                          ...(row.schoolId
                            ? [
                                {
                                  label: "Open their school",
                                  onSelect: () => router.push(`/admin/schools/${row.schoolId}`),
                                },
                              ]
                            : []),
                          {
                            label: "Filter by this role",
                            onSelect: () => {
                              setPage(1);
                              setTab(row.role === "school_admin" || row.role === "teacher" || row.role === "student" ? row.role : "all");
                            },
                          },
                          ...(row.role === "student"
                            ? []
                            : [
                                {
                                  label: "Copy email address",
                                  onSelect: () => {
                                    void navigator.clipboard
                                      .writeText(row.email)
                                      .then(() => toast.success("Email address copied."))
                                      .catch(() => toast.error("The clipboard is not available here."));
                                  },
                                },
                              ]),
                        ]}
                      />
                    </td>
                  </tr>
                ))}

              {!loading && visible.length === 0 && (
                <EmptyRow
                  colSpan={8}
                  message={
                    query.trim()
                      ? "No user matches that search."
                      : tab === "all"
                        ? "No users are registered on the platform yet."
                        : `No ${TABS.find((entry) => entry.key === tab)?.label.toLowerCase()} yet.`
                  }
                />
              )}
            </tbody>
          </table>
        </div>

        {rows.length > 0 && (
          <div className="border-t border-line">
            <Pagination page={page} pageSize={pageSize} total={rows.length} onChange={setPage} label="Showing" />
          </div>
        )}
      </Panel>

      {selected.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-20 flex justify-center px-4">
          <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-white px-4 py-2.5 shadow-[0_20px_45px_-25px_rgba(10,33,56,0.5)]">
            <span className="text-[13px] font-semibold text-ink-800">
              {selected.length} {selected.length === 1 ? "person" : "people"} selected
            </span>
            <span aria-hidden className="h-4 w-px bg-line" />
            <Btn size="sm" disabled={bulkBusy} onClick={() => void bulkStatus("active")}>
              <UserCheck size={14} weight="bold" aria-hidden />
              Activate
            </Btn>
            <Btn size="sm" disabled={bulkBusy} onClick={() => void bulkStatus("suspended")}>
              <UserMinus size={14} weight="bold" aria-hidden />
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

      {addOpen && (
        <AddUserDialog
          onClose={() => setAddOpen(false)}
          onDone={() => {
            setAddOpen(false);
            reload();
          }}
        />
      )}
    </ConsolePage>
  );
}

const STAFF_ROLES = [
  { value: "teacher", label: "Teacher" },
  { value: "academic_master", label: "Academic master" },
  { value: "secretary", label: "Secretary" },
] as const;

const membershipResultSchema = z.object({}).passthrough();

interface BatchRow {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

function parseBatch(text: string): { rows: BatchRow[]; bad: string[] } {
  const rows: BatchRow[] = [];
  const bad: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const [firstName, lastName, email, rawRole] = trimmed.split(",").map((part) => part.trim());
    const role = (rawRole ? rawRole.replace(/[\s-]+/g, "_").toLowerCase() : "teacher") || "teacher";
    const roleKnown = STAFF_ROLES.some((entry) => entry.value === role);

    if (!firstName || !lastName || !email?.includes("@") || !roleKnown) {
      bad.push(trimmed);
      continue;
    }
    rows.push({ firstName, lastName, email, role });
  }

  return { rows, bad };
}

function AddUserDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"one" | "list">("one");
  const [schoolId, setSchoolId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<string>("teacher");
  const [batch, setBatch] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const schools = useApi("/api/platform/console/schools", platformSchoolListSchema, []);
  const schoolOptions = useMemo(
    () => (schools.data?.rows ?? []).map((row) => ({ value: row.id, label: `${row.name} · ${row.districtName}` })),
    [schools.data]
  );

  useEffect(() => {
    if (!schoolId && schoolOptions.length > 0) setSchoolId(schoolOptions[0].value);
  }, [schoolId, schoolOptions]);

  const parsed = useMemo(() => parseBatch(batch), [batch]);
  const oneReady = firstName.trim().length > 1 && lastName.trim().length > 1 && email.includes("@");
  const canSave = schoolId !== "" && (mode === "one" ? oneReady : parsed.rows.length > 0);

  async function invite(row: BatchRow) {
    return api(`/api/schools/${schoolId}/members`, membershipResultSchema, {
      method: "POST",
      body: JSON.stringify({
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        role: row.role,
        ...(mode === "one" && phone.trim() ? { phone: phone.trim() } : {}),
      }),
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;

    setBusy(true);
    setErrorMessage(null);

    try {
      if (mode === "one") {
        const row: BatchRow = { firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), role };
        await invite(row);
        toast.success(`${row.firstName} ${row.lastName} added and invited.`);
        onDone();
        return;
      }

      const results = await Promise.allSettled(parsed.rows.map((row) => invite(row)));
      const rejected = results.filter((result) => result.status === "rejected") as PromiseRejectedResult[];
      const done = parsed.rows.length - rejected.length;

      if (rejected.length === 0) {
        toast.success(`${done} ${done === 1 ? "person" : "people"} added and invited.`);
      } else {
        const first = rejected[0].reason;
        toast.error(`${done} added, ${rejected.length} could not be — ${first instanceof ApiError ? first.message : "check the list."}`);
      }
      if (parsed.bad.length > 0) {
        toast.info(`${parsed.bad.length} line(s) skipped: each needs first, last and an email address.`);
      }
      onDone();
    } catch (cause) {
      setErrorMessage(cause instanceof ApiError ? cause.message : "That person could not be added.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/45 p-4 sm:py-10">
      <div className="w-full max-w-[640px] rounded-2xl border border-line bg-white shadow-[0_30px_70px_-30px_rgba(10,33,56,0.55)]">
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold text-ink-900">Add a user</h2>
            <p className="mt-0.5 text-[13px] leading-5 text-ink-500">
              Staff join one school at a time. The person is invited by email to set their own password — no password is
              chosen for them here.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50"
          >
            <X size={16} weight="bold" aria-hidden />
          </button>
        </header>

        <form onSubmit={submit} className="px-6 py-5">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "one", label: "One person" },
              { value: "list", label: "Paste a list" },
            ]}
          />

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="console-label">School *</span>
              <Select
                value={schoolId}
                onChange={setSchoolId}
                ariaLabel="School"
                options={
                  schoolOptions.length > 0 ? schoolOptions : [{ value: "", label: schools.loading ? "Loading schools…" : "No schools yet" }]
                }
              />
            </label>

            {mode === "one" ? (
              <>
                <label className="block">
                  <span className="console-label">First name *</span>
                  <input
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="e.g. Neema"
                    className="console-input"
                    required
                  />
                </label>

                <label className="block">
                  <span className="console-label">Last name *</span>
                  <input
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    placeholder="e.g. Mwakalinga"
                    className="console-input"
                    required
                  />
                </label>

                <label className="block">
                  <span className="console-label">Email *</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@school.ac.tz"
                    className="console-input"
                    required
                  />
                </label>

                <label className="block">
                  <span className="console-label">Phone</span>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+255 7xx xxx xxx"
                    className="console-input"
                  />
                </label>

                <label className="block sm:col-span-2">
                  <span className="console-label">Role *</span>
                  <Select value={role} onChange={setRole} ariaLabel="Role" options={[...STAFF_ROLES]} />
                </label>
              </>
            ) : (
              <label className="block sm:col-span-2">
                <span className="console-label">One person per line *</span>
                <textarea
                  value={batch}
                  onChange={(event) => setBatch(event.target.value)}
                  rows={8}
                  spellCheck={false}
                  placeholder={"first name, last name, email, role\nNeema, Mwakalinga, neema@school.ac.tz, teacher"}
                  className="console-input font-mono text-[12.5px] leading-5"
                />
                <span className="mt-1.5 block text-[12.5px] text-ink-500">
                  Columns are <span className="font-mono">first, last, email, role</span>. Role is optional and defaults to
                  teacher — the other choices are academic_master and secretary.
                  {batch.trim() !== "" && (
                    <> {parsed.rows.length} ready{parsed.bad.length > 0 ? `, ${parsed.bad.length} to fix` : ""}.</>
                  )}
                </span>
              </label>
            )}
          </div>

          {errorMessage && (
            <p role="alert" className="mt-4 rounded-xl border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-[12.5px] text-danger-700">
              {errorMessage}
            </p>
          )}

          <div className="mt-4">
          </div>

          <div className="mt-5 flex items-center justify-end gap-2.5">
            <Btn onClick={onClose} disabled={busy}>
              Cancel
            </Btn>
            <Btn type="submit" variant="primary" loading={busy} disabled={!canSave}>
              <UserPlus size={15} weight="bold" aria-hidden />
              {mode === "one" ? "Add user" : `Add ${parsed.rows.length || ""} people`.trim()}
            </Btn>
          </div>
        </form>
      </div>
    </div>
  );
}
