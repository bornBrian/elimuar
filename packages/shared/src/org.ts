import { z } from "zod";
import { membershipStatusSchema, roleSchema } from "./auth.js";
import { emailSchema, nameSchema, phoneSchema, studentIdentifierSchema } from "./validate.js";

export const regionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
});
export const districtSchema = z.object({
  id: z.string().uuid(),
  regionId: z.string().uuid(),
  name: z.string(),
});

export const schoolLevelSchema = z.enum(["primary", "secondary"]);
export type SchoolLevel = z.infer<typeof schoolLevelSchema>;

export const createRegionRequestSchema = z.object({
  name: z.string().trim().min(3).max(80),
  code: z
    .string()
    .trim()
    .min(2)
    .max(8)
    .regex(/^[A-Z0-9]+$/, "Use capital letters and numbers only"),
});
export type CreateRegionRequest = z.infer<typeof createRegionRequestSchema>;

export const createDistrictRequestSchema = z.object({
  regionId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
});
export type CreateDistrictRequest = z.infer<typeof createDistrictRequestSchema>;
export const schoolSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  districtId: z.string().uuid(),
  regionName: z.string(),
  districtName: z.string(),
  level: schoolLevelSchema,
  status: z.enum(["active", "suspended", "pending"]),
  headName: z.string().nullable(),
  studentCount: z.number().int(),
  createdAt: z.string(),
});
export type School = z.infer<typeof schoolSchema>;

export const gradeLevelSchema = z.string().trim().min(1).max(40);
export type GradeLevel = z.infer<typeof gradeLevelSchema>;

export const classSchema = z.object({
  id: z.string().uuid(),
  schoolId: z.string().uuid(),
  name: z.string(),
  gradeLevel: gradeLevelSchema,
  stream: z.string().nullable(),
  academicYear: z.string(),
  status: z.enum(["active", "archived"]),
  studentCount: z.number().int(),
  subjectCount: z.number().int(),
  assignedLessons: z.number().int(),
  teacherNames: z.array(z.string()),
});
export type ClassSummary = z.infer<typeof classSchema>;

export const teacherClassSchema = z.object({
  classId: z.string().uuid(),
  className: z.string(),
  gradeLevel: gradeLevelSchema,
  subject: z.string(),
});
export type TeacherClass = z.infer<typeof teacherClassSchema>;

export const schoolProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  status: z.enum(["active", "suspended", "pending"]),
  districtName: z.string(),
  regionName: z.string(),
  masteryThresholdPercent: z.number().int().min(0).max(100),
  engagementWindowDays: z.number().int().min(7).max(90),
  defaultPin: z.string().max(12),
  gradeBands: z.array(z.object({ min: z.number().int(), label: z.string() })),
});
export type SchoolProfile = z.infer<typeof schoolProfileSchema>;

export const updateSchoolSettingsRequestSchema = z.object({
  masteryThresholdPercent: z.number().int().min(0).max(100).optional(),
  engagementWindowDays: z.number().int().min(7).max(90).optional(),
  defaultPin: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "PIN must be 4-8 digits")
    .or(z.literal(""))
    .optional(),
  gradeBands: z
    .array(z.object({ min: z.number().int().min(0).max(100), label: z.string().trim().min(1).max(12) }))
    .max(6)
    .optional(),
});
export type UpdateSchoolSettingsRequest = z.infer<typeof updateSchoolSettingsRequestSchema>;

export const staffSummarySchema = z.object({ teachers: z.number().int() });
export type StaffSummary = z.infer<typeof staffSummarySchema>;

export const createSchoolRequestSchema = z.object({
  name: z.string().trim().min(2).max(180),
  code: z.string().trim().min(2).max(24),
  districtId: z.string().uuid(),
  level: schoolLevelSchema.default("secondary"),
});
export type CreateSchoolRequest = z.infer<typeof createSchoolRequestSchema>;

export const updateSchoolRequestSchema = z.object({
  status: z.enum(["active", "suspended", "pending"]),
});
export type UpdateSchoolRequest = z.infer<typeof updateSchoolRequestSchema>;

export const createClassRequestSchema = z.object({
  name: z.string().trim().min(2).max(120),
  gradeLevel: gradeLevelSchema,
  stream: z.string().trim().max(12).nullable().optional(),
  academicYear: z.string().trim().min(4).max(9),
});
export type CreateClassRequest = z.infer<typeof createClassRequestSchema>;

export const assignTeacherRequestSchema = z.object({
  teacherId: z.string().uuid(),
  classId: z.string().uuid(),
  subject: z.string().trim().min(1).max(80),
});
export type AssignTeacherRequest = z.infer<typeof assignTeacherRequestSchema>;

