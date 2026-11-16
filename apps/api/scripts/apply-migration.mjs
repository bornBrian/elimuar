#!/usr/bin/env node
/** Applies one hand-written SQL migration: node scripts/apply-migration.mjs migrations/<file>.sql */
const ALLOW_DESTRUCTIVE = process.argv.includes("--allow-destructive");
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import mysql from "mysql2/promise";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-migration.mjs <path/to/migration.sql>");
  process.exit(1);
}

const path = resolve(process.cwd(), file);
const sql = readFileSync(path, "utf8");

/* Statements that destroy data first and ask questions later. */
const FORBIDDEN = [
  { pattern: /\btruncate\b/i, why: "TRUNCATE clears a table outright" },
  { pattern: /\bdrop\s+table\b/i, why: "DROP TABLE removes a table and its rows" },
  { pattern: /\bdrop\s+column\b/i, why: "DROP COLUMN discards a column's data" },
  { pattern: /\bdrop\s+database\b/i, why: "DROP DATABASE removes everything" },
  { pattern: /\bdelete\s+from\b/i, why: "DELETE removes rows; write it deliberately if you must" },
];

const offences = FORBIDDEN.filter((rule) => rule.pattern.test(sql));
if (offences.length > 0 && !ALLOW_DESTRUCTIVE) {
  console.error(`Refusing to apply ${path} — it contains a destructive statement:`);
  for (const offence of offences) console.error(`  · ${offence.why}`);
  console.error("Split the destructive part into its own reviewed, explicitly-named migration.");
  console.error("If this one is destructive on purpose, re-run it with --allow-destructive.");
  process.exit(1);
}
if (offences.length > 0) {
  console.warn("WARNING: running a destructive migration because --allow-destructive was given:");
  for (const offence of offences) console.warn(`  · ${offence.why}`);
}

/* Only additive work reaches this point; report what it is before doing it. */
const statements = sql
  .split(/;\s*$/m)
  .map((chunk) =>
    chunk
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim()
  )
  .filter((chunk) => chunk.length > 0);

console.log(`Applying ${file} — ${statements.length} statement(s)`);
for (const statement of statements) {
  const firstLine = statement.split("\n")[0].trim();
  console.log(`  · ${firstLine.slice(0, 96)}${firstLine.length > 96 ? "…" : ""}`);
}

const connection = await mysql.createConnection({
  uri: process.env.DATABASE_URL ?? "mysql://elimuar:elimuar_dev@127.0.0.1:3306/elimuar",
  multipleStatements: true,
});

try {
  for (const statement of statements) {
    await connection.query(statement);
  }
  console.log("Done. Run `npx drizzle-kit push` to confirm there is no drift.");
} finally {
  await connection.end();
}
