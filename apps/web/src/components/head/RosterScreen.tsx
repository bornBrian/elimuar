"use client";

import { useMemo, useRef, useState } from "react";
import { z } from "zod";
import { DownloadSimple, UploadSimple } from "@phosphor-icons/react";
import {
  classSchema,
  createEnrollmentRequestSchema,
  enrolledStudentSchema,
  memberSchema,
  provisionedMemberSchema,
  resetStudentPinResultSchema,
  rosterImportRequestSchema,
  rosterImportResultSchema,
  setStudentPinRequestSchema,
  studentCredentialSchema,
  updateEnrollmentRequestSchema,
  updateMemberRequestSchema,
  type EnrolledStudent,
  type Member,
} from "@elimuar/shared";
import {
  Btn,
  ConsolePage,
  ConsoleTable,
  Dialog,
  Field,
  Note,
  Panel,
  SearchInput,
  Select,
  Status,
  type TableColumn,
} from "@/components/console/kit";
import { Avatar } from "@/components/ui";
import { RegistrationSignal } from "@/components/signals";
import { ApiError, api } from "@/lib/api";
import { formatDate, formatRelative } from "@/lib/format";
import { cell, downloadRows, downloadTemplate, readSheetRows } from "@/lib/spreadsheet";
import { useSchoolScope } from "@/lib/scope";
import { useApi } from "@/lib/useApi";
import { TeachingPanel } from "@/components/TeachingPanel";
import { toast } from "@/components/toast";

type RosterView = "students" | "teachers";

const GRADES = ["Form 1", "Form 2", "Form 3", "Form 4"];

const LEARNER_TEMPLATE = [
  { header: "Full name", sample: "Asha Juma", width: 26 },
  { header: "Admission number", sample: "S0206/0031/2026", width: 22 },
  { header: "Guardian phone", sample: "+255712345678", width: 18 },
];

const STAFF_TEMPLATE = [
  { header: "First name", sample: "Neema", width: 16 },
  { header: "Last name", sample: "Kessy", width: 16 },
  { header: "Email", sample: "neema.kessy@s0206.elimuar.tz", width: 30 },
  { header: "Phone", sample: "+255712345678", width: 18 },
  { header: "Role", sample: "Teacher", width: 14 },
];

const STAFF_ROLES: Array<{ value: "teacher" | "academic_master" | "secretary"; label: string }> = [
  { value: "teacher", label: "Teacher" },
  { value: "academic_master", label: "Academic master" },
  { value: "secretary", label: "Secretary" },
];

function roleLabel(role: string): string {
  switch (role) {
    case "school_admin":
      return "School head";
    case "academic_master":
      return "Academic master";
    case "secretary":
      return "Secretary";
    case "platform_admin":
      return "Platform";
    default:
      return "Teacher";
  }
}

const LEARNER_NOTES = [
  "Admission number must be unique within the school; duplicates are skipped, never overwritten.",
  "Every learner on the list joins the form you choose on the upload screen — subjects are not asked for.",
  "Guardian phone lets the student sign in on the mobile app without an email address.",
];

const STAFF_NOTES = [
  "Role must be “Teacher”, “Academic master” or “Secretary”.",
  "Each account receives an email with a link to set their own password.",
  "Emails must be unique; an existing account at this school is reported as a warning, not duplicated.",
];

type LearnerRow = EnrolledStudent & { id: string };

interface ParsedLearner {
  fullName: string;
  studentIdentifier: string;
  guardianPhone?: string;
  error?: string;
}

interface ParsedStaff {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: "teacher" | "academic_master" | "secretary";
  error?: string;
}

const mutationResultSchema = z.object({ id: z.string().optional() }).passthrough();

