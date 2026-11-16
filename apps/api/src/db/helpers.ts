import { randomUUID } from "node:crypto";
import { eq, inArray, type SQL } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { db } from "./client.js";

export const newId = (): string => randomUUID();

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function insertReturning<T extends MySqlTable>(
  table: T,
  values: Omit<T["$inferInsert"], "id"> & { id?: string }
): Promise<T["$inferSelect"]> {
  const id = (values.id as string | undefined) ?? newId();
  await db
    .insert(table as any)
    .values({ ...(values as object), id } as any);
  const [row] = await db
    .select()
    .from(table as any)
    .where(eq((table as any).id, id))
    .limit(1);
  return row as T["$inferSelect"];
}

export async function insertManyReturning<T extends MySqlTable>(
  table: T,
  values: Array<Omit<T["$inferInsert"], "id"> & { id?: string }>
): Promise<T["$inferSelect"][]> {
  if (values.length === 0) return [];
  const ids = values.map((row) => (row.id as string | undefined) ?? newId());
  await db
    .insert(table as any)
    .values(values.map((row, index) => ({ ...(row as object), id: ids[index] })) as any);
  const rows = (await db
    .select()
    .from(table as any)
    .where(inArray((table as any).id, ids))) as T["$inferSelect"][];
  const byId = new Map(rows.map((row: any) => [row.id, row]));
  return ids.map((id) => byId.get(id) as T["$inferSelect"]);
}

export async function updateReturning<T extends MySqlTable>(
  table: T,
  set: Partial<T["$inferInsert"]>,
  where: SQL
): Promise<T["$inferSelect"] | undefined> {
  await db
    .update(table as any)
    .set(set as any)
    .where(where);
  const [row] = await db
    .select()
    .from(table as any)
    .where(where)
    .limit(1);
  return row as T["$inferSelect"] | undefined;
}

export async function deleteReturning<T extends MySqlTable>(
  table: T,
  where: SQL
): Promise<T["$inferSelect"] | undefined> {
  const [row] = await db
    .select()
    .from(table as any)
    .where(where)
    .limit(1);
  await db
    .delete(table as any)
    .where(where);
  return row as T["$inferSelect"] | undefined;
}
