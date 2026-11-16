"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { z } from "zod";
import { Archive, CheckCircle, CloudArrowUp, FolderOpen, PencilSimple, PlayCircle, Trash, UploadSimple } from "@phosphor-icons/react";
import { ArResultsPanel } from "@/components/console/ArResults";
import { ActivityObservePreview } from "@/components/console/ActivityObservePreview";
import { arActivitySummarySchema, type ArActivitySummary } from "@elimuar/shared";
import { Btn, ConsolePage, Dialog, Field, Note, RowMenu, SearchInput, Select, Skeleton, Status, Tabs } from "@/components/console/kit";
import { toast } from "@/components/toast";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { formatDateTime } from "@/lib/format";

const listSchema = z.array(arActivitySummarySchema);
const importResultSchema = z.object({
  imported: z.array(z.string()),
  skipped: z.array(z.object({ activityKey: z.string(), reason: z.string() })),
});

const SUBJECTS = [
  { key: "science", name: "Science" },
  { key: "math", name: "Math" },
  { key: "socialStudies", name: "Social Studies" },
  { key: "englishlanguagearts", name: "English Language Arts" },
];

function megabytes(bytes: number) {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** `<bundle>_android_v<NNN>.bundle` -> { bundleName, bundleVersion } */
function parseBundleFile(name: string) {
  const match = /^(.+)_android_v(\d+)\.bundle$/i.exec(name);
  return match ? { bundleName: match[1], bundleVersion: Number(match[2]) } : null;
}

export default function ArActivitiesPage() {
  const { data, loading, error, reload } = useApi("/ar-activities", listSchema);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState("all");
  const [subject, setSubject] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<ArActivitySummary | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<ArActivitySummary | null>(null);
  const [tab, setTab] = useState<"activities" | "results">("activities");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "results") setTab("results");
  }, []);

  const forms = useMemo(
    () => Array.from(new Set((data ?? []).flatMap((a) => splitForms(a.gradeLevel)))).sort(),
    [data]
  );
  const subjects = useMemo(
    () => Array.from(new Set((data ?? []).map((a) => a.subjectName ?? a.category))).sort(),
    [data]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (a) =>
        (form === "all" || splitForms(a.gradeLevel).includes(form)) &&
        (subject === "all" || (a.subjectName ?? a.category) === subject) &&
        (!q || a.title.toLowerCase().includes(q) || a.activityKey.toLowerCase().includes(q) || a.tags.some((t) => t.toLowerCase().includes(q)))
    );
  }, [data, query, form, subject]);

  async function setStatus(activity: ArActivitySummary, status: "published" | "archived") {
    setBusyKey(activity.activityKey);
    try {
      await api(`/ar-activities/${activity.activityKey}`, arActivitySummarySchema, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast.success(status === "published" ? `${activity.title} is published to every device.` : `${activity.title} is archived.`);
      reload();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "The change was not saved.");
    } finally {
      setBusyKey(null);
    }
  }

  async function remove(activity: ArActivitySummary) {
    if (!window.confirm(`Delete ${activity.title}? Its bundle, thumbnail and lesson are removed. Learners' scores are kept.`)) return;
    setBusyKey(activity.activityKey);
    try {
      await api(`/ar-activities/${activity.activityKey}`, z.unknown(), { method: "DELETE" });
      toast.success(`${activity.title} deleted.`);
      reload();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "The activity was not deleted.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <ConsolePage
      title="AR Activities"
      subtitle="What the ElimuAR app plays, and how learners score."
      actions={
        tab === "activities" ? (
          <>
            <Btn onClick={() => setImportOpen(true)}>
              <FolderOpen size={17} aria-hidden /> Import
            </Btn>
            <Btn variant="primary" onClick={() => setUploadOpen(true)}>
              <UploadSimple size={17} aria-hidden /> Upload
            </Btn>
          </>
        ) : undefined
      }
    >
      <Tabs
        className="mb-4"
        value={tab}
        onChange={(key) => setTab(key as "activities" | "results")}
        tabs={[
          { key: "activities", label: "Activities", count: data?.length },
          { key: "results", label: "Results" },
        ]}
      />

      {tab === "results" ? (
        <ArResultsPanel showSchool />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
            <Select
              ariaLabel="Form"
              value={form}
              onChange={setForm}
              options={[{ value: "all", label: "All forms" }, ...forms.map((f) => ({ value: f, label: f }))]}
            />
            <Select
              ariaLabel="Subject"
              value={subject}
              onChange={setSubject}
              options={[{ value: "all", label: "All subjects" }, ...subjects.map((s) => ({ value: s, label: s }))]}
            />
            <SearchInput value={query} onChange={setQuery} placeholder="Search" />
          </div>
          {error && <Note>{error}</Note>}
          {loading && !data && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          )}
          {data && shown.length === 0 && <Note>{data.length === 0 ? "No activities yet." : "No activities match these filters."}</Note>}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((a) => (
              <article key={a.id} className="console-card flex flex-col overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPreviewing(a)}
                  className="group relative flex h-44 items-center justify-center bg-[#f3f5f8]"
                  aria-label={`Preview ${a.title}`}
                >
                  <span className="absolute inset-0 z-10 flex items-center justify-center bg-ink-900/0 opacity-0 transition group-hover:bg-ink-900/30 group-hover:opacity-100">
                    <PlayCircle size={56} weight="fill" className="text-white" aria-hidden />
                  </span>
                  {a.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.thumbnailUrl} alt="" className="h-full w-full object-contain p-3" />
                  ) : (
                    <CloudArrowUp size={40} className="text-ink-300" aria-hidden />
                  )}
                </button>
                <div className="flex flex-1 flex-col gap-1.5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="truncate text-[15px] font-bold text-ink-900">{a.title}</h3>
                    <Status value={a.status} />
                  </div>
                  <p className="text-[12.5px] text-ink-500">
                    {a.subjectName ?? a.category} · {a.gradeLevel} · {megabytes(a.bundleSizeBytes)}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
                    <Btn size="sm" variant="primary" onClick={() => setPreviewing(a)}>
                      <PlayCircle size={15} aria-hidden /> Preview
                    </Btn>
                    <Btn size="sm" onClick={() => setEditing(a)}>
                      <PencilSimple size={15} aria-hidden /> Edit
                    </Btn>
                    <span className="ml-auto">
                      <RowMenu
                        items={[
                          a.status === "published"
                            ? { label: "Archive", icon: Archive, onSelect: () => void setStatus(a, "archived") }
                            : { label: "Publish", icon: CheckCircle, onSelect: () => void setStatus(a, "published") },
                          { label: "Delete", icon: Trash, tone: "danger", onSelect: () => void remove(a) },
                        ]}
                      />
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onDone={reload} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onDone={reload} />
      <EditDialog activity={editing} onClose={() => setEditing(null)} onDone={reload} />
      {previewing && <ActivityObservePreview activity={previewing} onClose={() => setPreviewing(null)} />}
    </ConsolePage>
  );
}

function UploadDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [bundle, setBundle] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [form, setForm] = useState({
    activityKey: "",
    title: "",
    description: "",
    category: "science",
    tags: "",
    gradeLevel: "Form 2",
    bundleName: "",
    bundleVersion: "1",
  });
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  function pickBundle(file: File | null) {
    setBundle(file);
    const parsed = file ? parseBundleFile(file.name) : null;
    if (parsed) {
      setForm((f) => ({
        ...f,
        bundleName: parsed.bundleName,
        bundleVersion: String(parsed.bundleVersion),
        activityKey: f.activityKey || parsed.bundleName.replace(/^\d+_/, "").replace(/[^A-Za-z0-9_-]/g, ""),
      }));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!bundle) {
      toast.error("Choose the activity's .bundle file.");
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      body.append("bundle", bundle);
      if (thumbnail) body.append("thumbnail", thumbnail);
      body.append(
        "metadata",
        JSON.stringify({
          activityKey: form.activityKey.trim(),
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category,
          tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
          gradeLevel: form.gradeLevel.trim() || "Form 2",
          bundleName: form.bundleName.trim(),
          bundleVersion: Number(form.bundleVersion) || 1,
          status: "published",
        })
      );
      const saved = await api("/ar-activities", arActivitySummarySchema, { method: "POST", body });
      toast.success(`${saved.title} uploaded. Devices see it the next time they open the library.`);
      onDone();
      onClose();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "The upload failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width="lg"
      title="Upload activity"
      description="A Unity activity bundle (…_android_vNNN.bundle)."
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" form="upload-activity" loading={saving}>
            Upload
          </Btn>
        </>
      }
    >
      <form id="upload-activity" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 text-[13px] font-semibold text-ink-700">
          Activity bundle
          <input type="file" accept=".bundle" className="mt-1 block w-full text-[13px]" onChange={(e) => pickBundle(e.target.files?.[0] ?? null)} />
        </label>
        <label className="sm:col-span-2 text-[13px] font-semibold text-ink-700">
          Thumbnail (PNG or JPG, optional)
          <input type="file" accept="image/png,image/jpeg" className="mt-1 block w-full text-[13px]" onChange={(e) => setThumbnail(e.target.files?.[0] ?? null)} />
        </label>
        <TextInput label="Activity ID" value={form.activityKey} onChange={set("activityKey")} required />
        <TextInput label="Title" value={form.title} onChange={set("title")} required />
        <label className="text-[13px] font-semibold text-ink-700">
          Subject
          <select className="console-input mt-1 w-full" value={form.category} onChange={(e) => set("category")(e.target.value)}>
            {SUBJECTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <TextInput label="Form / grade" value={form.gradeLevel} onChange={set("gradeLevel")} />
        <TextInput label="Bundle name" value={form.bundleName} onChange={set("bundleName")} required />
        <TextInput label="Bundle version" value={form.bundleVersion} onChange={set("bundleVersion")} required />
        <TextInput label="Tags (comma separated)" value={form.tags} onChange={set("tags")} />
        <label className="sm:col-span-2 text-[13px] font-semibold text-ink-700">
          Description
          <textarea className="console-input mt-1 min-h-[90px] w-full" value={form.description} onChange={(e) => set("description")(e.target.value)} />
        </label>
      </form>
    </Dialog>
  );
}

function TextInput({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label className="text-[13px] font-semibold text-ink-700">
      {label}
      <input className="console-input mt-1 w-full" value={value} required={required} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [ledger, setLedger] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [gradeLevel, setGradeLevel] = useState("Form 2");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<z.infer<typeof importResultSchema> | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ledger) {
      toast.error("Choose activitiesLedger.json.");
      return;
    }
    setSaving(true);
    setResult(null);
    try {
      const body = new FormData();
      body.append("ledger", ledger);
      body.append("gradeLevel", gradeLevel);
      for (const f of files) body.append("files", f);
      const outcome = await api("/ar-activities/import", importResultSchema, { method: "POST", body });
      setResult(outcome);
      toast.success(`${outcome.imported.length} activit${outcome.imported.length === 1 ? "y" : "ies"} imported.`);
      onDone();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "The import failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width="lg"
      title="Import activity folder"
      description="activitiesLedger.json with the bundles and thumbnails it names."
      footer={
        <>
          <Btn onClick={onClose}>Close</Btn>
          <Btn variant="primary" type="submit" form="import-activities" loading={saving}>
            Import
          </Btn>
        </>
      }
    >
      <form id="import-activities" onSubmit={submit} className="grid gap-3">
        <label className="text-[13px] font-semibold text-ink-700">
          activitiesLedger.json
          <input type="file" accept=".json,application/json" className="mt-1 block w-full text-[13px]" onChange={(e) => setLedger(e.target.files?.[0] ?? null)} />
        </label>
        <label className="text-[13px] font-semibold text-ink-700">
          Bundles and thumbnails (select several)
          <input
            type="file"
            multiple
            accept=".bundle,image/png,image/jpeg"
            className="mt-1 block w-full text-[13px]"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>
        {files.length > 0 && (
          <p className="text-[12.5px] text-ink-500">
            {files.length} file(s), {megabytes(files.reduce((n, f) => n + f.size, 0))}
          </p>
        )}
        <Field label="Form / grade for these activities">
          <input className="console-input w-full" value={gradeLevel} onChange={(e) => setGradeLevel(e.target.value)} />
        </Field>
        {result && (
          <div className="rounded-xl border border-line bg-[#f7f9fb] p-3 text-[13px]">
            <p className="font-semibold text-ink-800">Imported: {result.imported.join(", ") || "none"}</p>
            {result.skipped.map((s) => (
              <p key={s.activityKey} className="text-ink-500">
                Skipped {s.activityKey}: {s.reason}
              </p>
            ))}
          </div>
        )}
      </form>
    </Dialog>
  );
}

const academicSchema = z.object({ classOptions: z.array(z.string()), subjectOptions: z.array(z.string()) });

const splitForms = (value: string) =>
  value.split(",").map((f) => f.trim()).filter(Boolean);

function EditDialog({ activity, onClose, onDone }: { activity: ArActivitySummary | null; onClose: () => void; onDone: () => void }) {
  const { data: academic } = useApi(activity ? "/academic/options" : null, academicSchema, [activity?.id]);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [forms, setForms] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (activity && loadedFor !== activity.id) {
    setLoadedFor(activity.id);
    setTitle(activity.title);
    setSubject(activity.subjectName ?? "");
    setForms(splitForms(activity.gradeLevel));
    setDescription(activity.description ?? "");
    setTags(activity.tags.join(", "));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!activity) return;
    setSaving(true);
    try {
      await api(`/ar-activities/${activity.activityKey}`, arActivitySummarySchema, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          ...(subject ? { subject } : {}),
          gradeLevel: (forms.length ? forms : ["Form 2"]).join(", "),
          description: description.trim(),
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      toast.success("Saved.");
      onDone();
      onClose();
    } catch (cause) {
      toast.error(cause instanceof ApiError ? cause.message : "Not saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={activity !== null}
      onClose={() => {
        setLoadedFor(null);
        onClose();
      }}
      title={activity ? `Edit ${activity.title}` : "Edit"}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" form="edit-activity" loading={saving}>
            Save
          </Btn>
        </>
      }
    >
      <form id="edit-activity" onSubmit={save} className="grid gap-3">
        <TextInput label="Title" value={title} onChange={setTitle} required />
        <label className="text-[13px] font-semibold text-ink-700">
          Subject
          <select className="console-input mt-1 w-full" value={subject} onChange={(e) => setSubject(e.target.value)}>
            {!subject && <option value="">Choose a subject</option>}
            {Array.from(new Set([...(academic?.subjectOptions ?? []), ...(subject ? [subject] : [])])).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="text-[13px] font-semibold text-ink-700">
          <legend>Forms (the app lists it under each one ticked)</legend>
          <div className="mt-1.5 flex flex-wrap gap-3">
            {Array.from(new Set([...(academic?.classOptions ?? ["Form 1", "Form 2", "Form 3", "Form 4"]), ...forms]))
              .sort()
              .map((f) => (
                <label key={f} className="flex items-center gap-1.5 font-medium">
                  <input
                    type="checkbox"
                    checked={forms.includes(f)}
                    onChange={(e) => setForms((now) => (e.target.checked ? [...now, f] : now.filter((x) => x !== f)))}
                  />
                  {f}
                </label>
              ))}
          </div>
        </fieldset>
        <TextInput label="Tags (comma separated)" value={tags} onChange={setTags} />
        <label className="text-[13px] font-semibold text-ink-700">
          Description
          <textarea className="console-input mt-1 min-h-[110px] w-full" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </form>
    </Dialog>
  );
}
