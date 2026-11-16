"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Plus } from "@phosphor-icons/react";
import {
  DEFAULT_GRADE_LEVELS,
  classSchema,
  enrolledStudentSchema,
  memberSchema,
  schoolSubjectsResponseSchema,
  type ClassSubject,
  type SchoolSubject,
} from "@elimuar/shared";
import {
  Btn,
  CheckBox,
  ConsolePage,
  ConsoleTable,
  Dialog,
  Field,
  Note,
  Panel,
  SearchInput,
  Segmented,
  Select,
  Tabs,
} from "@/components/console/kit";
import { toast } from "@/components/toast";
import { ApiError, api } from "@/lib/api";
import { useSchoolScope } from "@/lib/scope";
import { useApi } from "@/lib/useApi";

/** Classes & Subjects. */

type Tab = "classes" | "subjects";

function failMessage(cause: unknown, fallback: string) {
  return cause instanceof ApiError ? cause.message : fallback;
}

export default function ClassesAndSubjectsPage() {
  const scope = useSchoolScope();
  const schoolId = scope.schoolId;
  const [tab, setTab] = useState<Tab>("classes");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const asked = new URLSearchParams(window.location.search).get("tab");
    if (asked === "subjects") setTab("subjects");
  }, []);

  const classes = useApi(schoolId ? `/api/schools/${schoolId}/classes` : null, classSchema.array(), [schoolId]);
  const subjects = useApi(schoolId ? `/api/schools/${schoolId}/subjects` : null, schoolSubjectsResponseSchema, [schoolId]);
  const students = useApi(schoolId ? `/api/schools/${schoolId}/students` : null, enrolledStudentSchema.array(), [schoolId]);
  const members = useApi(schoolId ? `/api/schools/${schoolId}/members` : null, memberSchema.array(), [schoolId]);
  const teachers = useMemo(
    () => (members.data ?? []).filter((m) => m.role === "teacher" && m.status === "active").sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [members.data]
  );

  const [addClass, setAddClass] = useState(false);
  const [addSubject, setAddSubject] = useState(false);
  const [managing, setManaging] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const classRows = (classes.data ?? []).filter((c) => c.status === "active" && (!needle || c.name.toLowerCase().includes(needle)));
  const subjectRows = (subjects.data?.subjects ?? []).filter((s) => !needle || s.name.toLowerCase().includes(needle));
  const managed = subjects.data?.subjects.find((s) => s.name === managing) ?? null;

  return (
    <ConsolePage
      title="Classes & Subjects"
      subtitle="Your classes, the subjects each one studies, and who teaches them."
      actions={
        <>
          <SearchInput value={query} onChange={setQuery} placeholder={tab === "classes" ? "Search classes…" : "Search subjects…"} className="w-full sm:w-64" />
          {tab === "classes" ? (
            <Btn variant="primary" onClick={() => setAddClass(true)}>
              <Plus size={16} weight="bold" aria-hidden /> Add class
            </Btn>
          ) : (
            <Btn variant="primary" onClick={() => setAddSubject(true)}>
              <Plus size={16} weight="bold" aria-hidden /> Add subject
            </Btn>
          )}
        </>
      }
    >
      <Tabs
        className="mb-5"
        value={tab}
        onChange={(key) => setTab(key as Tab)}
        tabs={[
          { key: "classes", label: "Classes", count: classRows.length },
          { key: "subjects", label: "Subjects", count: subjects.data?.subjects.length },
        ]}
      />

      {tab === "classes" ? (
        <Panel title="Your classes" meta="Each class with its learners and the subjects it studies" padded={false}>
          <ConsoleTable
            loading={classes.loading}
            rows={classRows}
            emptyMessage="No classes yet. Add one to start."
            columns={[
              { key: "name", header: "Class", render: (c) => <span className="font-semibold text-ink-900">{c.name}</span> },
              { key: "students", header: "Students", numeric: true, render: (c) => c.studentCount },
              {
                key: "subjects",
                header: "Subjects",
                numeric: true,
                render: (c) => (
                  <button type="button" className="font-semibold text-brand-600 hover:underline" onClick={() => setTab("subjects")}>
                    {c.subjectCount}
                  </button>
                ),
              },
              {
                key: "teachers",
                header: "Teachers",
                render: (c) => (c.teacherNames.length ? <span className="text-ink-700">{c.teacherNames.join(", ")}</span> : <span className="text-ink-500">None yet</span>),
              },
              { key: "year", header: "Year", render: (c) => c.academicYear },
            ]}
          />
        </Panel>
      ) : (
        <Panel title="Subjects taught" meta="Open a subject to choose its teacher and learners in each class" padded={false}>
          <ConsoleTable
            loading={subjects.loading}
            rows={subjectRows.map((s) => ({ ...s, id: s.name }))}
            emptyMessage="No subjects yet. Add one to start."
            onRowClick={(row) => setManaging(row.name)}
            columns={[
              { key: "name", header: "Subject", render: (s) => <span className="font-semibold text-ink-900">{s.name}</span> },
              {
                key: "classes",
                header: "Taught in",
                render: (s) => <span className="text-ink-700">{s.classes.map((c) => c.className).join(", ")}</span>,
              },
              {
                key: "kind",
                header: "Taken by",
                render: (s) =>
                  s.classes.every((c) => c.allStudents) ? (
                    <span className="text-ink-700">Everyone</span>
                  ) : (
                    <span className="font-semibold text-[#a3600a]">Optional</span>
                  ),
              },
              { key: "learners", header: "Learners", numeric: true, render: (s) => s.studentCount },
              {
                key: "teachers",
                header: "Teachers",
                render: (s) => {
                  const missing = s.classes.filter((c) => !c.teacherId).length;
                  return (
                    <span>
                      <span className="text-ink-700">{s.teacherNames.join(", ") || "—"}</span>
                      {missing > 0 && <span className="ml-2 text-[12px] font-semibold text-danger-600">{missing} without a teacher</span>}
                    </span>
                  );
                },
              },
              { key: "open", header: "", render: () => <Btn size="sm">Manage</Btn> },
            ]}
          />
        </Panel>
      )}

      {addClass && schoolId && (
        <AddClassDialog
          schoolId={schoolId}
          onClose={() => setAddClass(false)}
          onDone={() => {
            setAddClass(false);
            classes.reload();
            subjects.reload();
          }}
        />
      )}
      {addSubject && schoolId && (
        <AddSubjectDialog
          schoolId={schoolId}
          catalogue={subjects.data?.catalogue ?? []}
          taught={(subjects.data?.subjects ?? []).map((s) => s.name)}
          classes={(classes.data ?? []).filter((c) => c.status === "active").map((c) => ({ id: c.id, name: c.name }))}
          onClose={() => setAddSubject(false)}
          onDone={(name) => {
            setAddSubject(false);
            subjects.reload();
            classes.reload();
            setManaging(name);
          }}
        />
      )}
      {managed && (
        <ManageSubjectDialog
          subject={managed}
          teachers={teachers.map((t) => ({ id: t.userId, name: t.fullName }))}
          students={students.data ?? []}
          onClose={() => setManaging(null)}
          onChanged={() => {
            subjects.reload();
            classes.reload();
          }}
        />
      )}
    </ConsolePage>
  );
}

