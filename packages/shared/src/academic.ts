import { z } from "zod";

export const DEFAULT_GRADE_LEVELS: readonly string[] = ["Form 1", "Form 2", "Form 3", "Form 4"];

/** The O-level subjects a Tanzanian secondary school teaches. */
export const CORE_SUBJECTS: readonly string[] = [
  "Basic Mathematics",
  "English Language",
  "Kiswahili",
  "Biology",
  "Chemistry",
  "Physics",
  "Geography",
  "History",
  "Civics",
];
export const OPTIONAL_SUBJECTS: readonly string[] = ["Computer Science", "Literature in English", "Book-keeping", "Commerce"];
export const DEFAULT_SUBJECTS: readonly string[] = [...CORE_SUBJECTS, ...OPTIONAL_SUBJECTS];

export const registerStatusSchema = z.enum(["active", "archived"]);
export type RegisterStatus = z.infer<typeof registerStatusSchema>;

export const academicClassSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  position: z.number().int(),
  status: registerStatusSchema,
  lessonCount: z.number().int(),
  studentCount: z.number().int(),
});
export type AcademicClass = z.infer<typeof academicClassSchema>;

export const academicSubjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string().nullable(),
  status: registerStatusSchema,
  lessonCount: z.number().int(),
});
export type AcademicSubject = z.infer<typeof academicSubjectSchema>;

export const schoolClassUseSchema = z.object({
  id: z.string().uuid(),
  subject: z.string(),
  academicYear: z.string(),
  studentCount: z.number().int(),
  teacherNames: z.array(z.string()),
});
export type SchoolClassUse = z.infer<typeof schoolClassUseSchema>;

export const schoolFormUseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: registerStatusSchema,
  classes: z.array(schoolClassUseSchema),
  studentCount: z.number().int(),
  teacherNames: z.array(z.string()),
});
export type SchoolFormUse = z.infer<typeof schoolFormUseSchema>;

export const schoolSubjectUseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string().nullable(),
  status: registerStatusSchema,
  classCount: z.number().int(),
  studentCount: z.number().int(),
  teacherNames: z.array(z.string()),
});
export type SchoolSubjectUse = z.infer<typeof schoolSubjectUseSchema>;

export const schoolAcademicSchema = z.object({
  forms: z.array(schoolFormUseSchema),
  subjects: z.array(schoolSubjectUseSchema),
});
export type SchoolAcademic = z.infer<typeof schoolAcademicSchema>;

export const createAcademicClassRequestSchema = z.object({
  name: z.string().trim().min(2, "Give the class a name, for example Form 5").max(40),
  position: z.number().int().min(0).max(999).optional(),
});
export type CreateAcademicClassRequest = z.infer<typeof createAcademicClassRequestSchema>;

export const createAcademicSubjectRequestSchema = z.object({
  name: z.string().trim().min(2, "Give the subject a name, for example Biology").max(80),
  code: z.string().trim().min(2).max(12).nullable().optional(),
});
export type CreateAcademicSubjectRequest = z.infer<typeof createAcademicSubjectRequestSchema>;

export const updateAcademicRegisterEntryRequestSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  code: z.string().trim().min(2).max(12).nullable().optional(),
  status: registerStatusSchema.optional(),
});
export type UpdateAcademicRegisterEntryRequest = z.infer<typeof updateAcademicRegisterEntryRequestSchema>;

// ---- what each class studies (Classes & Subjects) -------------------------------------

/** One subject in one class: its teacher, and who takes it. */
export const classSubjectSchema = z.object({
  id: z.string().uuid(),
  classId: z.string().uuid(),
  className: z.string(),
  subject: z.string(),
  allStudents: z.boolean(),
  teacherId: z.string().uuid().nullable(),
  teacherName: z.string().nullable(),
  studentCount: z.number().int(),
  classSize: z.number().int(),
  studentIds: z.array(z.string().uuid()),
});
export type ClassSubject = z.infer<typeof classSubjectSchema>;

/** A subject as the school teaches it: every class it is taught in. */
export const schoolSubjectSchema = z.object({
  name: z.string(),
  classes: z.array(classSubjectSchema),
  studentCount: z.number().int(),
  teacherNames: z.array(z.string()),
});
export type SchoolSubject = z.infer<typeof schoolSubjectSchema>;

export const schoolSubjectsResponseSchema = z.object({
  subjects: z.array(schoolSubjectSchema),
  catalogue: z.array(z.string()),
});
export type SchoolSubjectsResponse = z.infer<typeof schoolSubjectsResponseSchema>;

/** Start teaching a subject: in every class, or in the classes chosen. */
export const createSchoolSubjectRequestSchema = z.object({
  subject: z.string().trim().min(2, "Give the subject a name, for example Biology").max(80),
  classIds: z.array(z.string().uuid()).min(1, "Choose at least one class"),
  allStudents: z.boolean().default(true),
});
export type CreateSchoolSubjectRequest = z.infer<typeof createSchoolSubjectRequestSchema>;

/** Change one class's subject: its teacher, and whether everyone or chosen learners take it. */
export const updateClassSubjectRequestSchema = z.object({
  teacherId: z.string().uuid().nullable().optional(),
  allStudents: z.boolean().optional(),
  studentIds: z.array(z.string().uuid()).optional(),
});
export type UpdateClassSubjectRequest = z.infer<typeof updateClassSubjectRequestSchema>;
