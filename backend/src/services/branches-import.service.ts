import { sql } from "drizzle-orm";
import type {
  BranchImportConfirmInput,
  BranchImportConfirmResponse,
  BranchImportDuplicateCode,
  BranchImportExistingRow,
  BranchImportInvalidRow,
  BranchImportPreviewResponse,
  BranchImportReadyRow,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import { branches } from "../db/schema/branches.js";
import { AppError } from "../utils/errors.js";
import { mapBranchDatabaseError } from "../utils/db-errors.js";
import {
  parseBranchImportWorkbook,
  type ParsedBranchImportRow,
} from "../utils/branch-import-xlsx.js";

const BRANCH_CODE_MAX = 20;
const BRANCH_NAME_MIN = 2;
const BRANCH_NAME_MAX = 150;

function validateParsedRow(row: ParsedBranchImportRow): string | null {
  if (!row.branchCode) {
    return "Branch code is required.";
  }
  if (row.branchCode.length < 2 || row.branchCode.length > BRANCH_CODE_MAX) {
    return `Branch code must be between 2 and ${BRANCH_CODE_MAX} characters.`;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(row.branchCode)) {
    return "Branch code may only contain letters, numbers, hyphens and underscores.";
  }
  if (!row.branchName) {
    return "Branch name is required.";
  }
  // Legacy storemaster uses "-" for an empty/placeholder branch name.
  if (
    row.branchName !== "-" &&
    (row.branchName.length < BRANCH_NAME_MIN || row.branchName.length > BRANCH_NAME_MAX)
  ) {
    return `Branch name must be between ${BRANCH_NAME_MIN} and ${BRANCH_NAME_MAX} characters.`;
  }
  return null;
}

function inferBranchType(row: ParsedBranchImportRow): "HEAD_OFFICE" | "BRANCH" {
  if (!row.underStoreName || row.branchName.toLowerCase() === "corporate office") {
    return "HEAD_OFFICE";
  }
  return "BRANCH";
}

async function findExistingBranchCodes(codes: string[]): Promise<Set<string>> {
  if (codes.length === 0) {
    return new Set();
  }
  const lowered = [...new Set(codes.map((code) => code.toLowerCase()))];

  try {
    const rows = await getDb()
      .select({ branchCode: branches.branchCode })
      .from(branches)
      .where(
        sql`lower(${branches.branchCode}) in (${sql.join(
          lowered.map((code) => sql`${code}`),
          sql`, `,
        )})`,
      );

    return new Set(rows.map((row) => row.branchCode.toLowerCase()));
  } catch (error) {
    mapBranchDatabaseError(error);
  }
}

export async function previewBranchImport(
  fileBuffer: Buffer,
): Promise<BranchImportPreviewResponse> {
  const parsedRows = await parseBranchImportWorkbook(fileBuffer);

  const ready: BranchImportReadyRow[] = [];
  const existing: BranchImportExistingRow[] = [];
  const duplicateCodes: BranchImportDuplicateCode[] = [];
  const invalidRows: BranchImportInvalidRow[] = [];

  const codeOccurrences = new Map<string, number[]>();
  for (const row of parsedRows) {
    if (!row.branchCode) {
      continue;
    }
    const key = row.branchCode.toLowerCase();
    const list = codeOccurrences.get(key);
    if (list) {
      list.push(row.rowNumber);
    } else {
      codeOccurrences.set(key, [row.rowNumber]);
    }
  }

  const duplicateCodeKeys = new Set<string>();
  for (const [codeKey, rowNumbers] of codeOccurrences) {
    if (rowNumbers.length > 1) {
      duplicateCodeKeys.add(codeKey);
      const sample = parsedRows.find((row) => row.branchCode.toLowerCase() === codeKey);
      duplicateCodes.push({
        branchCode: sample?.branchCode ?? codeKey,
        rowNumbers: [...rowNumbers].sort((a, b) => a - b),
      });
    }
  }

  const candidateCodes: string[] = [];
  for (const row of parsedRows) {
    const validationError = validateParsedRow(row);
    if (validationError) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: validationError });
      continue;
    }
    if (duplicateCodeKeys.has(row.branchCode.toLowerCase())) {
      continue;
    }
    candidateCodes.push(row.branchCode);
  }

  const existingCodes = await findExistingBranchCodes(candidateCodes);

  for (const row of parsedRows) {
    const validationError = validateParsedRow(row);
    if (validationError) {
      continue;
    }
    if (duplicateCodeKeys.has(row.branchCode.toLowerCase())) {
      continue;
    }
    if (existingCodes.has(row.branchCode.toLowerCase())) {
      existing.push({
        rowNumber: row.rowNumber,
        branchCode: row.branchCode,
        branchName: row.branchName,
      });
      continue;
    }

    ready.push({
      rowNumber: row.rowNumber,
      branchCode: row.branchCode.toUpperCase(),
      branchName: row.branchName,
      branchType: inferBranchType(row),
      address: null,
      isActive: row.isActive,
    });
  }

  ready.sort((a, b) => a.rowNumber - b.rowNumber);
  existing.sort((a, b) => a.rowNumber - b.rowNumber);
  invalidRows.sort((a, b) => a.rowNumber - b.rowNumber);
  duplicateCodes.sort((a, b) =>
    a.branchCode.localeCompare(b.branchCode, undefined, { sensitivity: "base" }),
  );

  return {
    ready,
    existing,
    duplicateCodes,
    invalidRows,
    summary: {
      totalRows: parsedRows.length,
      readyCount: ready.length,
      existingCount: existing.length,
      duplicateCodeCount: duplicateCodes.length,
      invalidRowCount: invalidRows.length,
    },
  };
}

export async function confirmBranchImport(
  input: BranchImportConfirmInput,
): Promise<BranchImportConfirmResponse> {
  const uniqueByCode = new Map<string, BranchImportConfirmInput["branches"][number]>();

  for (const branch of input.branches) {
    const key = branch.branchCode.toLowerCase();
    if (uniqueByCode.has(key)) {
      throw new AppError("Duplicate branch codes in the import request are not allowed.", 400);
    }
    uniqueByCode.set(key, branch);
  }

  const branchesToImport = [...uniqueByCode.values()];

  try {
    return await getDb().transaction(async (tx) => {
      const codes = branchesToImport.map((row) => row.branchCode.toLowerCase());
      const existingRows = await tx
        .select({ branchCode: branches.branchCode })
        .from(branches)
        .where(
          sql`lower(${branches.branchCode}) in (${sql.join(
            codes.map((code) => sql`${code}`),
            sql`, `,
          )})`,
        );

      const existingCodes = new Set(existingRows.map((row) => row.branchCode.toLowerCase()));
      const toInsert = branchesToImport.filter(
        (row) => !existingCodes.has(row.branchCode.toLowerCase()),
      );

      if (toInsert.length > 0) {
        await tx.insert(branches).values(
          toInsert.map((row) => ({
            branchCode: row.branchCode,
            branchName: row.branchName,
            branchType: row.branchType,
            address: row.address,
            isActive: row.isActive,
          })),
        );
      }

      return {
        importedCount: toInsert.length,
        skippedExistingCount: branchesToImport.length - toInsert.length,
      };
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapBranchDatabaseError(error);
  }
}
