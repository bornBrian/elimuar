"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Plus } from "@phosphor-icons/react";
import { platformAcademicSchema, type AcademicClass, type AcademicSubject } from "@elimuar/shared";
import {
  Btn,
  ConsolePage,
  EmptyRow,
  Panel,
  RowMenu,
  SearchInput,
  Skeleton,
  Status,
  Tabs,
  useDebounced,
} from "@/components/console/kit";
import { toast } from "@/components/toast";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

const TABS = [
  { key: "classes", label: "Classes" },
  { key: "subjects", label: "Subjects" },
];

const writeSchema = z.object({ id: z.string().uuid() }).passthrough();

function plural(value: number, singular: string, pluralForm?: string): string {
  return `${value.toLocaleString("en-GB")} ${value === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

export default function AcademicStructurePage() {
  const { data, loading, error, reload } = useApi("/api/platform/console/academic", platformAcademicSchema);
  const [tab, setTab] = useState("classes");
  const [search, setSearch] = useState("");
  const query = useDebounced(search);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested && TABS.some((entry) => entry.key === requested)) setTab(requested);
  }, []);

  const classes = data?.classes ?? [];
  const subjects = data?.subjects ?? [];
  const term = query.trim().toLowerCase();

  const filteredClasses = useMemo(
    () => (term ? classes.filter((row) => row.name.toLowerCase().includes(term)) : classes),
    [classes, term]
  );

  const filteredSubjects = useMemo(
    () =>
      term
        ? subjects.filter(
            (row) => row.name.toLowerCase().includes(term) || (row.code ?? "").toLowerCase().includes(term)
          )
        : subjects,
    [subjects, term]
  );

  async function setStatus(register: "classes" | "subjects", id: string, status: "active" | "archived", name: string) {
    setBusy(id);
    setActionError(null);
    try {
      await api(`/api/platform/console/academic/${register}/${id}`, writeSchema, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast.success(`${name} ${status === "archived" ? "retired" : "restored"}.`);
      reload();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : `Could not update ${name}.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <ConsolePage
      crumbs={[{ label: "Academic Structure" }]}
      title="Academic Structure"
      actions={
        <>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={tab === "classes" ? "Search class..." : "Search subject..."}
            className="w-full sm:w-[240px]"
          />
          <Btn href="/admin/academic/new" variant="primary">
            <Plus size={15} weight="bold" aria-hidden />
            Add Class / Subject
          </Btn>
        </>
      }
    >
      {(error || actionError) && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
        >
          {actionError ?? error}
        </p>
      )}

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === "classes" ? (
        <div className="mt-4 space-y-4">
          <Panel
            title="Classes"
            meta={`${plural(classes.length, "class", "classes")} in the register`}
            padded={false}
          >
            <div className="table-scroll">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="console-thead">
                    <th className="console-th">Class</th>
                    <th className="console-th">Practicals</th>
                    <th className="console-th">Students</th>
                    <th className="console-th">Status</th>
                    <th className="console-th w-[120px] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading &&
                    Array.from({ length: 4 }).map((_, index) => (
                      <tr key={index} className="console-row" aria-hidden>
                        {Array.from({ length: 5 }).map((__, cell) => (
                          <td key={cell} className="console-cell">
                            <Skeleton className="h-4 w-20" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  {!loading &&
                    filteredClasses.map((row: AcademicClass) => (
                      <tr key={row.id} className="console-row">
                        <td className="console-cell font-medium">{row.name}</td>
                        <td className="console-cell num">{row.lessonCount}</td>
                        <td className="console-cell num">{row.studentCount}</td>
                        <td className="console-cell">
                          <Status value={row.status} />
                        </td>
                        <td className="console-cell text-right">
                          <RowMenu
                            ariaLabel={`Actions for ${row.name}`}
                            items={[
                              {
                                label: row.status === "active" ? "Retire this class" : "Restore this class",
                                onSelect: () =>
                                  void setStatus(
                                    "classes",
                                    row.id,
                                    row.status === "active" ? "archived" : "active",
                                    row.name
                                  ),
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  {!loading && filteredClasses.length === 0 && (
                    <EmptyRow colSpan={5} message="No class matches that search." />
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <Panel title="Subjects" meta={`${plural(subjects.length, "subject")} in the register`} padded={false}>
            <div className="table-scroll">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="console-thead">
                    <th className="console-th">Subject</th>
                    <th className="console-th">Code</th>
                    <th className="console-th">Practicals</th>
                    <th className="console-th">Status</th>
                    <th className="console-th w-[120px] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading &&
                    Array.from({ length: 5 }).map((_, index) => (
                      <tr key={index} className="console-row" aria-hidden>
                        {Array.from({ length: 5 }).map((__, cell) => (
                          <td key={cell} className="console-cell">
                            <Skeleton className="h-4 w-20" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  {!loading &&
                    filteredSubjects.map((row: AcademicSubject) => (
                      <tr key={row.id} className="console-row">
                        <td className="console-cell font-medium">{row.name}</td>
                        <td className="console-cell">{row.code ?? <span className="text-ink-500">—</span>}</td>
                        <td className="console-cell num">{row.lessonCount}</td>
                        <td className="console-cell">
                          <Status value={row.status} />
                        </td>
                        <td className="console-cell text-right">
                          <RowMenu
                            ariaLabel={`Actions for ${row.name}`}
                            items={[
                              {
                                label: row.status === "active" ? "Retire this subject" : "Restore this subject",
                                onSelect: () =>
                                  void setStatus(
                                    "subjects",
                                    row.id,
                                    row.status === "active" ? "archived" : "active",
                                    row.name
                                  ),
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  {!loading && filteredSubjects.length === 0 && (
                    <EmptyRow colSpan={5} message="No subject matches that search." />
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

        </div>
      )}

      {busy && <span className="sr-only">Updating the register…</span>}
    </ConsolePage>
  );
}
