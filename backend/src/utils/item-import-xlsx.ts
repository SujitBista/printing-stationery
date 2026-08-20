import ExcelJS from "exceljs";
import { ITEM_IMPORT_MAX_ROWS } from "@printing-stationery/shared";
import { AppError } from "./errors.js";

export const ITEM_IMPORT_MAX_FILE_BYTES = 3 * 1024 * 1024;

export type ParsedItemImportRow = {
  rowNumber: number;
  itemCode: string;
  itemName: string;
  unitName: string;
  groupName: string;
  refundTypeName: string;
  purchaseRate: string;
  remarks: string;
  isActive: boolean;
  isRequestable: boolean;
  isIssuable: boolean;
  trackSerialNumber: boolean;
};

type ColumnMap = {
  itemCode: number;
  itemName: number;
  unitName: number;
  groupName: number;
  refundTypeName?: number;
  purchaseRate?: number;
  remarks?: number;
  isActive?: number;
  isRequestable?: number;
  isIssuable?: number;
  trackSerialNumber?: number;
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
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "";
    }
    if (Number.isInteger(value)) {
      return String(value);
    }
    return String(value);
  }
  if (typeof value === "boolean") {
    return String(value);
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

function cellToPurchaseRate(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "0";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isInteger(value)) {
      return String(value);
    }
    const fixed = value.toFixed(4).replace(/\.?0+$/, "");
    return fixed === "-0" ? "0" : fixed;
  }
  const asString = cellToString(value);
  return asString || "0";
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
  let itemCode: number | undefined;
  let itemName: number | undefined;
  let unitName: number | undefined;
  let groupName: number | undefined;
  let refundTypeName: number | undefined;
  let purchaseRate: number | undefined;
  let remarks: number | undefined;
  let isActive: number | undefined;
  let isRequestable: number | undefined;
  let isIssuable: number | undefined;
  let trackSerialNumber: number | undefined;

  for (let index = 1; index < values.length; index += 1) {
    const header = normalizeHeader(values[index]);
    if (!header) {
      continue;
    }
    if (header === "itemcode" || header === "item code" || header === "code") {
      itemCode = index;
      continue;
    }
    if (header === "itemname" || header === "item name" || header === "name") {
      itemName = index;
      continue;
    }
    if (header === "unitname" || header === "unit name" || header === "unit") {
      unitName = index;
      continue;
    }
    if (
      header === "groupname" ||
      header === "group name" ||
      header === "itemgroup" ||
      header === "item group"
    ) {
      groupName = index;
      continue;
    }
    if (
      header === "refundtypename" ||
      header === "refund type name" ||
      header === "returntype" ||
      header === "return type"
    ) {
      refundTypeName = index;
      continue;
    }
    if (
      header === "purchaserate" ||
      header === "purchase rate" ||
      header === "rate"
    ) {
      purchaseRate = index;
      continue;
    }
    if (header === "remarks" || header === "remark") {
      remarks = index;
      continue;
    }
    if (header === "isactive" || header === "is active" || header === "status") {
      isActive = index;
      continue;
    }
    if (
      header === "activerequest" ||
      header === "active request" ||
      header === "isrequestable" ||
      header === "is requestable" ||
      header === "requestable"
    ) {
      isRequestable = index;
      continue;
    }
    if (
      header === "activeissue" ||
      header === "active issue" ||
      header === "isissuable" ||
      header === "is issuable" ||
      header === "issuable"
    ) {
      isIssuable = index;
      continue;
    }
    if (
      header === "istracksrno" ||
      header === "is track sr no" ||
      header === "trackserialnumber" ||
      header === "track serial number" ||
      header === "serialtracking"
    ) {
      trackSerialNumber = index;
    }
  }

  if (
    itemCode === undefined ||
    itemName === undefined ||
    unitName === undefined ||
    groupName === undefined
  ) {
    return null;
  }

  return {
    itemCode,
    itemName,
    unitName,
    groupName,
    refundTypeName,
    purchaseRate,
    remarks,
    isActive,
    isRequestable,
    isIssuable,
    trackSerialNumber,
  };
}

function rowIsEmpty(row: ExcelJS.Row, columns: ColumnMap): boolean {
  const itemCode = cellToString(row.getCell(columns.itemCode).value);
  const itemName = cellToString(row.getCell(columns.itemName).value);
  return !itemCode && !itemName;
}

export async function parseItemImportWorkbook(
  buffer: Buffer,
): Promise<ParsedItemImportRow[]> {
  if (buffer.byteLength > ITEM_IMPORT_MAX_FILE_BYTES) {
    throw new AppError(
      `File exceeds the maximum size of ${Math.floor(ITEM_IMPORT_MAX_FILE_BYTES / (1024 * 1024))} MB.`,
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
      "Could not find a header row with ItemCode, ItemName, UnitName, and GroupName columns.",
      400,
    );
  }

  const columns = resolvedColumns;
  const rows: ParsedItemImportRow[] = [];

  for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    if (rowIsEmpty(row, columns)) {
      continue;
    }
    if (rows.length >= ITEM_IMPORT_MAX_ROWS) {
      throw new AppError(
        `The workbook exceeds the maximum of ${ITEM_IMPORT_MAX_ROWS} item rows.`,
        400,
      );
    }

    const isActiveRaw =
      columns.isActive !== undefined
        ? cellToString(row.getCell(columns.isActive).value)
        : "";
    const isRequestableRaw =
      columns.isRequestable !== undefined
        ? cellToString(row.getCell(columns.isRequestable).value)
        : "";
    const isIssuableRaw =
      columns.isIssuable !== undefined
        ? cellToString(row.getCell(columns.isIssuable).value)
        : "";
    const trackSerialRaw =
      columns.trackSerialNumber !== undefined
        ? cellToString(row.getCell(columns.trackSerialNumber).value)
        : "";

    rows.push({
      rowNumber,
      itemCode: cellToString(row.getCell(columns.itemCode).value),
      itemName: cellToString(row.getCell(columns.itemName).value),
      unitName: cellToString(row.getCell(columns.unitName).value),
      groupName: cellToString(row.getCell(columns.groupName).value),
      refundTypeName:
        columns.refundTypeName !== undefined
          ? cellToString(row.getCell(columns.refundTypeName).value)
          : "",
      purchaseRate:
        columns.purchaseRate !== undefined
          ? cellToPurchaseRate(row.getCell(columns.purchaseRate).value)
          : "0",
      remarks:
        columns.remarks !== undefined
          ? cellToString(row.getCell(columns.remarks).value)
          : "",
      isActive: parseBooleanCell(isActiveRaw, true),
      isRequestable: parseBooleanCell(isRequestableRaw, true),
      isIssuable: parseBooleanCell(isIssuableRaw, true),
      trackSerialNumber: parseBooleanCell(trackSerialRaw, false),
    });
  }

  if (rows.length === 0) {
    throw new AppError("No item rows were found in the workbook.", 400);
  }

  return rows;
}
