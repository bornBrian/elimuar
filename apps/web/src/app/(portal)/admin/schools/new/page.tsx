"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "@/lib/navigation";
import { z } from "zod";
import { ArrowRight, Buildings, DownloadSimple, FileXls, UploadSimple, UserPlus } from "@phosphor-icons/react";
import { districtSchema, regionSchema } from "@elimuar/shared";
import { Btn, ConsolePage, Panel, Select, Skeleton } from "@/components/console/kit";
import { toast } from "@/components/toast";
import { ApiError, api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cell, downloadTemplate, readSheetRows } from "@/lib/spreadsheet";

const createSchema = z
  .object({
    schoolId: z.string().uuid(),
    code: z.string(),
    head: z.object({ membershipId: z.string().uuid(), invited: z.boolean() }).nullable(),
  })
  .passthrough();

const HEAD_TEMPLATE = [
  { header: "School name", sample: "Mtwara Technical Secondary School", width: 40 },
  { header: "School code", sample: "S0206", width: 16 },
  { header: "Region", sample: "Mtwara", width: 20 },
  { header: "District", sample: "Mtwara Urban", width: 20 },
  { header: "Level", sample: "secondary", width: 12 },
  { header: "Head first name", sample: "Omari", width: 18 },
  { header: "Head last name", sample: "Msuya", width: 18 },
  { header: "Head email", sample: "omari.msuya@s0206.elimuar.tz", width: 34 },
  { header: "Head phone", sample: "+255712345678", width: 20 },
];

