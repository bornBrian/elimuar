import { z } from "zod";
import { emailSchema, nameSchema, passwordSchema, phoneSchema } from "./validate.js";
import type { GradeLevel } from "./org.js";
export type { GradeLevel };

export const roleSchema = z.enum([
  "platform_admin",
  "school_admin",
  "academic_master",
  "secretary",
  "teacher",
  "student",
]);
export type Role = z.infer<typeof roleSchema>;

export const SCHOOL_STAFF_MANAGER_ROLES: Role[] = [
  "school_admin",
  "academic_master",
  "secretary",
];

export const WEB_ROLES: Role[] = ["platform_admin", "school_admin", "academic_master", "secretary"];

export const membershipStatusSchema = z.enum(["active", "suspended", "transferred", "removed"]);
export type MembershipStatus = z.infer<typeof membershipStatusSchema>;

export const studentLoginRequestSchema = z.object({
  schoolId: z.string().uuid().optional(),
  studentIdentifier: z.string().trim().min(3).max(40),
  password: z.string().min(4).max(128),
});
export type StudentLoginRequest = z.infer<typeof studentLoginRequestSchema>;

export const schoolChoiceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string(),
  level: z.string(),
  districtName: z.string().nullable(),
  regionName: z.string().nullable(),
});

export const loginRequestSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  password: z.string().min(4).max(128),
  intent: roleSchema.optional(),
  portal: z.boolean().optional(),
  asRole: z.enum(["student"]).optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const membershipSchema = z.object({
  membershipId: z.string().uuid(),
  role: roleSchema,
  status: membershipStatusSchema,
  schoolId: z.string().uuid().nullable(),
  schoolName: z.string().nullable(),
});
export type Membership = z.infer<typeof membershipSchema>;

export const sessionUserSchema = z.object({
  userId: z.string().uuid(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  schoolId: z.string().uuid().nullable(),
  schoolName: z.string().nullable(),
  className: z.string().nullable().default(null),
  studentIdentifier: z.string().nullable().default(null),
  avatarUrl: z.string().nullable(),
  role: roleSchema,
  memberships: z.array(membershipSchema),
  mustChangePassword: z.boolean().default(false),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const authTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresInSeconds: z.number().int(),
});

export const loginResponseSchema = z.object({
  user: sessionUserSchema,
  tokens: authTokensSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const refreshRequestSchema = z.object({ refreshToken: z.string().min(10) });
export const refreshResponseSchema = z.object({ tokens: authTokensSchema });

export const meResponseSchema = z.object({ user: sessionUserSchema });
export type MeResponse = z.infer<typeof meResponseSchema>;

export const registerVerifyRequestSchema = z.object({
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  phone: phoneSchema.optional(),
});

export const registerVerifyResultSchema = z.object({
  maskedEmail: z.string(),
  expiresInSeconds: z.number().int(),
});

export const registerVerifyCodeRequestSchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().min(4).max(8),
});

export const registerVerifyCodeResultSchema = z.object({
  registrationToken: z.string(),
  expiresInSeconds: z.number().int(),
  account: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    role: roleSchema,
    schoolName: z.string().nullable(),
  }),
});

export const registerCompleteRequestSchema = z.object({
  registrationToken: z.string().min(10),
  password: passwordSchema,
});

export const registerCompleteResultSchema = loginResponseSchema;

export const registerContextRequestSchema = z.object({
  token: z.string().min(10),
});

export const registerContextResultSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  role: roleSchema,
  schoolName: z.string().nullable(),
  isReset: z.boolean(),
  expiresInSeconds: z.number().int(),
});

export const passwordRequestSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
});
export const passwordRequestResultSchema = z.object({
  sent: z.boolean(),
  channel: z.enum(["email", "sms"]),
  expiresInSeconds: z.number().int(),
});

export const passwordVerifyRequestSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  code: z.string().trim().min(4).max(8),
});
export const passwordVerifyResultSchema = z.object({
  resetToken: z.string(),
  expiresInSeconds: z.number().int(),
});

export const passwordResetRequestSchema = z.object({
  resetToken: z.string().min(10),
  newPassword: passwordSchema,
});
export const passwordResetResultSchema = z.object({ message: z.string() });

export const passwordChangeRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
  refreshToken: z.string().min(10).optional(),
});
export const passwordChangeResultSchema = z.object({
  message: z.string(),
  otherSessionsEnded: z.number().int(),
});

export const revokeSessionsResultSchema = z.object({
  message: z.string(),
  revoked: z.number().int(),
});

export const updateProfileRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  phone: z.string().trim().min(7).max(20).nullable().optional(),
  locale: z.enum(["en", "sw"]).optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export const emailChangeRequestSchema = z.object({
  newEmail: z.string().trim().email(),
});
export const emailChangeRequestResultSchema = z.object({
  sent: z.boolean(),
  expiresInSeconds: z.number().int(),
  currentEmailMasked: z.string(),
});

export const emailChangeConfirmRequestSchema = z.object({
  code: z.string().trim().min(4).max(8),
  newEmail: z.string().trim().email(),
});
export const emailChangeConfirmResultSchema = z.object({
  message: z.string(),
  user: sessionUserSchema,
});

export const studentCredentialSchema = z.object({
  enrollmentId: z.string().uuid(),
  studentId: z.string().uuid(),
  fullName: z.string(),
  studentIdentifier: z.string().nullable(),
  className: z.string(),
  gradeLevel: z.string(),
  status: z.string(),
  pinChangedAt: z.string().nullable(),
  pinIsAdmissionNumber: z.boolean(),
});
export type StudentCredential = z.infer<typeof studentCredentialSchema>;

export const resetStudentPinResultSchema = z.object({
  message: z.string(),
  newPin: z.string().optional(),
});

export const setStudentPinRequestSchema = z.object({
  newPin: z.string().trim().min(4).max(12),
});

export const staffCredentialSchema = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid(),
  fullName: z.string(),
  email: z.string(),
  role: roleSchema,
  status: membershipStatusSchema,
  lastLoginAt: z.string().nullable(),
  awaitingRegistration: z.boolean(),
});
export type StaffCredential = z.infer<typeof staffCredentialSchema>;

export const resetStaffPasswordResultSchema = z.object({
  message: z.string(),
  emailed: z.boolean(),
});

export const auditEventSchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  actorName: z.string().nullable(),
  actorRole: z.string().nullable(),
  schoolName: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  ip: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
