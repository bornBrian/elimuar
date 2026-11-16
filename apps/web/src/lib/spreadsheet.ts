"use client";

export interface TemplateColumn {
  header: string;
  sample: string;
  width?: number;
}

export async function downloadTemplate(
  filename: string,
  sheetName: string,
  columns: TemplateColumn[],
  notes: string[] = []
): Promise<void> {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([columns.map((column) => column.header), columns.map((column) => column.sample)]);
  sheet["!cols"] = columns.map((column) => ({ wch: column.width ?? Math.max(14, column.header.length + 4) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));

  if (notes.length > 0) {
    const notesSheet = XLSX.utils.aoa_to_sheet([["Notes"], ...notes.map((note) => [note])]);
    notesSheet["!cols"] = [{ wch: 96 }];
    XLSX.utils.book_append_sheet(workbook, notesSheet, "Notes");
  }

  XLSX.writeFile(workbook, filename);
}

export async function readSheetRows(file: File): Promise<Array<Record<string, string>>> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const matrix = XLSX.utils.sheet_to_json<Array<string | number>>(sheet, { header: 1, blankrows: false, defval: "" });
  if (matrix.length < 2) return [];

  const header = matrix[0].map((cell) => String(cell).trim().toLowerCase());
  return matrix
    .slice(1)
    .map((row) => Object.fromEntries(header.map((key, index) => [key, String(row[index] ?? "").trim()])))
    .filter((row) => Object.values(row).some((value) => value !== ""));
}

export function cell(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const value = row[name.toLowerCase()];
    if (value !== undefined && value !== "") return value;
  }
  return "";
}

export function normaliseGrade(value: string): string {
  const trimmed = value.trim();
  if (/^[1-4]$/.test(trimmed)) return `Form ${trimmed}`;
  const match = /^form\s*([1-4])$/i.exec(trimmed);
  return match ? `Form ${match[1]}` : trimmed;
}

export async function downloadRows(
  filename: string,
  sheetName: string,
  rows: Array<Record<string, string | number>>,
  notes: string[] = []
): Promise<void> {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));

  if (notes.length > 0) {
    const notesSheet = XLSX.utils.aoa_to_sheet(notes.map((note) => [note]));
    notesSheet["!cols"] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(workbook, notesSheet, "Notes");
  }

  XLSX.writeFile(workbook, filename);
}
