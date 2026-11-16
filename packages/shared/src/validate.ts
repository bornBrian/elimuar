import { z } from "zod";

export function normalisePhone(raw: string): string {
  return raw.replace(/[\s\-()]/g, "");
}

export const phoneSchema = z
  .string()
  .trim()
  .transform(normalisePhone)
  .refine(
    (value) => /^(\+?\d{1,3})?\d{9,12}$/.test(value),
    "Use a valid phone number, e.g. +255712345678 or 0712345678"
  );

export const nameSchema = z
  .string()
  .trim()
  .min(2, "Too short")
  .max(60, "Too long")
  .regex(/^[A-Za-z\u00C0-\u024F' .-]+$/, "Letters, spaces, apostrophes and hyphens only");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(180);

export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(128)
  .refine((value) => /[A-Za-z]/.test(value), "Include at least one letter")
  .refine((value) => /\d/.test(value), "Include at least one digit");

export const studentIdentifierSchema = z
  .string()
  .trim()
  .min(3, "At least 3 characters")
  .max(40)
  .regex(/^[A-Za-z0-9/-]+$/, "Letters, digits, slashes and hyphens only");

export const pinSchema = z
  .string()
  .regex(/^\d{4,8}$/, "4–8 digits");
