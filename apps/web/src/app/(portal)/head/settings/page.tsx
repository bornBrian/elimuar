"use client";

import { useEffect, useState } from "react";
import type { z } from "zod";
import { promoteAcademicYearResultSchema, schoolProfileSchema, updateSchoolSettingsRequestSchema } from "@elimuar/shared";
import { Btn, ConsolePage, Dialog, Field, Note, Panel } from "@/components/console/kit";
import { ApiError, api } from "@/lib/api";
import { useSchoolScope } from "@/lib/scope";
import { useApi } from "@/lib/useApi";
import { toast } from "@/components/toast";

/** School settings: the mastery mark, the reporting window and the PIN new learners start with. */

const DEFAULT_BANDS: Array<{ min: number; label: string }> = [
  { min: 75, label: "A" },
  { min: 65, label: "B" },
  { min: 45, label: "C" },
  { min: 30, label: "D" },
  { min: 0, label: "F" },
];
const byMin = (list: Array<{ min: number; label: string }>) => [...list].sort((a, b) => b.min - a.min);

type Promotion = z.infer<typeof promoteAcademicYearResultSchema>;

export default function SchoolSettingsPage() {
  const scope = useSchoolScope();
  const schoolId = scope.schoolId;
  const canEdit = scope.user?.role === "school_admin" || scope.user?.role === "platform_admin";

  const settings = useApi(schoolId ? `/api/schools/${schoolId}/settings` : null, schoolProfileSchema, [schoolId]);
  const data = settings.data;
  const [mark, setMark] = useState("80");
  const [windowDays, setWindowDays] = useState("7");
  const [defaultPin, setDefaultPin] = useState("");
  const [bands, setBands] = useState(DEFAULT_BANDS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setMark(String(data.masteryThresholdPercent));
    setWindowDays(String(data.engagementWindowDays));
    setDefaultPin(data.defaultPin);
    setBands(byMin(data.gradeBands.length > 0 ? data.gradeBands : DEFAULT_BANDS));
  }, [data]);

  async function save() {
    if (!schoolId) return;
    setSaving(true);
    try {
      await api(`/api/schools/${schoolId}/settings`, schoolProfileSchema, {
        method: "PATCH",
        body: JSON.stringify(
          updateSchoolSettingsRequestSchema.parse({
            masteryThresholdPercent: Number(mark),
            engagementWindowDays: Number(windowDays),
            defaultPin,
            gradeBands: byMin(bands.filter((b) => b.label.trim())),
          })
        ),
      });
      settings.reload();
      toast.success("School settings saved.");
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "Could not save the settings. Check each value is in range.");
    } finally {
      setSaving(false);
    }
  }

  const dirty =
    !!data &&
    (Number(mark) !== data.masteryThresholdPercent ||
      Number(windowDays) !== data.engagementWindowDays ||
      defaultPin !== data.defaultPin ||
      JSON.stringify(bands) !== JSON.stringify(byMin(data.gradeBands.length > 0 ? data.gradeBands : DEFAULT_BANDS)));

  const setBand = (index: number, change: Partial<{ min: number; label: string }>) =>
    setBands((current) => current.map((row, i) => (i === index ? { ...row, ...change } : row)));

  return (
    <ConsolePage
      title="School settings"
      subtitle="How your school's reports mark and grade learners, and the year's change-over."
      actions={
        canEdit ? (
          <Btn variant="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>
            Save changes
          </Btn>
        ) : undefined
      }
    >
      {settings.error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {settings.error}
        </p>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-3">
        <Panel title="Mastery mark" meta="A run scoring this or more counts as mastered">
          <Field label="Percent">
            <input type="number" min={0} max={100} value={mark} disabled={!canEdit} onChange={(e) => setMark(e.target.value)} className="console-input" />
          </Field>
        </Panel>

        <Panel title="Reporting window" meta="The overview counts learners active within these days">
          <Field label="Days (7–90)">
            <input type="number" min={7} max={90} value={windowDays} disabled={!canEdit} onChange={(e) => setWindowDays(e.target.value)} className="console-input" />
          </Field>
        </Panel>

        <Panel title="New learner PIN" meta="The PIN a newly added learner signs in with first">
          <Field label="PIN (4–8 digits; empty: their admission number)">
            <input
              value={defaultPin}
              disabled={!canEdit}
              onChange={(e) => setDefaultPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              className="console-input mono"
            />
          </Field>
        </Panel>

        <Panel title="Grade bands" meta="The letter Reports give a learner's average score" className="xl:col-span-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {bands.map((band, index) => (
              <div key={index} className="flex flex-wrap items-center gap-3">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={band.min}
                  disabled={!canEdit}
                  onChange={(e) => setBand(index, { min: Number(e.target.value) })}
                  onBlur={() => setBands((current) => byMin(current))}
                  className="console-input num w-[92px]"
                  aria-label="Lowest score for this grade"
                />
                <span className="text-[13px] text-ink-500">% and above =</span>
                <input
                  value={band.label}
                  disabled={!canEdit}
                  maxLength={12}
                  onChange={(e) => setBand(index, { label: e.target.value })}
                  className="console-input w-[90px]"
                  aria-label="Grade"
                />
                {canEdit && bands.length > 1 && (
                  <Btn size="sm" onClick={() => setBands((current) => current.filter((_, i) => i !== index))}>
                    Remove
                  </Btn>
                )}
              </div>
            ))}
          </div>
          {canEdit && (
            <Btn className="mt-3" size="sm" disabled={bands.length >= 6} onClick={() => setBands((current) => [...current, { min: 0, label: "" }])}>
              Add grade
            </Btn>
          )}
        </Panel>

        {schoolId && canEdit && <NextYearPanel schoolId={schoolId} />}
      </div>

      {!canEdit && <p className="mt-4 text-[12.5px] text-ink-500">Only the school head can change these.</p>}
    </ConsolePage>
  );
}

