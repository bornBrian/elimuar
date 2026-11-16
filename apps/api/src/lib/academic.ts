import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { gradeLevels, subjects } from "../db/schema.js";
import { HttpError } from "./http.js";

export async function requireForm(name: string): Promise<string> {
  const [row] = await db
    .select({ name: gradeLevels.name, status: gradeLevels.status })
    .from(gradeLevels)
    .where(eq(gradeLevels.name, name))
    .limit(1);

  if (!row) {
    throw HttpError.badRequest(`"${name}" is not a class in the register. Add it under Academic Structure first.`);
  }
  if (row.status !== "active") {
    throw HttpError.badRequest(`"${name}" has been retired from the class register and cannot be taught.`);
  }
  return row.name;
}

export async function requireSubject(name: string): Promise<string> {
  const [row] = await db
    .select({ name: subjects.name, status: subjects.status })
    .from(subjects)
    .where(eq(subjects.name, name))
    .limit(1);

  if (!row) {
    throw HttpError.badRequest(`"${name}" is not a subject in the register. Add it under Academic Structure first.`);
  }
  if (row.status !== "active") {
    throw HttpError.badRequest(`"${name}" has been retired from the subject register and cannot be taught.`);
  }
  return row.name;
}
