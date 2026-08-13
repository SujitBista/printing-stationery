import ExcelJS from "exceljs";
import { EMPLOYEE_IMPORT_MAX_ROWS } from "@printing-stationery/shared";
import { AppError } from "./errors.js";

/** Maximum uploaded workbook size (2 MiB). */
export const EMPLOYEE_IMPORT_MAX_FILE_BYTES = 2 * 1024 * 1024;

export type ParsedEmployeeImportRow = {
  rowNumber: number;
  employeeCode: string;
  employeeName: string;
  branchCode?: string;
  branchName?: string;
  isActive: boolean;
};

type ColumnMap = {
  empCode: number;
  empName: number;
  branchCode?: number;
  branchName?: number;
  status?: number;
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

function parseActiveStatus(raw: string): boolean | undefined {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (
    normalized === "active" ||
    normalized === "a" ||
    normalized === "y" ||
    normalized === "yes" ||
    normalized === "true" ||
    normalized === "1"
  ) {
    return true;
  }

  if (
    normalized === "inactive" ||
    normalized === "i" ||
    normalized === "n" ||
    normalized === "no" ||
    normalized === "false" ||
    normalized === "0"
  ) {
    return false;
  }

  return undefined;
}

function mapHeaderRow(values: unknown[]): ColumnMap | null {
  let empCode: number | undefined;
  let empName: number | undefined;
  let branchCode: number | undefined;
  let branchName: number | undefined;
  let status: number | undefined;

  for (let index = 1; index < values.length; index += 1) {
    const header = normalizeHeader(values[index]);
    if (!header) {
      continue;
    }

    if (header === "empcode" || header === "employee code" || header === "employeecode") {
      empCode = index;
      continue;
    }

    if (header === "empname" || header === "employee name" || header === "employeename") {
      empName = index;
      continue;
    }

    if (header === "branchcode" || header === "branch code") {
      branchCode = index;
      continue;
    }

    if (header === "branchname" || header === "branch name" || header === "branch") {
      branchName = index;
      continue;
    }

    if (
      header === "status" ||
      header === "activestatus" ||
      header === "active/inactive" ||
      header === "active / inactive" ||
      header === "isactive" ||
      header === "is active"
    ) {
      status = index;
    }
  }

  if (empCode === undefined || empName === undefined) {
    return null;
  }

  return {
    empCode,
    empName,
    branchCode,
    branchName,
    status,
  };
}

function rowIsEmpty(row: ExcelJS.Row, columns: ColumnMap): boolean {
  const code = cellToString(row.getCell(columns.empCode).value);
  const name = cellToString(row.getCell(columns.empName).value);
  const branchCode =
    columns.branchCode !== undefined
      ? cellToString(row.getCell(columns.branchCode).value)
      : "";
  const branchName =
    columns.branchName !== undefined
      ? cellToString(row.getCell(columns.branchName).value)
      : "";

  return !code && !name && !branchCode && !branchName;
}

/**
 * Parses an HRIS employee workbook and returns only approved columns.
 * Never returns or logs other spreadsheet fields (passwords, PII, etc.).
 */
export async function parseEmployeeImportWorkbook(
  buffer: Buffer,
): Promise<ParsedEmployeeImportRow[]> {
  const workbook = new ExcelJS.Workbook();

  try {
    // exceljs typings accept ArrayBuffer; Node Buffer is compatible at runtime.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new AppError("Unable to read the Excel file. Upload a valid .xlsx workbook.", 400);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new AppError("The Excel file does not contain a worksheet.", 400);
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
      "Could not find required columns EmpCode and EmpName in the workbook.",
      400,
    );
  }

  const columns = resolvedColumns;
  const rows: ParsedEmployeeImportRow[] = [];

  for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);

    if (rowIsEmpty(row, columns)) {
      continue;
    }

    if (rows.length >= EMPLOYEE_IMPORT_MAX_ROWS) {
      throw new AppError(
        `The workbook exceeds the maximum of ${EMPLOYEE_IMPORT_MAX_ROWS} employee rows.`,
        400,
      );
    }

    const employeeCode = cellToString(row.getCell(columns.empCode).value);
    const employeeName = cellToString(row.getCell(columns.empName).value);
    const branchCode =
      columns.branchCode !== undefined
        ? cellToString(row.getCell(columns.branchCode).value)
        : "";
    const branchName =
      columns.branchName !== undefined
        ? cellToString(row.getCell(columns.branchName).value)
        : "";

    let isActive = true;
    if (columns.status !== undefined) {
      const parsedStatus = parseActiveStatus(
        cellToString(row.getCell(columns.status).value),
      );
      if (parsedStatus !== undefined) {
        isActive = parsedStatus;
      }
    }

    rows.push({
      rowNumber,
      employeeCode,
      employeeName,
      branchCode: branchCode || undefined,
      branchName: branchName || undefined,
      isActive,
    });
  }

  if (rows.length === 0) {
    throw new AppError("The workbook does not contain any employee rows.", 400);
  }

  return rows;
}