export const teachingAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  teacherId: z.string().uuid(),
  teacherName: z.string(),
  classId: z.string().uuid(),
  className: z.string(),
  gradeLevel: gradeLevelSchema,
  subject: z.string(),
});
export type TeachingAssignment = z.infer<typeof teachingAssignmentSchema>;

export const directoryUserSchema = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  role: roleSchema,
  status: membershipStatusSchema,
  schoolId: z.string().uuid().nullable(),
  schoolName: z.string().nullable(),
  regionName: z.string().nullable(),
  districtName: z.string().nullable(),
  lastLoginAt: z.string().nullable(),
  awaitingRegistration: z.boolean(),
});
export type DirectoryUser = z.infer<typeof directoryUserSchema>;

export const provisionedMemberSchema = z.object({
  userId: z.string().uuid(),
  membership: z
    .object({
      id: z.string().uuid(),
      role: roleSchema,
      status: membershipStatusSchema,
      schoolId: z.string().uuid().nullable(),
    })
    .passthrough(),
  invited: z.boolean().default(true),
});
export type ProvisionedMember = z.infer<typeof provisionedMemberSchema>;

export const enrolledStudentSchema = z.object({
  enrollmentId: z.string().uuid(),
  studentId: z.string().uuid(),
  fullName: z.string(),
  studentIdentifier: z.string().nullable(),
  classId: z.string().uuid(),
  className: z.string(),
  gradeLevel: gradeLevelSchema,
  stream: z.string().nullable(),
  subjectCount: z.number().int(),
  subjects: z.array(z.string()).default([]),
  status: z.enum(["active", "transferred", "withdrawn", "completed", "removed"]),
  enrolledAt: z.string(),
});
export type EnrolledStudent = z.infer<typeof enrolledStudentSchema>;

export const memberSchema = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid(),
  fullName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  role: roleSchema,
  status: membershipStatusSchema,
  lastLoginAt: z.string().nullable(),
  claimedAt: z.string().nullable(),
  awaitingRegistration: z.boolean(),
});
export type Member = z.infer<typeof memberSchema>;

export const inviteMemberRequestSchema = z.object({
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema.optional(),
  role: z.enum(["teacher", "academic_master", "secretary"]),
  classIds: z.array(z.string().uuid()).optional(),
});
export type InviteMemberRequest = z.infer<typeof inviteMemberRequestSchema>;

export const updateMemberRequestSchema = z.object({
  status: membershipStatusSchema.optional(),
  role: z.enum(["teacher", "academic_master", "secretary"]).optional(),
});

export const createEnrollmentRequestSchema = z.object({
  fullName: nameSchema,
  studentIdentifier: studentIdentifierSchema,
  gradeLevel: gradeLevelSchema,
  guardianPhone: phoneSchema.nullable().optional(),
});
export type CreateEnrollmentRequest = z.infer<typeof createEnrollmentRequestSchema>;

export const promoteAcademicYearRequestSchema = z.object({
  academicYear: z.string().trim().min(4).max(9),
  preview: z.boolean().default(false),
});
export type PromoteAcademicYearRequest = z.infer<typeof promoteAcademicYearRequestSchema>;

export const promoteAcademicYearResultSchema = z.object({
  academicYear: z.string(),
  classesCreated: z.number().int(),
  studentsPromoted: z.number().int(),
  studentsCompleted: z.number().int(),
  classesArchived: z.number().int(),
  movement: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      classes: z.number().int(),
      students: z.number().int(),
    })
  ),
});
export type PromoteAcademicYearResult = z.infer<typeof promoteAcademicYearResultSchema>;

export const rosterImportRowSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  studentIdentifier: z.string().trim().min(3).max(40),
  guardianPhone: z.string().trim().min(7).max(20).optional(),
});
export const rosterImportRequestSchema = z.object({
  gradeLevel: gradeLevelSchema,
  rows: z.array(rosterImportRowSchema).min(1).max(1000),
});
export const rosterImportResultSchema = z.object({
  created: z.number().int(),
  skipped: z.number().int(),
  errors: z.array(z.object({ row: z.number().int(), message: z.string() })),
});
export type RosterImportResult = z.infer<typeof rosterImportResultSchema>;

export const updateEnrollmentRequestSchema = z.object({
  status: z.enum(["active", "transferred", "withdrawn", "removed"]).optional(),
  studentIdentifier: z.string().trim().min(3).max(40).optional(),
  guardianPhone: z.string().trim().min(7).max(20).nullable().optional(),
  gradeLevel: gradeLevelSchema.optional(),
});
export type UpdateEnrollmentRequest = z.infer<typeof updateEnrollmentRequestSchema>;