// ---- add a class ------------------------------------------------------------------------

function AddClassDialog({ schoolId, onClose, onDone }: { schoolId: string; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState(DEFAULT_GRADE_LEVELS[0]);
  const [stream, setStream] = useState("A");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [busy, setBusy] = useState(false);
  const name = stream.trim() && stream.trim().toUpperCase() !== "A" ? `${form} ${stream.trim().toUpperCase()}` : form;

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/schools/${schoolId}/classes`, z.object({ id: z.string() }).passthrough(), {
        method: "POST",
        body: JSON.stringify({ name, gradeLevel: form, stream: stream.trim().toUpperCase() || null, academicYear: year.trim() }),
      });
      toast.success(`${name} added. It studies every subject your school teaches to whole classes.`);
      onDone();
    } catch (cause) {
      toast.error(failMessage(cause, "The class could not be added."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      title="Add a class"
      description="A class is a form and stream, for example Form 1 or Form 1 B."
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" loading={busy} onClick={save}>
            Add {name}
          </Btn>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Form">
          <Select value={form} onChange={setForm} ariaLabel="Form" options={DEFAULT_GRADE_LEVELS.map((f) => ({ value: f, label: f }))} />
        </Field>
        <Field label="Stream">
          <input className="console-input" value={stream} maxLength={3} onChange={(e) => setStream(e.target.value)} />
        </Field>
        <Field label="Year">
          <input className="console-input" value={year} maxLength={9} onChange={(e) => setYear(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

// ---- add a subject ----------------------------------------------------------------------

function AddSubjectDialog({
  schoolId,
  catalogue,
  taught,
  classes,
  onClose,
  onDone,
}: {
  schoolId: string;
  catalogue: string[];
  taught: string[];
  classes: Array<{ id: string; name: string }>;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const choices = catalogue.filter((name) => !taught.includes(name));
  const [name, setName] = useState(choices[0] ?? "");
  const [where, setWhere] = useState<"all" | "some">("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [who, setWho] = useState<"everyone" | "chosen">("everyone");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const classIds = where === "all" ? classes.map((c) => c.id) : picked;
    if (!name.trim()) return toast.warning("Name the subject.");
    if (classIds.length === 0) return toast.warning("Choose at least one class.");
    setBusy(true);
    try {
      await api(`/api/schools/${schoolId}/subjects`, schoolSubjectsResponseSchema, {
        method: "POST",
        body: JSON.stringify({ subject: name.trim(), classIds, allStudents: who === "everyone" }),
      });
      toast.success(
        who === "everyone"
          ? `${name.trim()} added. Now choose its teacher in each class.`
          : `${name.trim()} added as optional. Now choose its teacher and learners in each class.`
      );
      onDone(name.trim());
    } catch (cause) {
      toast.error(failMessage(cause, "The subject could not be added."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      width="lg"
      title="Add a subject"
      description="Pick a subject (or type a new one), the classes it is taught in, and who takes it."
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" loading={busy} onClick={save}>
            Add subject
          </Btn>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Subject">
          <input className="console-input" list="subject-catalogue" value={name} onChange={(e) => setName(e.target.value)} placeholder="For example Biology" />
          <datalist id="subject-catalogue">
            {choices.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        <div>
          <p className="console-label">Taught in</p>
          <Segmented
            value={where}
            onChange={setWhere}
            options={[
              { value: "all", label: "The whole school" },
              { value: "some", label: "Chosen classes" },
            ]}
          />
          {where === "some" && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {classes.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13.5px]">
                  <CheckBox
                    ariaLabel={c.name}
                    checked={picked.includes(c.id)}
                    onChange={(on) => setPicked((list) => (on ? [...list, c.id] : list.filter((id) => id !== c.id)))}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="console-label">Taken by</p>
          <Segmented
            value={who}
            onChange={setWho}
            options={[
              { value: "everyone", label: "Everyone in the class" },
              { value: "chosen", label: "Chosen learners (optional subject)" },
            ]}
          />
          {who === "chosen" && <Note>After adding it, open the subject to tick the learners who take it in each class.</Note>}
        </div>
      </div>
    </Dialog>
  );
}

// ---- manage a subject: teacher and learners in each class ----------------------------

function ManageSubjectDialog({
  subject,
  teachers,
  students,
  onClose,
  onChanged,
}: {
  subject: SchoolSubject;
  teachers: Array<{ id: string; name: string }>;
  students: Array<{ studentId: string; fullName: string; studentIdentifier: string | null; classId: string; status: string }>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const patch = async (row: ClassSubject, body: Record<string, unknown>, done: string) => {
    try {
      await api(`/api/class-subjects/${row.id}`, schoolSubjectsResponseSchema, { method: "PATCH", body: JSON.stringify(body) });
      toast.success(done);
      onChanged();
    } catch (cause) {
      toast.error(failMessage(cause, "That change could not be saved."));
    }
  };

  const remove = async (row: ClassSubject) => {
    if (!window.confirm(`Stop teaching ${subject.name} in ${row.className}?`)) return;
    try {
      await api(`/api/class-subjects/${row.id}`, schoolSubjectsResponseSchema, { method: "DELETE" });
      toast.success(`${subject.name} is no longer taught in ${row.className}.`);
      onChanged();
    } catch (cause) {
      toast.error(failMessage(cause, "That change could not be saved."));
    }
  };

  return (
    <Dialog open width="lg" title={subject.name} description="Choose the teacher in each class, and who takes the subject." onClose={onClose}>
      <ul className="divide-y divide-line">
        {subject.classes.map((row) => {
          const roll = students.filter((s) => s.classId === row.classId && s.status === "active");
          return (
            <li key={row.id} className="py-3.5">
              <div className="grid items-center gap-3 sm:grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <span className="text-[14px] font-bold text-ink-900">{row.className}</span>
                <Select
                  ariaLabel={`Teacher of ${subject.name} in ${row.className}`}
                  value={row.teacherId ?? ""}
                  onChange={(teacherId) =>
                    patch(row, { teacherId: teacherId || null }, teacherId ? `Teacher set for ${row.className}.` : `${row.className} has no teacher now.`)
                  }
                  options={[{ value: "", label: "No teacher yet" }, ...teachers.map((t) => ({ value: t.id, label: t.name }))]}
                />
                <Select
                  ariaLabel={`Who takes ${subject.name} in ${row.className}`}
                  value={row.allStudents ? "all" : "chosen"}
                  onChange={(value) => {
                    if (value === "chosen") setOpen(row.id);
                    patch(
                      row,
                      { allStudents: value === "all" },
                      value === "all" ? `Everyone in ${row.className} takes ${subject.name}.` : `Now tick who takes it in ${row.className}.`
                    );
                  }}
                  options={[
                    { value: "all", label: `Everyone (${row.classSize})` },
                    { value: "chosen", label: `Chosen learners (${row.allStudents ? "none yet" : `${row.studentCount} of ${row.classSize}`})` },
                  ]}
                />
                <span className="flex items-center gap-2">
                  {!row.allStudents && (
                    <Btn size="sm" onClick={() => setOpen(open === row.id ? null : row.id)}>
                      {open === row.id ? "Done" : "Learners"}
                    </Btn>
                  )}
                  <Btn size="sm" variant="danger" onClick={() => remove(row)}>
                    Remove
                  </Btn>
                </span>
              </div>
              {open === row.id && !row.allStudents && (
                <LearnerPicker
                  roll={roll}
                  chosen={row.studentIds}
                  onSave={(ids) => patch(row, { studentIds: ids }, `${ids.length} learner${ids.length === 1 ? "" : "s"} take ${subject.name} in ${row.className}.`)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

function LearnerPicker({
  roll,
  chosen,
  onSave,
}: {
  roll: Array<{ studentId: string; fullName: string; studentIdentifier: string | null }>;
  chosen: string[];
  onSave: (ids: string[]) => void;
}) {
  const [ids, setIds] = useState<string[]>(chosen);
  const all = roll.length > 0 && ids.length === roll.length;
  return (
    <div className="mt-3 rounded-xl border border-line bg-[#F7FAFE] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[13px] font-semibold text-ink-700">
          <CheckBox ariaLabel="Tick everyone" checked={all} onChange={(on) => setIds(on ? roll.map((s) => s.studentId) : [])} />
          Everyone ({roll.length})
        </label>
        <Btn size="sm" variant="primary" onClick={() => onSave(ids)}>
          Save {ids.length} learner{ids.length === 1 ? "" : "s"}
        </Btn>
      </div>
      <div className="grid max-h-56 gap-1.5 overflow-y-auto sm:grid-cols-2">
        {roll.map((s) => (
          <label key={s.studentId} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-[13px]">
            <CheckBox
              ariaLabel={s.fullName}
              checked={ids.includes(s.studentId)}
              onChange={(on) => setIds((list) => (on ? [...list, s.studentId] : list.filter((id) => id !== s.studentId)))}
            />
            <span className="truncate text-ink-900">{s.fullName}</span>
            <span className="ml-auto shrink-0 font-mono text-[11.5px] text-ink-500">{s.studentIdentifier}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
