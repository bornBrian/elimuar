import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema.js";

export const pool = mysql.createPool({
  uri: process.env.DATABASE_URL ?? "mysql://elimuar:elimuar_dev@127.0.0.1:3306/elimuar",
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0,
  dateStrings: true,
  timezone: "Z",
});

export const db = drizzle(pool, { schema, mode: "default" });
export type Database = typeof db;
export { schema };
