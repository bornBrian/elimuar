"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "@/lib/navigation";
import { z } from "zod";
import { ArrowRight, BookOpen, GraduationCap, Info, Plus } from "@phosphor-icons/react";
import { createAcademicClassRequestSchema, createAcademicSubjectRequestSchema } from "@elimuar/shared";
import { Btn, ConsolePage, Panel, Tabs } from "@/components/console/kit";
import { toast } from "@/components/toast";
import { ApiError, api } from "@/lib/api";

const createdSchema = z.object({ id: z.string().uuid() }).passthrough();

const TABS = [
  { key: "class", label: "Class" },
  { key: "subject", label: "Subject" },
];

export default function AddAcademicEntryPage() {
  const router = useRouter();

  const [tab, setTab] = useState("class");
  const [className, setClassName] = useState("");
  const [position, setPosition] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isClass = tab === "class";
  const name = isClass ? className : subjectName;
  const canSave = name.trim().length >= 2;

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const payload = isClass
      ? createAcademicClassRequestSchema.safeParse({
          name: className.trim(),
          ...(position.trim() ? { position: Number.parseInt(position.trim(), 10) } : {}),
        })
      : createAcademicSubjectRequestSchema.safeParse({
          name: subjectName.trim(),
          ...(subjectCode.trim() ? { code: subjectCode.trim().toUpperCase() } : {}),
        });

    if (!payload.success) {
      setError(payload.error.issues[0]?.message ?? "Check the name and try again.");
      return;
    }

    setBusy(true);
    try {
      await api(`/api/platform/console/academic/${isClass ? "classes" : "subjects"}`, createdSchema, {
        method: "POST",
        body: JSON.stringify(payload.data),
      });
      toast.success(`${payload.data.name} added to the register.`);
      router.push("/admin/academic");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not add that entry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConsolePage
      crumbs={[
        { label: "Academic Structure", href: "/admin/academic" },
        { label: "Add Class / Subject" },
      ]}
      title="Add Class / Subject"
      subtitle="Register a class or a subject for every school on the platform."
      width="form"
    >
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] leading-5 text-danger-700"
        >
          {error}
        </p>
      )}

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <form onSubmit={save} className="mt-4 space-y-4">
        {isClass ? (
          <Panel icon={GraduationCap} title="Class information" meta="A form level, e.g. Form 5.">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="console-label">Class name *</span>
                <input
                  value={className}
                  onChange={(event) => setClassName(event.target.value)}
                  placeholder="e.g. Form 5"
                  className="console-input"
                  required
                />
              </label>

              <label className="block">
                <span className="console-label">Sort order</span>
                <input
                  value={position}
                  onChange={(event) => setPosition(event.target.value)}
                  placeholder="e.g. 5"
                  inputMode="numeric"
                  className="console-input"
                />
              </label>
            </div>

            <p className="mt-3 flex items-start gap-2 text-[12.5px] leading-5 text-ink-500">
              <Info size={14} weight="regular" aria-hidden className="mt-0.5 shrink-0" />
              A class is a form every school is taught — Form 1, Form 2, Form 3, Form 4. It belongs to no school, so
              adding Form 5 here offers Form 5 to every school at once. Leave the sort order blank to place it at the end
              of the register.
            </p>
          </Panel>
        ) : (
          <Panel icon={BookOpen} title="Subject information" meta="A national syllabus subject, e.g. Biology.">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="console-label">Subject name *</span>
                <input
                  value={subjectName}
                  onChange={(event) => setSubjectName(event.target.value)}
                  placeholder="e.g. Biology"
                  className="console-input"
                  required
                />
              </label>

              <label className="block">
                <span className="console-label">Code</span>
                <input
                  value={subjectCode}
                  onChange={(event) => setSubjectCode(event.target.value)}
                  placeholder="e.g. BIO"
                  className="console-input"
                />
              </label>
            </div>

            <p className="mt-3 flex items-start gap-2 text-[12.5px] leading-5 text-ink-500">
              <Info size={14} weight="regular" aria-hidden className="mt-0.5 shrink-0" />
              A subject is the national syllabus and is registered once. Practi­cals, materials and oral quizzes can be
              filed under it, and a school teaches it by opening one of its classes for it.
            </p>
          </Panel>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 pb-2">
          <Btn onClick={() => router.push("/admin/academic")}>Cancel</Btn>
          <Btn type="submit" variant="primary" loading={busy} disabled={!canSave}>
            {!busy && <Plus size={15} weight="bold" aria-hidden />}
            Add to register
            {!busy && <ArrowRight size={16} weight="bold" aria-hidden />}
          </Btn>
        </div>
      </form>
    </ConsolePage>
  );
}