/** Moves the school into the next academic year: a preview first, then the move. */
function NextYearPanel({ schoolId }: { schoolId: string }) {
  const [year, setYear] = useState(String(new Date().getFullYear() + 1));
  const [preview, setPreview] = useState<Promotion | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const result = await api(`/api/schools/${schoolId}/academic-year`, promoteAcademicYearResultSchema, {
        method: "POST",
        body: JSON.stringify({ academicYear: year.trim(), preview: dryRun }),
      });
      if (dryRun) setPreview(result);
      else {
        setPreview(null);
        toast.success(`Moved to ${result.academicYear}: ${result.studentsPromoted} learners moved up, ${result.studentsCompleted} completed.`);
      }
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "The year could not be changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Next academic year" meta="Every class moves up a form; Form 4 completes">
      <Field label="New year">
        <input value={year} maxLength={9} onChange={(e) => setYear(e.target.value)} className="console-input" />
      </Field>
      <Btn className="mt-3" loading={busy} onClick={() => run(true)}>
        Preview the move
      </Btn>
      <Dialog
        open={!!preview}
        title={`Move to ${preview?.academicYear ?? ""}?`}
        description="Each class moves up one form and keeps its subjects. This cannot be undone."
        onClose={() => setPreview(null)}
        footer={
          <>
            <Btn onClick={() => setPreview(null)}>Cancel</Btn>
            <Btn variant="danger" loading={busy} onClick={() => run(false)}>
              Move up a year
            </Btn>
          </>
        }
      >
        <ul className="divide-y divide-line">
          {(preview?.movement ?? []).map((m) => (
            <li key={m.from} className="flex justify-between py-2 text-[13.5px]">
              <span className="font-semibold text-ink-900">
                {m.from} → {m.to}
              </span>
              <span className="text-ink-500">{m.students} learners</span>
            </li>
          ))}
        </ul>
        <Note>Teachers keep their subjects in the classes they move with.</Note>
      </Dialog>
    </Panel>
  );
}
