import ExcelJS from "exceljs";
import { STORE_IMPORT_MAX_ROWS } from "@printing-stationery/shared";
import { AppError } from "./errors.js";

export const STORE_IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;

export type ParsedStoreImportRow = {
  rowNumber: number;
  storeCode: string;
  storeName: string;
  branchName: string;
  underStoreName: string;
  allowTransfer: boolean;
  allowDepartmentIssue: boolean;
  isActive: boolean;
};

type ColumnMap = {
  storeCode: number;
  storeName: number;
  branchName: number;
  underStoreName?: number;
  allowTransfer?: number;
  allowDepartmentIssue?: number;
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
  let storeCode: number | undefined;
  let storeName: number | undefined;
  let branchName: number | undefined;
  let underStoreName: number | undefined;
  let allowTransfer: number | undefined;
  let allowDepartmentIssue: number | undefined;
  let isActive: number | undefined;

  for (let index = 1; index < values.length; index += 1) {
    const header = normalizeHeader(values[index]);
    if (!header) {
      continue;
    }
    if (header === "storecode" || header === "store code") {
      storeCode = index;
      continue;
    }
    if (header === "storename" || header === "store name") {
      storeName = index;
      continue;
    }
    if (header === "branchname" || header === "branch name") {
      branchName = index;
      continue;
    }
    if (header === "understorename" || header === "under store name") {
      underStoreName = index;
      continue;
    }
    if (header === "allowtransfer" || header === "allow transfer") {
      allowTransfer = index;
      continue;
    }
    if (
      header === "isallowdepartment" ||
      header === "is allow department" ||
      header === "allowdepartmentissue" ||
      header === "allow department issue"
    ) {
      allowDepartmentIssue = index;
      continue;
    }
    if (header === "isactive" || header === "is active" || header === "status") {
      isActive = index;
    }
  }

  if (storeCode === undefined || storeName === undefined || branchName === undefined) {
    return null;
  }

  return {
    storeCode,
    storeName,
    branchName,
    underStoreName,
    allowTransfer,
    allowDepartmentIssue,
    isActive,
  };
}

function rowIsEmpty(row: ExcelJS.Row, columns: ColumnMap): boolean {
  const storeCode = cellToString(row.getCell(columns.storeCode).value);
  const storeName = cellToString(row.getCell(columns.storeName).value);
  return !storeCode && !storeName;
}

function normalizePlaceholderName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed.toLowerCase() === "n/a") {
    return "";
  }
  return trimmed;
}

export async function parseStoreImportWorkbook(
  buffer: Buffer,
): Promise<ParsedStoreImportRow[]> {
  if (buffer.byteLength > STORE_IMPORT_MAX_FILE_BYTES) {
    throw new AppError(
      `File exceeds the maximum size of ${Math.floor(STORE_IMPORT_MAX_FILE_BYTES / (1024 * 1024))} MB.`,
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
      "Could not find a header row with StoreCode, StoreName, and BranchName columns.",
      400,
    );
  }

  const columns = resolvedColumns;
  const rows: ParsedStoreImportRow[] = [];

  for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    if (rowIsEmpty(row, columns)) {
      continue;
    }
    if (rows.length >= STORE_IMPORT_MAX_ROWS) {
      throw new AppError(
        `The workbook exceeds the maximum of ${STORE_IMPORT_MAX_ROWS} store rows.`,
        400,
      );
    }

    const underStoreRaw =
      columns.underStoreName !== undefined
        ? cellToString(row.getCell(columns.underStoreName).value)
        : "";
    const isActiveRaw =
      columns.isActive !== undefined
        ? cellToString(row.getCell(columns.isActive).value)
        : "";
    const allowTransferRaw =
      columns.allowTransfer !== undefined
        ? cellToString(row.getCell(columns.allowTransfer).value)
        : "";
    const allowDepartmentRaw =
      columns.allowDepartmentIssue !== undefined
        ? cellToString(row.getCell(columns.allowDepartmentIssue).value)
        : "";

    rows.push({
      rowNumber,
      storeCode: cellToString(row.getCell(columns.storeCode).value),
      storeName: cellToString(row.getCell(columns.storeName).value),
      branchName: cellToString(row.getCell(columns.branchName).value),
      underStoreName: normalizePlaceholderName(underStoreRaw),
      allowTransfer: parseBooleanCell(allowTransferRaw, false),
      allowDepartmentIssue: parseBooleanCell(allowDepartmentRaw, false),
      isActive: parseBooleanCell(isActiveRaw, true),
    });
  }

  if (rows.length === 0) {
    throw new AppError("No store rows were found in the workbook.", 400);
  }

  return rows;
}
