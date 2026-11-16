"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { classSchema, schoolSubjectsResponseSchema, teachingAssignmentSchema } from "@elimuar/shared";
import { Btn, Select } from "@/components/console/kit";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

/** In Teachers → Manage: what this teacher teaches, as subject + class, and a way to add one. */

const mutationResultSchema = z.object({ id: z.string().optional() }).passthrough();

export function TeachingPanel({ schoolId, teacherId, role }: { schoolId: string; teacherId: string; role: string }) {
  const classes = useApi(`/api/schools/${schoolId}/classes`, classSchema.array(), [schoolId]);
  const subjects = useApi(`/api/schools/${schoolId}/subjects`, schoolSubjectsResponseSchema, [schoolId]);
  const assignments = useApi(`/api/schools/${schoolId}/teaching-assignments`, teachingAssignmentSchema.array(), [schoolId]);

  const mine = useMemo(() => (assignments.data ?? []).filter((row) => row.teacherId === teacherId), [assignments.data, teacherId]);
  const [classId, setClassId] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The subjects the chosen class studies, other than those this teacher already teaches there.
  const offered = (subjects.data?.subjects ?? [])
    .filter((s) => s.classes.some((c) => c.classId === classId))
    .map((s) => ({ name: s.name, current: s.classes.find((c) => c.classId === classId)?.teacherName ?? null }))
    .filter((s) => !mine.some((m) => m.classId === classId && m.subject === s.name));

  async function add() {
    if (!classId || !subject) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/teachers/assignments", mutationResultSchema, {
        method: "POST",
        body: JSON.stringify({ teacherId, classId, subject }),
      });
      assignments.reload();
      subjects.reload();
      setSubject("");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(assignmentId: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/teachers/assignments/${assignmentId}`, mutationResultSchema, { method: "DELETE" });
      assignments.reload();
      subjects.reload();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not remove that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t border-line pt-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Teaches</p>
      <div className="mt-3 space-y-2">
        {error && <p className="rounded-xl border border-danger-200 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">{error}</p>}

        {assignments.loading ? (
          <p className="text-[13px] text-ink-500">Loading…</p>
        ) : mine.length === 0 ? (
          <p className="text-[13px] text-ink-500">
            {role === "teacher" ? "Nothing yet. Their app shows no classes until they teach a subject." : "Not teaching."}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {mine.map((row) => (
              <li key={row.assignmentId} className="flex items-center justify-between gap-3 py-2 first:pt-0">
                <span className="text-[13.5px]">
                  <span className="font-semibold text-ink-800">{row.subject}</span>
                  <span className="text-ink-500"> · {row.className}</span>
                </span>
                <Btn size="sm" loading={busy} onClick={() => void remove(row.assignmentId)}>
                  Remove
                </Btn>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
          <Select
            value={classId}
            onChange={(value) => {
              setClassId(value);
              setSubject("");
            }}
            ariaLabel="Class"
            options={[
              { value: "", label: "Class…" },
              ...(classes.data ?? []).filter((c) => c.status === "active").map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Select
            value={subject}
            onChange={setSubject}
            ariaLabel="Subject"
            options={[
              { value: "", label: classId ? "Subject…" : "Choose a class first" },
              ...offered.map((s) => ({ value: s.name, label: s.current ? `${s.name} (now ${s.current})` : s.name })),
            ]}
          />
          <Btn variant="primary" loading={busy} disabled={!classId || !subject} onClick={() => void add()}>
            Add
          </Btn>
        </div>
      </div>
    </section>
  );
}
