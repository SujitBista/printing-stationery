import { inArray, sql } from "drizzle-orm";
import type {
  EmployeeImportConfirmInput,
  EmployeeImportConfirmResponse,
  EmployeeImportDuplicateCode,
  EmployeeImportExistingRow,
  EmployeeImportInvalidRow,
  EmployeeImportPreviewResponse,
  EmployeeImportReadyRow,
  EmployeeImportUnknownBranchRow,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import { branches } from "../db/schema/branches.js";
import { employees } from "../db/schema/employees.js";
import { AppError } from "../utils/errors.js";
import { mapEmployeeDatabaseError } from "../utils/db-errors.js";
import {
  parseEmployeeImportWorkbook,
  type ParsedEmployeeImportRow,
} from "../utils/employee-import-xlsx.js";

type BranchLookup = {
  id: string;
  branchCode: string;
  branchName: string;
  isActive: boolean;
};

const EMPLOYEE_CODE_MAX = 30;
const EMPLOYEE_NAME_MIN = 2;
const EMPLOYEE_NAME_MAX = 150;

function buildBranchLookups(rows: BranchLookup[]): {
  byCode: Map<string, BranchLookup>;
  byName: Map<string, BranchLookup[]>;
} {
  const byCode = new Map<string, BranchLookup>();
  const byName = new Map<string, BranchLookup[]>();

  for (const branch of rows) {
    byCode.set(branch.branchCode.toLowerCase(), branch);

    const nameKey = branch.branchName.toLowerCase();
    const existing = byName.get(nameKey);
    if (existing) {
      existing.push(branch);
    } else {
      byName.set(nameKey, [branch]);
    }
  }

  return { byCode, byName };
}

function resolveBranch(
  row: ParsedEmployeeImportRow,
  byCode: Map<string, BranchLookup>,
  byName: Map<string, BranchLookup[]>,
): { branch?: BranchLookup; unknown: boolean; inactive: boolean } {
  if (row.branchCode) {
    const matched = byCode.get(row.branchCode.toLowerCase());
    if (!matched) {
      return { unknown: true, inactive: false };
    }
    if (!matched.isActive) {
      return { branch: matched, unknown: false, inactive: true };
    }
    return { branch: matched, unknown: false, inactive: false };
  }

  if (row.branchName) {
    const matches = byName.get(row.branchName.toLowerCase()) ?? [];
    if (matches.length === 0) {
      return { unknown: true, inactive: false };
    }
    if (matches.length > 1) {
      return { unknown: true, inactive: false };
    }
    const matched = matches[0]!;
    if (!matched.isActive) {
      return { branch: matched, unknown: false, inactive: true };
    }
    return { branch: matched, unknown: false, inactive: false };
  }

  return { unknown: true, inactive: false };
}

function validateParsedRow(
  row: ParsedEmployeeImportRow,
): string | null {
  if (!row.employeeCode) {
    return "Employee code is required.";
  }
  if (row.employeeCode.length > EMPLOYEE_CODE_MAX) {
    return `Employee code must be between 1 and ${EMPLOYEE_CODE_MAX} characters.`;
  }
  if (!row.employeeName) {
    return "Employee name is required.";
  }
  if (
    row.employeeName.length < EMPLOYEE_NAME_MIN ||
    row.employeeName.length > EMPLOYEE_NAME_MAX
  ) {
    return `Employee name must be between ${EMPLOYEE_NAME_MIN} and ${EMPLOYEE_NAME_MAX} characters.`;
  }
  if (!row.branchCode && !row.branchName) {
    return "Branch code or branch name is required.";
  }
  return null;
}

async function loadAllBranches(): Promise<BranchLookup[]> {
  try {
    const rows = await getDb()
      .select({
        id: branches.id,
        branchCode: branches.branchCode,
        branchName: branches.branchName,
        isActive: branches.isActive,
      })
      .from(branches);

    return rows;
  } catch (error) {
    mapEmployeeDatabaseError(error);
  }
}

async function findExistingEmployeeCodes(
  codes: string[],
): Promise<Set<string>> {
  if (codes.length === 0) {
    return new Set();
  }

  const lowered = [...new Set(codes.map((code) => code.toLowerCase()))];

  try {
    const rows = await getDb()
      .select({ employeeCode: employees.employeeCode })
      .from(employees)
      .where(
        sql`lower(${employees.employeeCode}) in (${sql.join(
          lowered.map((code) => sql`${code}`),
          sql`, `,
        )})`,
      );

    return new Set(rows.map((row) => row.employeeCode.toLowerCase()));
  } catch (error) {
    mapEmployeeDatabaseError(error);
  }
}

export async function previewEmployeeImport(
  fileBuffer: Buffer,
): Promise<EmployeeImportPreviewResponse> {
  const parsedRows = await parseEmployeeImportWorkbook(fileBuffer);
  const branchRows = await loadAllBranches();
  const { byCode, byName } = buildBranchLookups(branchRows);

  const ready: EmployeeImportReadyRow[] = [];
  const existing: EmployeeImportExistingRow[] = [];
  const duplicateCodes: EmployeeImportDuplicateCode[] = [];
  const unknownBranches: EmployeeImportUnknownBranchRow[] = [];
  const invalidRows: EmployeeImportInvalidRow[] = [];

  const codeOccurrences = new Map<string, number[]>();
  for (const row of parsedRows) {
    if (!row.employeeCode) {
      continue;
    }
    const key = row.employeeCode.toLowerCase();
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
      const sample = parsedRows.find(
        (row) => row.employeeCode.toLowerCase() === codeKey,
      );
      duplicateCodes.push({
        employeeCode: sample?.employeeCode ?? codeKey,
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

    const codeKey = row.employeeCode.toLowerCase();
    if (duplicateCodeKeys.has(codeKey)) {
      continue;
    }

    candidateCodes.push(row.employeeCode);
  }

  const existingCodes = await findExistingEmployeeCodes(candidateCodes);

  for (const row of parsedRows) {
    const validationError = validateParsedRow(row);
    if (validationError) {
      continue;
    }

    const codeKey = row.employeeCode.toLowerCase();
    if (duplicateCodeKeys.has(codeKey)) {
      continue;
    }

    if (existingCodes.has(codeKey)) {
      existing.push({
        rowNumber: row.rowNumber,
        employeeCode: row.employeeCode,
        employeeName: row.employeeName,
      });
      continue;
    }

    const resolved = resolveBranch(row, byCode, byName);
    if (resolved.unknown) {
      unknownBranches.push({
        rowNumber: row.rowNumber,
        employeeCode: row.employeeCode,
        branchCode: row.branchCode,
        branchName: row.branchName,
      });
      continue;
    }

    if (resolved.inactive || !resolved.branch) {
      invalidRows.push({
        rowNumber: row.rowNumber,
        reason: "Matched branch is inactive.",
      });
      continue;
    }

    ready.push({
      rowNumber: row.rowNumber,
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      branchId: resolved.branch.id,
      branchCode: resolved.branch.branchCode,
      branchName: resolved.branch.branchName,
      isActive: row.isActive,
    });
  }

  ready.sort((a, b) => a.rowNumber - b.rowNumber);
  existing.sort((a, b) => a.rowNumber - b.rowNumber);
  unknownBranches.sort((a, b) => a.rowNumber - b.rowNumber);
  invalidRows.sort((a, b) => a.rowNumber - b.rowNumber);
  duplicateCodes.sort((a, b) =>
    a.employeeCode.localeCompare(b.employeeCode, undefined, {
      sensitivity: "base",
    }),
  );

  return {
    ready,
    existing,
    duplicateCodes,
    unknownBranches,
    invalidRows,
    summary: {
      totalRows: parsedRows.length,
      readyCount: ready.length,
      existingCount: existing.length,
      duplicateCodeCount: duplicateCodes.length,
      unknownBranchCount: unknownBranches.length,
      invalidRowCount: invalidRows.length,
    },
  };
}

export async function confirmEmployeeImport(
  input: EmployeeImportConfirmInput,
): Promise<EmployeeImportConfirmResponse> {
  const uniqueByCode = new Map<
    string,
    EmployeeImportConfirmInput["employees"][number]
  >();

  for (const employee of input.employees) {
    const key = employee.employeeCode.toLowerCase();
    if (uniqueByCode.has(key)) {
      throw new AppError(
        "Duplicate employee codes in the import request are not allowed.",
        400,
      );
    }
    uniqueByCode.set(key, employee);
  }

  const employeesToImport = [...uniqueByCode.values()];
  const branchIds = [...new Set(employeesToImport.map((row) => row.branchId))];

  try {
    return await getDb().transaction(async (tx) => {
      const branchRows = await tx
        .select({
          id: branches.id,
          isActive: branches.isActive,
        })
        .from(branches)
        .where(inArray(branches.id, branchIds));

      const branchById = new Map(branchRows.map((row) => [row.id, row]));

      for (const branchId of branchIds) {
        const branch = branchById.get(branchId);
        if (!branch) {
          throw new AppError("One or more selected branches were not found.", 400);
        }
        if (!branch.isActive) {
          throw new AppError("One or more selected branches are inactive.", 400);
        }
      }

      const codes = employeesToImport.map((row) => row.employeeCode.toLowerCase());
      const existingRows = await tx
        .select({ employeeCode: employees.employeeCode })
        .from(employees)
        .where(
          sql`lower(${employees.employeeCode}) in (${sql.join(
            codes.map((code) => sql`${code}`),
            sql`, `,
          )})`,
        );

      const existingCodes = new Set(
        existingRows.map((row) => row.employeeCode.toLowerCase()),
      );

      const toInsert = employeesToImport.filter(
        (row) => !existingCodes.has(row.employeeCode.toLowerCase()),
      );

      if (toInsert.length > 0) {
        await tx.insert(employees).values(
          toInsert.map((row) => ({
            employeeCode: row.employeeCode,
            employeeName: row.employeeName,
            branchId: row.branchId,
            isActive: row.isActive,
          })),
        );
      }

      return {
        importedCount: toInsert.length,
        skippedExistingCount: employeesToImport.length - toInsert.length,
      };
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapEmployeeDatabaseError(error);
  }
}
