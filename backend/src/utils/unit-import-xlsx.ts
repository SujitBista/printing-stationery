import ExcelJS from "exceljs";
import { UNIT_IMPORT_MAX_ROWS } from "@printing-stationery/shared";
import { AppError } from "./errors.js";

export const UNIT_IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;

export type ParsedUnitImportRow = {
  rowNumber: number;
  unitName: string;
  isActive: boolean;
};

type ColumnMap = {
  unitName: number;
  isActive?: number;
};

function normalizeHeader(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object" && "text" in value) {
    const text = (value as { text?: unknown }).text;
    return typeof text === "string" ? text.trim().toLowerCase() : "";
  }
  return String(value).trim().toLowerCase();
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    if ("text" in value && typeof (value as { text?: unknown }).text === "string") {
      return ((value as { text: string }).text ?? "").trim();
    }
    if (
      "result" in value &&
      (value as { result?: unknown }).result !== undefined &&
      (value as { result?: unknown }).result !== null
    ) {
      return cellToString((value as { result: unknown }).result);
    }
    if ("richText" in value && Array.isArray((value as { richText: unknown }).richText)) {
      return (value as { richText: Array<{ text?: string }> }).richText
        .map((part) => part.text ?? "")
        .join("")
        .trim();
    }
  }
  return String(value).trim();
}

function parseBooleanCell(raw: string, fallback: boolean): boolean {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (["active", "a", "y", "yes", "true", "1"].includes(normalized)) {
    return true;
  }
  if (["inactive", "i", "n", "no", "false", "0"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function mapHeaderRow(values: unknown[]): ColumnMap | null {
  let unitName: number | undefined;
  let isActive: number | undefined;

  for (let index = 1; index < values.length; index += 1) {
    const header = normalizeHeader(values[index]);
    if (!header) {
      continue;
    }
    if (
      header === "unitname" ||
      header === "unit name" ||
      header === "name" ||
      header === "unit"
    ) {
      unitName = index;
      continue;
    }
    if (header === "isactive" || header === "is active" || header === "status") {
      isActive = index;
    }
  }

  if (unitName === undefined) {
    return null;
  }

  return { unitName, isActive };
}

function rowIsEmpty(row: ExcelJS.Row, columns: ColumnMap): boolean {
  return !cellToString(row.getCell(columns.unitName).value);
}

export async function parseUnitImportWorkbook(
  buffer: Buffer,
): Promise<ParsedUnitImportRow[]> {
  if (buffer.byteLength > UNIT_IMPORT_MAX_FILE_BYTES) {
    throw new AppError(
      `File exceeds the maximum size of ${Math.floor(UNIT_IMPORT_MAX_FILE_BYTES / (1024 * 1024))} MB.`,
      400,
    );
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new AppError("Unable to read the uploaded .xlsx workbook.", 400);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new AppError("The workbook does not contain any worksheets.", 400);
  }

  let headerRowNumber = 0;
  let resolvedColumns: ColumnMap | undefined;
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = Array.isArray(row.values) ? row.values : [];
    const mapped = mapHeaderRow(values);
    if (mapped) {
      resolvedColumns = mapped;
      headerRowNumber = rowNumber;
      break;
    }
  }

  if (!resolvedColumns) {
    throw new AppError(
      "Could not find a header row with a UnitName column.",
      400,
    );
  }

  const columns = resolvedColumns;
  const rows: ParsedUnitImportRow[] = [];

  for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    if (rowIsEmpty(row, columns)) {
      continue;
    }
    if (rows.length >= UNIT_IMPORT_MAX_ROWS) {
      throw new AppError(
        `The workbook exceeds the maximum of ${UNIT_IMPORT_MAX_ROWS} unit rows.`,
        400,
      );
    }

    const unitName = cellToString(row.getCell(columns.unitName).value);
    const isActiveRaw =
      columns.isActive !== undefined
        ? cellToString(row.getCell(columns.isActive).value)
        : "";

    rows.push({
      rowNumber,
      unitName,
      isActive: parseBooleanCell(isActiveRaw, true),
    });
  }

  if (rows.length === 0) {
    throw new AppError("No unit rows were found in the workbook.", 400);
  }

  return rows;
}