export function RosterScreen({ view }: { view: RosterView }) {
  const isStudents = view === "students";
  const scope = useSchoolScope();
  const schoolId = scope.schoolId;

  const members = useApi(schoolId ? `/api/schools/${schoolId}/members` : null, memberSchema.array(), [schoolId]);
  const students = useApi(schoolId ? `/api/schools/${schoolId}/students` : null, enrolledStudentSchema.array(), [schoolId]);
  const classes = useApi(schoolId ? `/api/schools/${schoolId}/classes` : null, classSchema.array(), [schoolId]);
  const credentials = useApi(
    schoolId ? `/api/schools/${schoolId}/student-credentials` : null,
    studentCredentialSchema.array(),
    [schoolId]
  );

  const [grade, setGrade] = useState("all");
  const [query, setQuery] = useState("");

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staffFilter, setStaffFilter] = useState<"all" | "teachers" | "awaiting" | "suspended">("all");
  const [manageTarget, setManageTarget] = useState<Member | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const learnerFile = useRef<HTMLInputElement>(null);
  const [learnerOpen, setLearnerOpen] = useState(false);
  const [addStudentOpen, setAddStudentOpen] = useState(false);
  const [newStudent, setNewStudent] = useState({
    fullName: "",
    studentIdentifier: "",
    gradeLevel: "",
    guardianPhone: "",
  });
  const [savingStudent, setSavingStudent] = useState(false);
  const [learnerRows, setLearnerRows] = useState<ParsedLearner[]>([]);
  const [learnerForm, setLearnerForm] = useState("");
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);

  const [editTarget, setEditTarget] = useState<LearnerRow | null>(null);
  const [edit, setEdit] = useState({ studentIdentifier: "", gradeLevel: "", status: "active" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"removed" | "transferred" | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [pinBusyId, setPinBusyId] = useState<string | null>(null);
  const [chosenPin, setChosenPin] = useState("");
  const [issuedPin, setIssuedPin] = useState<string | null>(null);

  const staffFile = useRef<HTMLInputElement>(null);
  const [staffOpen, setStaffOpen] = useState(false);
  const [staffImportRows, setStaffImportRows] = useState<ParsedStaff[]>([]);
  const [staffResults, setStaffResults] = useState<Array<{ name: string; email: string; error?: string }>>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    role: "teacher" as "teacher" | "academic_master" | "secretary",
  });
  const [inviting, setInviting] = useState(false);

  const staff: Member[] = useMemo(() => (members.data ?? []).filter((row) => row.role !== "student"), [members.data]);

  const schoolForms = useMemo(() => {
    const names = [...new Set((classes.data ?? []).map((row) => row.gradeLevel))];
    return names.sort((a, b) => {
      const ai = GRADES.indexOf(a);
      const bi = GRADES.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [classes.data]);

  const learnerList: LearnerRow[] = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (students.data ?? [])
      .map((row) => ({ ...row, id: row.enrollmentId }))
      .filter((row) => row.status !== "removed")
      .filter((row) => (grade === "all" ? true : row.gradeLevel === grade))
      .filter((row) =>
        needle
          ? row.fullName.toLowerCase().includes(needle) || (row.studentIdentifier ?? "").toLowerCase().includes(needle)
          : true
      );
  }, [students.data, grade, query]);

  const staffRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return staff
      .filter((row) => {
        if (staffFilter === "awaiting") return row.awaitingRegistration;
        if (staffFilter === "suspended") return row.status === "suspended";
        if (staffFilter === "teachers") return row.role === "teacher";
        return true;
      })
      .filter((row) =>
        needle ? row.fullName.toLowerCase().includes(needle) || row.email.toLowerCase().includes(needle) : true
      );
  }, [staff, query, staffFilter]);

  function fail(cause: unknown, fallback: string) {
    const message = cause instanceof ApiError ? cause.message : fallback;
    setError(message);
    toast.error(message);
  }

  async function downloadRegister() {
    if (!schoolId) return;
    setDownloading(true);
    try {
      await downloadRows(
        "elimuar-school-register.xlsx",
        "Students",
        (students.data ?? []).map((row) => ({
          "Full name": row.fullName,
          "Admission number": row.studentIdentifier ?? "",
          Class: row.className,
          Subjects: row.subjectCount,
          Status: row.status,
          Enrolled: formatDate(row.enrolledAt),
        })),
        [
          "Status: active = enrolled, transferred = left the school, withdrawn = removed from the register.",
          "Guardian phone is how the student signs in on the mobile app when they have no email.",
        ]
      );
      toast.success("Register downloaded.");
    } catch (cause) {
      fail(cause, "Could not build the spreadsheet.");
    } finally {
      setDownloading(false);
    }
  }

  async function resetPin(row: z.infer<typeof studentCredentialSchema>) {
    setPinBusyId(row.enrollmentId);
    setError(null);
    try {
      const result = await api(`/api/enrollments/${row.enrollmentId}/reset-pin`, resetStudentPinResultSchema, {
        method: "POST",
      });
      credentials.reload();
      setIssuedPin(result.newPin ?? null);
      if (!result.newPin) {
        toast.success(`PIN reset for ${row.fullName}. Hand the new PIN over in person.`);
      }
    } catch (cause) {
      fail(cause, "Could not reset that PIN.");
    } finally {
      setPinBusyId(null);
    }
  }

  async function setPin(row: z.infer<typeof studentCredentialSchema>, newPin: string) {
    setPinBusyId(row.enrollmentId);
    setError(null);
    try {
      await api(`/api/enrollments/${row.enrollmentId}/set-pin`, z.object({ message: z.string() }).passthrough(), {
        method: "POST",
        body: JSON.stringify(setStudentPinRequestSchema.parse({ newPin })),
      });
      credentials.reload();
      setChosenPin("");
      setIssuedPin(null);
      toast.success(`PIN set for ${row.fullName}.`);
    } catch (cause) {
      fail(cause, "Could not set that PIN.");
    } finally {
      setPinBusyId(null);
    }
  }

  async function onLearnerFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStaffResults([]);
    try {
      const rows = await readSheetRows(file);
      const parsed: ParsedLearner[] = rows.map((row) => {
        const fullName = cell(row, "full name", "name");
        const studentIdentifier = cell(row, "admission number", "admission no", "registration number", "registration no", "reg no", "student identifier");
        const guardianPhone = cell(row, "guardian phone", "phone");
        const problem = !fullName
          ? "Missing full name"
          : !studentIdentifier
            ? "Missing admission number"
            : undefined;
        return {
          fullName,
          studentIdentifier,
          ...(guardianPhone ? { guardianPhone } : {}),
          ...(problem ? { error: problem } : {}),
        };
      });
      setLearnerRows(parsed);
      setFileName(file.name);
      if (parsed.length === 0) setError("That file has no data rows below the header.");
    } catch {
      setError("Could not read that file. Download the .xlsx template and fill that in.");
    }
  }

  async function runLearnerImport() {
    if (!schoolId || !learnerForm) {
      setError("Choose the form these students join.");
      return;
    }
    const rows = learnerRows.filter((row) => !row.error);
    if (rows.length === 0) {
      setError("No valid rows to import.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const body = rosterImportRequestSchema.parse({ gradeLevel: learnerForm, rows });
      const result = await api(`/api/schools/${schoolId}/enrollments/roster-import`, rosterImportResultSchema, {
        method: "POST",
        body: JSON.stringify(body),
      });
      students.reload();
      classes.reload();
      setLearnerOpen(false);
      setLearnerRows([]);
      setFileName("");
      toast.success(
        `${result.created} student${result.created === 1 ? "" : "s"} enrolled · ${result.skipped} skipped${
          result.errors.length ? ` · ${result.errors.length} warning${result.errors.length === 1 ? "" : "s"}` : ""
        }`
      );
    } catch (cause) {
      fail(cause, "Could not import that list.");
    } finally {
      setImporting(false);
    }
  }

  function openEdit(row: LearnerRow) {
    setEditTarget(row);
    setEdit({ studentIdentifier: row.studentIdentifier ?? "", gradeLevel: row.gradeLevel, status: row.status });
    setIssuedPin(null);
    setChosenPin("");
    setError(null);
  }

  async function confirmEnrolmentAction() {
    if (!editTarget || !confirmAction || !schoolId) return;
    if (!confirmPassword.trim()) {
      setError("Enter your password to confirm.");
      return;
    }
    setConfirmBusy(true);
    setError(null);
    try {
      await api(`/api/schools/${schoolId}/enrollments/${editTarget.enrollmentId}`, enrolledStudentSchema, {
        method: "PATCH",
        body: JSON.stringify(
          updateEnrollmentRequestSchema.parse({
            studentIdentifier: edit.studentIdentifier.trim(),
            gradeLevel: edit.gradeLevel,
            status: confirmAction,
          })
        ),
      });
      students.reload();
      classes.reload();
      const name = editTarget.fullName;
      setEditTarget(null);
      setConfirmAction(null);
      setConfirmPassword("");
      toast.success(
        confirmAction === "removed"
          ? `${name} removed from the register. The teaching history stays.`
          : `${name} marked as transferred out.`
      );
    } catch (cause) {
      fail(cause, "Could not update that student.");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function saveLearner() {
    if (!editTarget) return;
    setSavingEdit(true);
    setError(null);
    try {
      await api(`/api/enrollments/${editTarget.enrollmentId}`, enrolledStudentSchema, {
        method: "PATCH",
        body: JSON.stringify(
          updateEnrollmentRequestSchema.parse({
            studentIdentifier: edit.studentIdentifier.trim(),
            gradeLevel: edit.gradeLevel,
            status: edit.status,
          })
        ),
      });
      students.reload();
      classes.reload();
      setEditTarget(null);
      toast.success(`${editTarget.fullName} updated.`);
    } catch (cause) {
      fail(cause, "Could not update that student.");
    } finally {
      setSavingEdit(false);
    }
  }

  function moveForm(direction: -1 | 1) {
    const index = schoolForms.indexOf(edit.gradeLevel);
    if (index === -1) return;
    const next = schoolForms[index + direction];
    if (next) setEdit((current) => ({ ...current, gradeLevel: next }));
  }

  async function onStaffFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStaffResults([]);
    try {
      const rows = await readSheetRows(file);
      const parsed: ParsedStaff[] = rows.map((row) => {
        const firstName = cell(row, "first name", "given name");
        const lastName = cell(row, "last name", "surname", "family name");
        const email = cell(row, "email", "institutional email").toLowerCase();
        const phone = cell(row, "phone", "mobile");
        const roleRaw = cell(row, "role").toLowerCase();
        const role: ParsedStaff["role"] = roleRaw.includes("academic")
          ? "academic_master"
          : roleRaw.includes("secretar")
            ? "secretary"
            : "teacher";
        const problem = !firstName
          ? "Missing first name"
          : !lastName
            ? "Missing last name"
            : !email.includes("@")
              ? "Missing or invalid email"
              : undefined;
        return { firstName, lastName, email, ...(phone ? { phone } : {}), role, ...(problem ? { error: problem } : {}) };
      });
      setStaffImportRows(parsed);
      setFileName(file.name);
      if (parsed.length === 0) setError("That file has no data rows below the header.");
    } catch {
      setError("Could not read that file. Download the .xlsx template and fill that in.");
    }
  }

  async function runStaffImport() {
    const rows = staffImportRows.filter((row) => !row.error);
    if (rows.length === 0) {
      setError("No valid rows to import.");
      return;
    }
    setImporting(true);
    setError(null);
    setStaffResults([]);

    const results: Array<{ name: string; email: string; error?: string }> = [];
    for (const row of rows) {
      const name = `${row.firstName} ${row.lastName}`;
      try {
        await api(`/api/schools/${schoolId}/members`, provisionedMemberSchema, {
          method: "POST",
          body: JSON.stringify({
            firstName: row.firstName,
            lastName: row.lastName,
            email: row.email,
            role: row.role,
            ...(row.phone ? { phone: row.phone } : {}),
          }),
        });
        results.push({ name, email: row.email });
      } catch (cause) {
        results.push({ name, email: row.email, error: cause instanceof ApiError ? cause.message : "Failed" });
      }
    }
    setStaffResults(results);
    setStaffImportRows([]);
    setFileName("");
    members.reload();
    setImporting(false);
    const created = results.filter((row) => !row.error).length;
    toast.success(`${created} account${created === 1 ? "" : "s"} created · ${results.length - created} failed`);
  }

  async function inviteStaff() {
    if (!schoolId) return;
    setInviting(true);
    setError(null);
    try {
      const result = await api(`/api/schools/${schoolId}/members`, provisionedMemberSchema, {
        method: "POST",
        body: JSON.stringify({
          firstName: invite.firstName.trim(),
          lastName: invite.lastName.trim(),
          email: invite.email.trim().toLowerCase(),
          role: invite.role,
          ...(invite.phone.trim() ? { phone: invite.phone.trim() } : {}),
        }),
      });

      members.reload();
      setInvite({ firstName: "", lastName: "", email: "", phone: "", role: "teacher" });
      setInviteOpen(false);
      toast.success(
        result.invited
          ? `Account created. A set-password email was sent to ${invite.email}.`
          : "Account created, but no email provider is configured — the member cannot be emailed yet."
      );
    } catch (cause) {
      fail(cause, "Could not create that account.");
    } finally {
      setInviting(false);
    }
  }

  async function setMemberStatus(member: Member, status: "active" | "suspended" | "transferred" | "removed") {
    setBusyId(member.membershipId);
    setError(null);
    try {
      await api(`/api/schools/${schoolId}/members/${member.membershipId}`, memberSchema.partial().passthrough(), {
        method: "PATCH",
        body: JSON.stringify(updateMemberRequestSchema.parse({ status })),
      });
      members.reload();
      toast.success(`${member.fullName} is now ${status}.`);
    } catch (cause) {
      fail(cause, "Could not update that account.");
    } finally {
      setBusyId(null);
    }
  }

  async function addStudent() {
    if (!schoolId || !newStudent.gradeLevel) {
      setError("Choose the form this student joins.");
      return;
    }
    setSavingStudent(true);
    setError(null);
    try {
      await api(`/api/schools/${schoolId}/enrollments`, mutationResultSchema, {
        method: "POST",
        body: JSON.stringify(
          createEnrollmentRequestSchema.parse({
            fullName: newStudent.fullName.trim(),
            studentIdentifier: newStudent.studentIdentifier.trim(),
            gradeLevel: newStudent.gradeLevel,
            guardianPhone: newStudent.guardianPhone.trim() ? newStudent.guardianPhone.trim() : null,
          })
        ),
      });
      students.reload();
      classes.reload();
      setAddStudentOpen(false);
      const name = newStudent.fullName.trim();
      setNewStudent({ fullName: "", studentIdentifier: "", gradeLevel: newStudent.gradeLevel, guardianPhone: "" });
      toast.success(`${name} enrolled.`);
    } catch (cause) {
      fail(cause, "Could not enrol that student.");
    } finally {
      setSavingStudent(false);
    }
  }

  async function resendInvite(member: Member) {
    setBusyId(member.membershipId);
    setError(null);
    try {
      await api(
        `/api/schools/${schoolId}/members/${member.membershipId}/invite`,
        z.object({ queued: z.boolean() }).passthrough(),
        { method: "POST" }
      );
      toast.success(`Set-password email sent to ${member.email}.`);
    } catch (cause) {
      fail(cause, "Could not send that email.");
    } finally {
      setBusyId(null);
    }
  }

  async function setAllTeachers(status: "active" | "suspended") {
    const from = status === "suspended" ? "active" : "suspended";
    const targets = staff.filter((row) => row.role === "teacher" && row.status === from);
    if (targets.length === 0) {
      toast.info(`No ${from} teaching accounts.`);
      return;
    }
    setBusyAll(true);
    setError(null);
    let done = 0;
    const failures: string[] = [];
    for (const member of targets) {
      try {
        await api(`/api/schools/${schoolId}/members/${member.membershipId}`, memberSchema.partial().passthrough(), {
          method: "PATCH",
          body: JSON.stringify(updateMemberRequestSchema.parse({ status })),
        });
        done += 1;
      } catch {
        failures.push(member.fullName);
      }
    }
    members.reload();
    setBusyAll(false);
    const word = status === "suspended" ? "suspended" : "reinstated";
    if (failures.length > 0) {
      setError(`${done} ${word}. Could not update: ${failures.join(", ")}`);
    } else {
      toast.success(`${done} teaching account${done === 1 ? "" : "s"} ${word}.`);
    }
  }

  const learnerColumns: Array<TableColumn<LearnerRow>> = [
    {
      key: "name",
      header: "Student",
      render: (row) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={row.fullName} size={26} />
          <span className="truncate font-semibold text-ink-800">{row.fullName}</span>
        </span>
      ),
    },
    {
      key: "identifier",
      header: "Admission no.",
      render: (row) => <span className="mono text-[12.5px] text-ink-600">{row.studentIdentifier ?? "—"}</span>,
    },
    {
      key: "form",
      header: "Class",
      render: (row) => (
        <span className="text-ink-600">{row.className}</span>
      ),
    },
    {
      key: "subjects",
      header: "Subjects",
      numeric: true,
      render: (row) => <span className="num">{row.subjectCount}</span>,
    },
    { key: "status", header: "Status", render: (row) => <Status value={row.status} /> },
    {
      key: "enrolled",
      header: "Enrolled",
      render: (row) => <span className="text-[12.5px] text-ink-500">{formatDate(row.enrolledAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      numeric: true,
      render: (row) => (
        <Btn size="sm" onClick={() => openEdit(row)}>
          Manage
        </Btn>
      ),
    },
  ];

  const staffColumns: Array<TableColumn<Member & { id: string }>> = [
    {
      key: "name",
      header: "Member",
      render: (row) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={row.fullName} size={26} />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink-800">{row.fullName}</span>
            <span className="block truncate text-[12.5px] text-ink-500">{row.email}</span>
          </span>
        </span>
      ),
    },
    { key: "role", header: "Role", render: (row) => <span className="text-ink-600">{roleLabel(row.role)}</span> },
    { key: "phone", header: "Phone", render: (row) => <span className="mono text-[12.5px] text-ink-600">{row.phone ?? "—"}</span> },
    {
      key: "registration",
      header: "Registration",
      render: (row) =>
        row.role === "platform_admin" ? (
          <span className="text-[13px] font-semibold text-ink-500">Platform staff</span>
        ) : (
          <RegistrationSignal awaiting={row.awaitingRegistration} />
        ),
    },
    { key: "status", header: "Account", render: (row) => <Status value={row.status} /> },
    {
      key: "login",
      header: "Last sign-in",
      render: (row) => <span className="text-[12.5px] text-ink-500">{formatRelative(row.lastLoginAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      numeric: true,
      render: (row) =>
        row.role === "platform_admin" ? (
          <span className="text-ink-500">—</span>
        ) : (
          <Btn
            size="sm"
            onClick={() => {
              setManageTarget(row);
              setError(null);
            }}
          >
            Manage
          </Btn>
        ),
    },
  ];

  const learnerProblems = learnerRows.filter((row) => row.error).length;
  const staffProblems = staffImportRows.filter((row) => row.error).length;

  const formIndex = schoolForms.indexOf(edit.gradeLevel);
  const demoteForm = formIndex > 0 ? schoolForms[formIndex - 1] : null;
  const promoteForm = formIndex >= 0 && formIndex < schoolForms.length - 1 ? schoolForms[formIndex + 1] : null;

  const credentialForEdit = editTarget
    ? (credentials.data ?? []).find((row) => row.enrollmentId === editTarget.enrollmentId) ?? null
    : null;


  const loadError = members.error ?? students.error ?? classes.error ?? null;

  return (
    <ConsolePage
      crumbs={[{ label: isStudents ? "Students" : "Teachers" }]}
      title={isStudents ? "Students" : "Teachers"}
      subtitle={
        isStudents
          ? "Every learner enrolled at your school, and the class each one sits in."
          : "The staff accounts at your school, and what each person can reach."
      }
      actions={
        <>
          <Btn
            onClick={() => {
              if (isStudents) setLearnerOpen(true);
              else setStaffOpen(true);
              setError(null);
            }}
            disabled={!schoolId}
          >
            <UploadSimple size={15} weight="bold" aria-hidden />
            Import list
          </Btn>
          {isStudents ? (
            <Btn
              variant="primary"
              onClick={() => {
                setAddStudentOpen(true);
                setError(null);
              }}
              disabled={!schoolId || (classes.data ?? []).length === 0}
            >
              Add student
            </Btn>
          ) : (
            <Btn
              variant="primary"
              onClick={() => {
                setInviteOpen(true);
                setError(null);
              }}
              disabled={!schoolId}
            >
              Add teacher
            </Btn>
          )}
        </>
      }
    >
      {loadError && (
        <p role="alert" className="mb-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {loadError}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {error}
        </p>
      )}

      <Panel
        className={isStudents && (classes.data ?? []).length === 0 ? "mt-4" : ""}
        title={isStudents ? "All students" : "Staff accounts"}
        meta={
          isStudents
            ? `${learnerList.length} of ${(students.data ?? []).length} learners`
            : `${staffRows.length} of ${staff.length} accounts`
        }
        action={
          isStudents ? (
            <Btn size="sm" loading={downloading} onClick={() => void downloadRegister()}>
              <DownloadSimple size={14} weight="bold" aria-hidden />
              Register
            </Btn>
          ) : undefined
        }
        padded={false}
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={isStudents ? "Name or admission number…" : "Name or email…"}
            className="min-w-[200px] flex-1 sm:max-w-[320px]"
          />
          {isStudents ? (
            <>
              <Select
                value={grade}
                onChange={setGrade}
                ariaLabel="Filter by form"
                className="w-full sm:w-[170px]"
                options={[
                  { value: "all", label: "All classes" },
                  ...schoolForms.map((level) => ({ value: level, label: level })),
                ]}
              />
            </>
          ) : (
            <>
              <Select
                value={staffFilter}
                onChange={(value) => setStaffFilter(value as typeof staffFilter)}
                ariaLabel="Filter staff"
                className="w-full sm:w-[190px]"
                options={[
                  { value: "all", label: "All staff" },
                  { value: "teachers", label: "Teachers" },
                  { value: "awaiting", label: "Not registered yet" },
                  { value: "suspended", label: "Suspended" },
                ]}
              />
              {staff.some((row) => row.role === "teacher" && row.status === "suspended") && (
                <Btn size="sm" loading={busyAll} onClick={() => void setAllTeachers("active")}>
                  Reinstate teachers
                </Btn>
              )}
              {staff.some((row) => row.role === "teacher" && row.status === "active") && (
                <Btn size="sm" loading={busyAll} onClick={() => void setAllTeachers("suspended")}>
                  Suspend teachers
                </Btn>
              )}
            </>
          )}
        </div>

        {isStudents ? (
          <ConsoleTable
            columns={learnerColumns}
            rows={learnerList}
            loading={students.loading}
            emptyMessage="No student matches those filters."
          />
        ) : (
          <ConsoleTable
            columns={staffColumns}
            rows={staffRows.map((row) => ({ ...row, id: row.membershipId }))}
            loading={members.loading}
            emptyMessage="No account matches those filters."
          />
        )}
      </Panel>

      <Dialog
        open={addStudentOpen}
        title="Add a student"
        description="Admit one learner to a form. They take every subject that form teaches."
        onClose={() => setAddStudentOpen(false)}
        footer={
          <>
            <Btn onClick={() => setAddStudentOpen(false)}>Cancel</Btn>
            <Btn
              variant="primary"
              loading={savingStudent}
              disabled={
                newStudent.fullName.trim().length < 2 ||
                newStudent.studentIdentifier.trim().length < 3 ||
                !newStudent.gradeLevel
              }
              onClick={() => void addStudent()}
            >
              Enrol
            </Btn>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <input
                value={newStudent.fullName}
                onChange={(event) => setNewStudent({ ...newStudent, fullName: event.target.value })}
                className="console-input"
              />
            </Field>
            <Field label="Class">
              <Select
                value={newStudent.gradeLevel}
                onChange={(value) => setNewStudent({ ...newStudent, gradeLevel: value })}
                ariaLabel="Class"
                options={[
                  { value: "", label: "Choose a form…" },
                  ...schoolForms.map((level) => ({ value: level, label: level })),
                ]}
              />
            </Field>
          </div>
          <Field label="Admission number">
            <input
              value={newStudent.studentIdentifier}
              onChange={(event) => setNewStudent({ ...newStudent, studentIdentifier: event.target.value })}
              placeholder="S0206/0047/2026"
              className="console-input"
            />
          </Field>
          <Field label="Guardian phone">
            <input
              value={newStudent.guardianPhone}
              onChange={(event) => setNewStudent({ ...newStudent, guardianPhone: event.target.value })}
              placeholder="+255…"
              className="console-input"
            />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={learnerOpen}
        title="Import students"
        description="Upload the class register, then choose the form these learners join."
        width="lg"
        onClose={() => setLearnerOpen(false)}
        footer={
          <>
            <Btn onClick={() => setLearnerOpen(false)}>Cancel</Btn>
            <Btn
              variant="primary"
              loading={importing}
              disabled={learnerRows.length === 0 || !learnerForm}
              onClick={() => void runLearnerImport()}
            >
              Import students
            </Btn>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Btn
              size="sm"
              onClick={() =>
                void downloadTemplate("elimuar-students-template.xlsx", "Students", LEARNER_TEMPLATE, LEARNER_NOTES)
              }
            >
              <DownloadSimple size={14} weight="bold" aria-hidden />
              Excel template
            </Btn>
            <input
              ref={learnerFile}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => void onLearnerFile(event.target.files?.[0])}
              className="text-[13px] text-ink-600"
            />
          </div>
          <Field label="Class">
            <Select
              value={learnerForm}
              onChange={setLearnerForm}
              ariaLabel="Class"
              options={[
                { value: "", label: "Choose a form…" },
                ...schoolForms.map((level) => ({ value: level, label: level })),
              ]}
            />
          </Field>

          {learnerRows.length > 0 && (
            <div className="rounded-xl border border-line">
              <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
                <span className="text-[13px] font-semibold text-ink-700">
                  {fileName || "Upload"} · {learnerRows.length} row{learnerRows.length === 1 ? "" : "s"}
                </span>
                {learnerProblems > 0 && (
                  <span className="text-[12.5px] font-semibold text-danger-600">{learnerProblems} need fixing</span>
                )}
              </div>
              <ul className="max-h-52 divide-y divide-line overflow-y-auto">
                {learnerRows.slice(0, 30).map((row, index) => (
                  <li key={`${row.studentIdentifier}-${index}`} className="flex items-center justify-between gap-3 px-3.5 py-1.5 text-[12.5px]">
                    <span className="truncate text-ink-700">
                      {row.fullName || <span className="text-ink-400">(no name)</span>}
                      <span className="mono ml-2 text-ink-500">{row.studentIdentifier || "—"}</span>
                    </span>
                    {row.error ? (
                      <span className="shrink-0 text-danger-600">{row.error}</span>
                    ) : (
                      <span className="shrink-0 text-ink-500">ready</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Dialog>

      <Dialog
        open={editTarget !== null}
        title={editTarget ? `Manage ${editTarget.fullName}` : "Manage student"}
        description="Their form, their login and their PIN — one learner, one place."
        width="lg"
        onClose={() => {
          setEditTarget(null);
          setConfirmAction(null);
        }}
        footer={
          <>
            <Btn
              onClick={() => {
                setEditTarget(null);
                setConfirmAction(null);
              }}
            >
              Cancel
            </Btn>
            <Btn variant="primary" loading={savingEdit} onClick={() => void saveLearner()}>
              Save changes
            </Btn>
          </>
        }
      >
        {editTarget && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Admission number">
                <input
                  value={edit.studentIdentifier}
                  onChange={(event) => setEdit({ ...edit, studentIdentifier: event.target.value })}
                  className="console-input mono"
                />
              </Field>
              <Field label="Class">
                <Select
                  value={edit.gradeLevel}
                  onChange={(value) => setEdit({ ...edit, gradeLevel: value })}
                  ariaLabel="Class"
                  options={[
                    ...schoolForms.map((level) => ({ value: level, label: level })),
                    ...(schoolForms.includes(edit.gradeLevel)
                      ? []
                      : [{ value: edit.gradeLevel, label: edit.gradeLevel }]),
                  ]}
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Btn size="sm" disabled={!demoteForm} onClick={() => moveForm(-1)}>
                {demoteForm ? `Move down to ${demoteForm}` : "Cannot move down"}
              </Btn>
              <Btn size="sm" disabled={!promoteForm} onClick={() => moveForm(1)}>
                {promoteForm ? `Move up to ${promoteForm}` : "Cannot move up"}
              </Btn>
            </div>

            {confirmAction ? (
              <div className="rounded-xl border border-danger-200 bg-danger-50 px-3.5 py-3">
                <p className="text-[13.5px] font-bold text-ink-800">
                  {confirmAction === "removed" ? "Remove this student?" : "Mark as transferred out?"}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-5 text-ink-600">
                  {confirmAction === "removed"
                    ? "They lose access and disappear from the register. Their teaching history stays on record."
                    : "They keep their history but leave this school's active register."}
                </p>
                <Field label="Your password" className="mt-3">
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="current-password"
                    className="console-input"
                  />
                </Field>
                <div className="mt-3 flex justify-end gap-2">
                  <Btn size="sm" onClick={() => setConfirmAction(null)}>
                    Cancel
                  </Btn>
                  <Btn size="sm" variant="danger" loading={confirmBusy} onClick={() => void confirmEnrolmentAction()}>
                    Confirm
                  </Btn>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
                <Btn size="sm" onClick={() => setConfirmAction("transferred")}>
                  Transfer out
                </Btn>
                <Btn size="sm" variant="danger" onClick={() => setConfirmAction("removed")}>
                  Remove student
                </Btn>
              </div>
            )}

            <section className="border-t border-line pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Login &amp; PIN</p>
              <dl className="mt-3 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[13px] text-ink-600">Login (admission number)</dt>
                  <dd className="mono text-[13px] font-semibold text-ink-800">{edit.studentIdentifier || "—"}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[13px] text-ink-600">PIN</dt>
                  <dd>
                    {credentialForEdit === null ? (
                      <span className="text-[13px] text-ink-400">…</span>
                    ) : credentialForEdit.pinIsAdmissionNumber ? (
                      <span className="text-[13px] font-semibold text-[#a3600a]">Still the default</span>
                    ) : (
                      <span className="text-[13px] font-semibold text-[#0f7a3d]">Changed by the learner</span>
                    )}
                  </dd>
                </div>
                {issuedPin && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-[13px] text-ink-600">New PIN — hand over in person</dt>
                    <dd className="mono text-[15px] font-bold text-ink-900">{issuedPin}</dd>
                  </div>
                )}
              </dl>
              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field label="Or set a chosen PIN">
                  <input
                    value={chosenPin}
                    onChange={(event) => setChosenPin(event.target.value)}
                    placeholder="4–12 characters"
                    className="console-input mono"
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Btn
                    size="sm"
                    loading={pinBusyId === editTarget.enrollmentId}
                    onClick={() => {
                      if (credentialForEdit) void resetPin(credentialForEdit);
                    }}
                  >
                    Reset PIN
                  </Btn>
                  <Btn
                    size="sm"
                    variant="primary"
                    loading={pinBusyId === editTarget.enrollmentId}
                    disabled={chosenPin.trim().length < 4}
                    onClick={() => {
                      if (credentialForEdit) void setPin(credentialForEdit, chosenPin.trim());
                    }}
                  >
                    Set this PIN
                  </Btn>
                </div>
              </div>
            </section>
          </div>
        )}
      </Dialog>

      <Dialog
        open={staffOpen}
        title="Import staff"
        description="Upload the staff list; each row becomes one account and one set-password email."
        width="lg"
        onClose={() => setStaffOpen(false)}
        footer={
          <>
            <Btn onClick={() => setStaffOpen(false)}>Close</Btn>
            <Btn
              variant="primary"
              loading={importing}
              disabled={staffImportRows.length === 0}
              onClick={() => void runStaffImport()}
            >
              Import accounts
            </Btn>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Btn
              size="sm"
              onClick={() => void downloadTemplate("elimuar-staff-template.xlsx", "Staff", STAFF_TEMPLATE, STAFF_NOTES)}
            >
              <DownloadSimple size={14} weight="bold" aria-hidden />
              Excel template
            </Btn>
            <input
              ref={staffFile}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => void onStaffFile(event.target.files?.[0])}
              className="text-[13px] text-ink-600"
            />
          </div>

          {staffImportRows.length > 0 && (
            <div className="rounded-xl border border-line">
              <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
                <span className="text-[13px] font-semibold text-ink-700">
                  {fileName || "Upload"} · {staffImportRows.length} row{staffImportRows.length === 1 ? "" : "s"}
                </span>
                {staffProblems > 0 && (
                  <span className="text-[12.5px] font-semibold text-danger-600">{staffProblems} need fixing</span>
                )}
              </div>
              <ul className="max-h-52 divide-y divide-line overflow-y-auto">
                {staffImportRows.slice(0, 30).map((row, index) => (
                  <li key={`${row.email}-${index}`} className="flex items-center justify-between gap-3 px-3.5 py-1.5 text-[12.5px]">
                    <span className="truncate text-ink-700">
                      {row.firstName} {row.lastName}
                      <span className="ml-2 text-ink-500">{row.email || "—"}</span>
                    </span>
                    {row.error ? (
                      <span className="shrink-0 text-danger-600">{row.error}</span>
                    ) : (
                      <span className="shrink-0 text-ink-500">{roleLabel(row.role)}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {staffResults.length > 0 && (
            <div className="rounded-xl border border-line">
              <p className="border-b border-line px-3.5 py-2.5 text-[13px] font-semibold text-ink-700">Result</p>
              <ul className="max-h-52 divide-y divide-line overflow-y-auto">
                {staffResults.map((row) => (
                  <li key={row.email} className="flex items-center justify-between gap-3 px-3.5 py-1.5 text-[12.5px]">
                    <span className="truncate text-ink-700">{row.name}</span>
                    {row.error ? (
                      <span className="shrink-0 text-danger-600">{row.error}</span>
                    ) : (
                      <span className="shrink-0 text-ink-500">emailed a set-password link</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Dialog>

      <Dialog
        open={inviteOpen}
        title="Add a teacher"
        description="Create one staff account; they set their own password from the email."
        width="lg"
        onClose={() => setInviteOpen(false)}
        footer={
          <>
            <Btn onClick={() => setInviteOpen(false)}>Cancel</Btn>
            <Btn
              variant="primary"
              loading={inviting}
              disabled={!invite.firstName.trim() || !invite.lastName.trim() || !invite.email.includes("@")}
              onClick={() => void inviteStaff()}
            >
              Create account
            </Btn>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name">
              <input
                value={invite.firstName}
                onChange={(event) => setInvite({ ...invite, firstName: event.target.value })}
                className="console-input"
              />
            </Field>
            <Field label="Last name">
              <input
                value={invite.lastName}
                onChange={(event) => setInvite({ ...invite, lastName: event.target.value })}
                className="console-input"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="School email">
              <input
                type="email"
                value={invite.email}
                onChange={(event) => setInvite({ ...invite, email: event.target.value })}
                placeholder="teacher4@s0206.elimuar.tz"
                className="console-input"
              />
            </Field>
            <Field label="Phone">
              <input
                value={invite.phone}
                onChange={(event) => setInvite({ ...invite, phone: event.target.value })}
                className="console-input"
              />
            </Field>
          </div>
          <Field label="Role">
            <Select
              value={invite.role}
              onChange={(value) => setInvite({ ...invite, role: value as typeof invite.role })}
              ariaLabel="Role"
              options={STAFF_ROLES}
            />
          </Field>

          <Note>
            After adding a teacher, choose the subjects they teach in each class under Classes &amp; Subjects → Subjects.
          </Note>
        </div>
      </Dialog>

      <Dialog
        open={manageTarget !== null}
        title={manageTarget ? `Manage ${manageTarget.fullName}` : "Manage account"}
        width="lg"
        onClose={() => setManageTarget(null)}
        footer={<Btn onClick={() => setManageTarget(null)}>Close</Btn>}
      >
        {manageTarget && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
              {[
                ["Email", manageTarget.email],
                ["Phone", manageTarget.phone ?? "not recorded"],
                ["Role", roleLabel(manageTarget.role)],
                ["Last sign-in", formatRelative(manageTarget.lastLoginAt)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-500">{label}</dt>
                  <dd className="mt-0.5 truncate text-[13px] text-ink-800">{value}</dd>
                </div>
              ))}
            </dl>

            <section className="border-t border-line pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Registration</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <RegistrationSignal awaiting={manageTarget.awaitingRegistration} />
                <Btn
                  size="sm"
                  disabled={!manageTarget.awaitingRegistration}
                  loading={busyId === manageTarget.membershipId}
                  onClick={() => void resendInvite(manageTarget)}
                >
                  Resend invitation
                </Btn>
              </div>
            </section>

            {manageTarget.role !== "student" && schoolId && (
              <TeachingPanel schoolId={schoolId} teacherId={manageTarget.userId} role={manageTarget.role} />
            )}

            <section className="border-t border-line pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">Access</p>
                <p className="text-[12.5px] text-ink-500">
                  Now: <Status value={manageTarget.status} />
                </p>
              </div>
              <ul className="mt-3 space-y-2.5">
                {([
                  ["active", "Reinstate", "Signs in normally again."],
                  ["suspended", "Suspend", "Signed out, and blocked from signing in."],
                  ["transferred", "Transfer out", "Leaves this school. Another head can then take them on."],
                  ["removed", "Remove", "Loses access. The teaching history stays."],
                ] as const)
                  .filter(([state]) => manageTarget.status !== state)
                  .map(([state, action, meaning]) => (
                    <li key={state} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 text-[13px] text-ink-600">{meaning}</span>
                      <Btn
                        size="sm"
                        variant={state === "removed" ? "danger" : "outline"}
                        loading={busyId === manageTarget.membershipId}
                        onClick={() => void setMemberStatus(manageTarget, state)}
                      >
                        {action}
                      </Btn>
                    </li>
                  ))}
              </ul>
            </section>
          </div>
        )}
      </Dialog>

      <span className="sr-only" aria-live="polite">
        {importing ? "Importing…" : learnerProblems > 0 || staffProblems > 0 ? "Some rows need fixing." : ""}
      </span>
    </ConsolePage>
  );
}