export default function AddSchoolPage() {
  const router = useRouter();
  const regions = useApi("/api/geo/regions", regionSchema.array());

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [regionId, setRegionId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [level, setLevel] = useState("secondary");

  const districts = useApi(regionId ? `/api/geo/regions/${regionId}/districts` : null, districtSchema.array(), [regionId]);

  const [headFirst, setHeadFirst] = useState("");
  const [headLast, setHeadLast] = useState("");
  const [headEmail, setHeadEmail] = useState("");
  const [headPhone, setHeadPhone] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const locationOptions = useMemo(
    () => [
      { value: "", label: "Select location" },
      ...(regions.data ?? []).map((region) => ({ value: region.id, label: region.name })),
    ],
    [regions.data]
  );

  const districtOptions = useMemo(
    () => [
      { value: "", label: regionId ? "Select district" : "Choose a region first" },
      ...(districts.data ?? []).map((district) => ({ value: district.id, label: district.name })),
    ],
    [districts.data, regionId]
  );

  const headFilled = headFirst.trim().length > 1 && headLast.trim().length > 1 && headEmail.includes("@");
  const canSave = name.trim().length > 1 && code.trim().length > 1 && districtId !== "";

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api("/api/platform/schools", createSchema, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          districtId,
          level,
          ...(headFilled
            ? {
                head: {
                  firstName: headFirst.trim(),
                  lastName: headLast.trim(),
                  email: headEmail.trim().toLowerCase(),
                  ...(headPhone.trim() ? { phone: headPhone.trim() } : {}),
                },
              }
            : {}),
        }),
      });

      toast.success(
        result.head
          ? result.head.invited
            ? `${name.trim()} added. ${headFirst} ${headLast} has been sent a setup link.`
            : `${name.trim()} added, and ${headFirst} ${headLast} appointed as head.`
          : `${name.trim()} added. Appoint a head when you are ready.`
      );
      router.push(`/admin/schools/${result.schoolId}`);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not create that school.");
    } finally {
      setBusy(false);
    }
  }

  async function importSheet(file: File) {
    setImporting(true);
    setError(null);
    try {
      const rows = await readSheetRows(file);
      if (rows.length === 0) {
        setError("That sheet had no rows under the header.");
        return;
      }

      let created = 0;
      const problems: string[] = [];
      for (const [index, row] of rows.entries()) {
        const rowName = cell(row, "school name", "name");
        const rowCode = cell(row, "school code", "code");
        const regionName = cell(row, "region");
        const districtName = cell(row, "district");

        const region = (regions.data ?? []).find((item) => item.name.toLowerCase() === regionName.toLowerCase());
        if (!region) {
          problems.push(`Row ${index + 2}: no region called “${regionName}”.`);
          continue;
        }
        const regionDistricts = await api(`/api/geo/regions/${region.id}/districts`, districtSchema.array()).catch(
          () => []
        );
        const district = regionDistricts.find((item) => item.name.toLowerCase() === districtName.toLowerCase());
        if (!district) {
          problems.push(`Row ${index + 2}: “${districtName}” is not a district in ${region.name}.`);
          continue;
        }

        const firstName = cell(row, "head first name", "first name");
        const lastName = cell(row, "head last name", "last name");
        const email = cell(row, "head email", "email");
        const phone = cell(row, "head phone", "phone");
        const rowLevel = cell(row, "level") === "primary" ? "primary" : "secondary";

        try {
          await api("/api/platform/schools", createSchema, {
            method: "POST",
            body: JSON.stringify({
              name: rowName,
              code: rowCode.toUpperCase(),
              districtId: district.id,
              level: rowLevel,
              ...(firstName && lastName && email
                ? { head: { firstName, lastName, email: email.toLowerCase(), ...(phone ? { phone } : {}) } }
                : {}),
            }),
          });
          created += 1;
        } catch (cause) {
          problems.push(`Row ${index + 2}: ${cause instanceof ApiError ? cause.message : "could not be created."}`);
        }
      }

      if (created > 0) toast.success(`${created} ${created === 1 ? "school" : "schools"} created from the sheet.`);
      if (problems.length > 0) {
        toast.error(`${problems.length} ${problems.length === 1 ? "row was" : "rows were"} skipped.`);
        setError(problems.slice(0, 6).join(" "));
      }
      if (created > 0) router.push("/admin/schools");
    } catch {
      setError("That file could not be read as a spreadsheet.");
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <ConsolePage
      crumbs={[{ label: "Schools", href: "/admin/schools" }, { label: "Add School" }]}
      title="Add School"
      subtitle="Create a new school and assign a head."
      width="form"
    >
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-[13px] leading-5 text-danger-700">
          {error}
        </p>
      )}

      <form onSubmit={save} className="space-y-4">
        <Panel icon={Buildings} title="School information">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="console-label">School name *</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Mtwara Technical Secondary School"
                className="console-input"
                required
              />
            </label>

            <div>
              <span className="console-label">Location *</span>
              {regions.loading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    value={regionId}
                    onChange={(value) => {
                      setRegionId(value);
                      setDistrictId("");
                    }}
                    options={locationOptions}
                    ariaLabel="Region"
                  />
                  <Select
                    value={districtId}
                    onChange={setDistrictId}
                    options={districtOptions}
                    ariaLabel="District"
                  />
                </div>
              )}
            </div>

            <label className="block">
              <span className="console-label">School code (optional)</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="e.g. S0206"
                className="console-input"
              />
            </label>

            <label className="block">
              <span className="console-label">Level</span>
              <select value={level} onChange={(event) => setLevel(event.target.value)} className="console-input">
                <option value="secondary">Secondary</option>
                <option value="primary">Primary</option>
              </select>
            </label>
          </div>
        </Panel>

        <Panel icon={UserPlus} title="Assign school head">
          <p className="-mt-1 mb-4 text-[13px] leading-5 text-ink-500">
            Optional. The head is invited by email and chooses their own password. If no mail provider is configured the
            account is still created, and appears as pending until they claim it.
          </p>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <label className="block">
              <span className="console-label">First name</span>
              <input
                value={headFirst}
                onChange={(event) => setHeadFirst(event.target.value)}
                placeholder="e.g. Omari"
                className="console-input"
              />
            </label>
            <label className="block">
              <span className="console-label">Last name</span>
              <input
                value={headLast}
                onChange={(event) => setHeadLast(event.target.value)}
                placeholder="e.g. Msuya"
                className="console-input"
              />
            </label>
            <label className="block">
              <span className="console-label">Email address</span>
              <input
                type="email"
                value={headEmail}
                onChange={(event) => setHeadEmail(event.target.value)}
                placeholder="e.g. omari.msuya@s0206.elimuar.tz"
                className="console-input"
              />
            </label>
            <label className="block lg:col-start-1">
              <span className="console-label">Phone (optional)</span>
              <input
                value={headPhone}
                onChange={(event) => setHeadPhone(event.target.value)}
                placeholder="+255 7XX XXX XXX"
                className="console-input"
              />
            </label>
          </div>
          {headEmail && !headFilled && (
            <p className="mt-3 text-[12.5px] text-[#a3600a]">
              A head needs a first name, a last name and an email before we can create the account.
            </p>
          )}
        </Panel>

        <Panel icon={UploadSimple} title="Add by">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-line px-4 py-4">
              <div className="flex items-center gap-2.5">
                <DownloadSimple size={16} weight="bold" aria-hidden className="text-brand-600" />
                <p className="text-[13.5px] font-semibold text-ink-800">Download template</p>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-5 text-ink-500">
                Get the sheet, fill it and upload it back to add several schools at once.
              </p>
              <button
                type="button"
                onClick={() =>
                  void downloadTemplate("elimuar-schools.xlsx", "Schools", HEAD_TEMPLATE, [
                    "One row per school. Region and District must match the names already registered.",
                    "Level is either secondary or primary.",
                    "Head columns are optional; leave them blank to appoint a head later.",
                  ])
                }
                className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600 hover:text-brand-700"
              >
                <DownloadSimple size={14} weight="bold" aria-hidden />
                Download template
              </button>
            </div>

            <div className="rounded-xl border border-line px-4 py-4">
              <div className="flex items-center gap-2.5">
                <FileXls size={16} weight="bold" aria-hidden className="text-brand-600" />
                <p className="text-[13.5px] font-semibold text-ink-800">Upload filled template</p>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-5 text-ink-500">
                Choose the completed sheet — rows that cannot be resolved are reported, and nothing else is skipped.
              </p>
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void importSheet(file);
                }}
              />
              <Btn
                size="sm"
                className="mt-3"
                loading={importing}
                onClick={() => fileInput.current?.click()}
              >
                {importing ? "Importing…" : "Choose file"}
              </Btn>
            </div>
          </div>

          <div className="my-5 flex items-center gap-4">
            <span className="h-px flex-1 bg-[#E4EBF6]" />
            <span className="text-[12px] font-medium text-ink-500">— or —</span>
            <span className="h-px flex-1 bg-[#E4EBF6]" />
          </div>

          <p className="text-[13px] font-semibold text-ink-800">Add one by one</p>
        </Panel>

        <div className="flex flex-wrap items-center justify-end gap-3 pb-2">
          <Btn onClick={() => router.push("/admin/schools")}>Cancel</Btn>
          <Btn type="submit" variant="primary" loading={busy} disabled={!canSave}>
            Save school
            {!busy && <ArrowRight size={16} weight="bold" aria-hidden />}
          </Btn>
        </div>
      </form>
    </ConsolePage>
  );
}
