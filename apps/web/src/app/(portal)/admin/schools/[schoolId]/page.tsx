"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { z } from "zod";
import {
  BoundingBox,
  BookOpen,
  CalendarCheck,
  ChartLineUp,
  Check,
  ClipboardText,
  GraduationCap,
  PencilSimple,
  Phone,
  ShieldCheck,
  ShieldSlash,
  User,
  X,
} from "@phosphor-icons/react";
import { platformSchoolDetailSchema } from "@elimuar/shared";
import {
  Btn,
  ConsolePage,
  EmptyRow,
  IconTile,
  Panel,
  RowMenu,
  Skeleton,
  Status,
  Tabs,
} from "@/components/console/kit";
import { toast } from "@/components/toast";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { formatDateTime, formatRelative } from "@/lib/format";

const mutationSchema = z.object({ id: z.string().uuid().optional() }).passthrough();

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "classes", label: "Classes" },
  { key: "teachers", label: "Teachers" },
  { key: "students", label: "Students" },
];

const ROLE_TITLE: Record<string, string> = {
  school_admin: "School head",
  academic_master: "Academic master",
  secretary: "Secretary",
  teacher: "Teacher",
  student: "Student",
};

export default function SchoolRecordPage() {
  const params = useParams<{ schoolId: string }>();
  const schoolId = params.schoolId;
  const { data, loading, error, reload } = useApi(
    schoolId ? `/api/platform/console/schools/${schoolId}` : null,
    platformSchoolDetailSchema,
    [schoolId]
  );

  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [nextStatus, setNextStatus] = useState("active");
  const [busy, setBusy] = useState(false);

  const school = data?.school;

  const teachers = useMemo(() => (data?.members ?? []).filter((row) => row.role !== "student"), [data]);
  const students = useMemo(() => (data?.members ?? []).filter((row) => row.role === "student"), [data]);

  const byForm = useMemo(() => {
    const map = new Map<string, { classes: number; students: number }>();
    for (const row of data?.classes ?? []) {
      const entry = map.get(row.gradeLevel) ?? { classes: 0, students: 0 };
      entry.classes += 1;
      entry.students += row.studentCount;
      map.set(row.gradeLevel, entry);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([gradeLevel, entry]) => ({ gradeLevel, ...entry }));
  }, [data]);

  async function saveStatus() {
    if (!schoolId) return;
    setBusy(true);
    try {
      await api(`/api/schools/${schoolId}`, mutationSchema, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      toast.success(
        nextStatus === "active" ? "School reactivated." : `Status set to ${nextStatus}. Sessions at this school are closed.`
      );
      setEditing(false);
      reload();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "Could not change the status.");
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <ConsolePage crumbs={[{ label: "Schools", href: "/admin/schools" }, { label: "School" }]} title="School">
        <p role="alert" className="rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {error}
        </p>
      </ConsolePage>
    );
  }

  return (
    <ConsolePage
      crumbs={[
        { label: "Schools", href: "/admin/schools" },
        ...(school ? [{ label: school.name }] : [{ label: "School" }]),
      ]}
      title={school?.name ?? "Loading school…"}
      subtitle={school ? `${school.code} · ${school.regionName}` : undefined}
      actions={
        school && (
          <>
            <Btn onClick={() => {
              setNextStatus(school.status);
              setEditing((current) => !current);
            }}>
              <PencilSimple size={15} weight="bold" aria-hidden />
              Edit
            </Btn>
            <Btn href={`/admin/users?schoolId=${school.id}`}>
              <Phone size={15} weight="bold" aria-hidden />
              Directory
            </Btn>
            <RowMenu
              ariaLabel={`Actions for ${school.name}`}
              items={[
                school.status === "suspended"
                  ? {
                      label: "Reactivate school",
                      icon: ShieldCheck,
                      onSelect: () => {
                        setNextStatus("active");
                        void api(`/api/schools/${schoolId}`, mutationSchema, {
                          method: "PATCH",
                          body: JSON.stringify({ status: "active" }),
                        })
                          .then(() => {
                            toast.success("School reactivated.");
                            reload();
                          })
                          .catch((cause) =>
                            toast.error(cause instanceof ApiError ? cause.message : "Could not reactivate the school.")
                          );
                      },
                    }
                  : {
                      label: "Suspend school",
                      icon: ShieldSlash,
                      tone: "danger" as const,
                      onSelect: () => {
                        setNextStatus("suspended");
                        void api(`/api/schools/${schoolId}`, mutationSchema, {
                          method: "PATCH",
                          body: JSON.stringify({ status: "suspended" }),
                        })
                          .then(() => {
                            toast.success("School suspended. Everyone at it is signed out.");
                            reload();
                          })
                          .catch((cause) =>
                            toast.error(cause instanceof ApiError ? cause.message : "Could not suspend the school.")
                          );
                      },
                    },
              ]}
            />
          </>
        )
      }
    >
      {school && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Status value={school.status} />
          <span className="text-[13px] text-ink-500">{school.level === "primary" ? "Primary school" : "Secondary school"}</span>

          {editing && (
            <span className="flex flex-wrap items-center gap-2 rounded-xl border border-[#DCE6F5] bg-white px-2.5 py-1.5">
              <select
                value={nextStatus}
                onChange={(event) => setNextStatus(event.target.value)}
                aria-label="School status"
                className="console-input h-8 w-[150px] text-[13px]"
              >
                <option value="active">Active</option>
                <option value="pending">Pending setup</option>
                <option value="suspended">Suspended</option>
              </select>
              <Btn size="sm" variant="primary" loading={busy} onClick={() => void saveStatus()}>
                <Check size={14} weight="bold" aria-hidden />
                Save
              </Btn>
              <button
                type="button"
                aria-label="Cancel"
                onClick={() => setEditing(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-500 hover:bg-brand-50"
              >
                <X size={15} weight="bold" aria-hidden />
              </button>
            </span>
          )}
        </div>
      )}

      <div className="console-card grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[
          {
            icon: GraduationCap,
            label: "Students",
            value: school?.studentCount,
            detail: `${school?.classCount ?? 0} ${school?.classCount === 1 ? "class" : "classes"}`,
          },
          { icon: User, label: "Teachers", value: school?.teacherCount, detail: "On the active roll" },
          {
            icon: CalendarCheck,
            label: "Last activity",
            value: school?.lastActivityAt ? formatDateTime(school.lastActivityAt) : "No activity yet",
            detail: school?.lastActivityAt ? formatRelative(school.lastActivityAt) : "Nobody has signed in",
            wide: true,
          },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3.5 px-5 py-4">
            <IconTile icon={item.icon} />
            <div className="min-w-0">
              <p className={`truncate font-bold text-ink-900 ${item.wide ? "text-[19px]" : "text-[24px]"}`}>
                {loading || item.value === undefined ? <Skeleton className="h-6 w-16" /> : item.value}
              </p>
              <p className="text-[12.5px] text-ink-500">
                {item.label}
                {item.detail ? ` · ${item.detail}` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="min-w-0">
          {tab === "overview" && (
            <div className="space-y-4">
              <Panel icon={ChartLineUp} title="Roll by form" padded={false}>
                {loading || !data ? (
                  <div className="space-y-3 p-5">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={index} className="h-10 w-full" />
                    ))}
                  </div>
                ) : byForm.length === 0 ? (
                  <p className="px-5 pb-5 text-[13.5px] text-ink-500">This school has no classes yet.</p>
                ) : (
                  <ul className="divide-y divide-line border-t border-line">
                    {byForm.map((row) => (
                      <li key={row.gradeLevel} className="flex items-center gap-4 px-5 py-3.5">
                        <span className="w-[74px] shrink-0 text-[13.5px] font-semibold text-ink-800">
                          {row.gradeLevel}
                        </span>
                        <span className="text-[13px] text-ink-500">
                          {row.classes} {row.classes === 1 ? "class" : "classes"}
                        </span>
                        <span className="ml-auto num text-[13.5px] font-semibold text-ink-900">
                          {row.students} students
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel icon={ClipboardText} title="Recent activity" padded={false}>
                {loading || !data ? (
                  <div className="space-y-3 p-5">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <Skeleton key={index} className="h-10 w-full" />
                    ))}
                  </div>
                ) : data.recent.length === 0 ? (
                  <p className="px-5 pb-5 text-[13.5px] text-ink-500">Nothing has been recorded for this school yet.</p>
                ) : (
                  <ul className="divide-y divide-line border-t border-line">
                    {data.recent.map((row) => (
                      <li key={row.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-medium text-ink-800">{row.title}</p>
                          <p className="truncate text-[12px] text-ink-500">{row.detail}</p>
                        </div>
                        <span className="shrink-0 text-[12px] text-ink-500">{formatDateTime(row.at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          )}

          {tab === "classes" && (
            <Panel icon={BookOpen} title="Classes" padded={false}>
              <div className="table-scroll border-t border-line">
                <table className="w-full min-w-[680px]">
                  <thead>
                    <tr className="console-thead">
                      <th className="console-th">Class</th>
                      <th className="console-th">Year</th>
                      <th className="console-th">Subjects</th>
                      <th className="console-th">Teachers</th>
                      <th className="console-th">Students</th>
                      <th className="console-th">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr className="console-row" aria-hidden>
                        {Array.from({ length: 6 }).map((_, index) => (
                          <td key={index} className="console-cell">
                            <Skeleton className="h-4 w-20" />
                          </td>
                        ))}
                      </tr>
                    )}
                    {!loading &&
                      (data?.classes ?? []).map((row) => (
                        <tr key={row.id} className="console-row">
                          <td className="console-cell font-medium">{row.name}</td>
                          <td className="console-cell">{row.academicYear}</td>
                          <td className="console-cell num">{row.subjectCount}</td>
                          <td className="console-cell">
                            {row.teacherNames.length > 0 ? row.teacherNames.join(", ") : (
                              <span className="text-ink-500">Nobody assigned</span>
                            )}
                          </td>
                          <td className="console-cell num">{row.studentCount}</td>
                          <td className="console-cell">
                            <Status value={row.status} />
                          </td>
                        </tr>
                      ))}
                    {!loading && (data?.classes ?? []).length === 0 && (
                      <EmptyRow colSpan={6} message="This school has no classes yet." />
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          {(tab === "teachers" || tab === "students") && (
            <Panel
              icon={tab === "teachers" ? User : GraduationCap}
              title={tab === "teachers" ? "Staff and teachers" : "Students"}
              padded={false}
            >
              <div className="table-scroll border-t border-line">
                <table className="w-full min-w-[660px]">
                  <thead>
                    <tr className="console-thead">
                      <th className="console-th">Name</th>
                      <th className="console-th">Email</th>
                      <th className="console-th">Role</th>
                      <th className="console-th">Status</th>
                      <th className="console-th">Last active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && (
                      <tr className="console-row" aria-hidden>
                        {Array.from({ length: 5 }).map((_, index) => (
                          <td key={index} className="console-cell">
                            <Skeleton className="h-4 w-20" />
                          </td>
                        ))}
                      </tr>
                    )}
                    {!loading &&
                      (tab === "teachers" ? teachers : students).map((row) => (
                        <tr key={row.membershipId} className="console-row">
                          <td className="console-cell font-medium">{row.fullName}</td>
                          <td className="console-cell text-ink-600">{row.email}</td>
                          <td className="console-cell">{ROLE_TITLE[row.role] ?? row.role}</td>
                          <td className="console-cell">
                            {row.claimedAt ? (
                              <Status value={row.status} />
                            ) : (
                              <span className="console-status console-status-pending">Invited</span>
                            )}
                          </td>
                          <td className="console-cell">
                            {row.lastLoginAt ? formatRelative(row.lastLoginAt) : <span className="text-ink-500">Never</span>}
                          </td>
                        </tr>
                      ))}
                    {!loading && (tab === "teachers" ? teachers : students).length === 0 && (
                      <EmptyRow colSpan={5} message={tab === "teachers" ? "No staff on the roll." : "No students on the roll."} />
                    )}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

        </div>

        <div className="space-y-4">
          <Panel icon={ClipboardText} title="School details">
            {loading || !school ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-5 w-full" />
                ))}
              </div>
            ) : (
              <dl className="divide-y divide-line">
                {[
                  { label: "Name", value: school.name },
                  { label: "Code", value: school.code },
                  { label: "Location", value: `${school.regionName} · ${school.districtName}` },
                  { label: "Level", value: school.level === "primary" ? "Primary" : "Secondary" },
                  { label: "Classes", value: String(school.classCount) },
                ].map((row) => (
                  <div key={row.label} className="flex items-baseline justify-between gap-4 py-2.5">
                    <dt className="shrink-0 text-[12.5px] text-ink-500">{row.label}</dt>
                    <dd className="min-w-0 truncate text-right text-[13.5px] font-medium text-ink-800">{row.value}</dd>
                  </div>
                ))}
                <div className="py-2.5">
                  <dt className="text-[12.5px] text-ink-500">School head</dt>
                  <dd className="mt-0.5 text-[13.5px] font-medium text-ink-800">
                    {school.headName ?? <span className="text-ink-500">Nobody appointed yet</span>}
                  </dd>
                  {school.headEmail && <dd className="text-[12.5px] text-ink-500">{school.headEmail}</dd>}
                </div>
              </dl>
            )}
          </Panel>

        </div>
      </div>
    </ConsolePage>
  );
}
