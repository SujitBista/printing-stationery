import { sql } from "drizzle-orm";
import type {
  UnitImportConfirmInput,
  UnitImportConfirmResponse,
  UnitImportDuplicateName,
  UnitImportExistingRow,
  UnitImportInvalidRow,
  UnitImportPreviewResponse,
  UnitImportReadyRow,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import { units } from "../db/schema/units.js";
import { AppError } from "../utils/errors.js";
import { mapUnitDatabaseError } from "../utils/db-errors.js";
import {
  parseUnitImportWorkbook,
  type ParsedUnitImportRow,
} from "../utils/unit-import-xlsx.js";

const UNIT_NAME_MIN = 2;
const UNIT_NAME_MAX = 100;

function validateParsedRow(row: ParsedUnitImportRow): string | null {
  if (!row.unitName) {
    return "Unit name is required.";
  }
  if (row.unitName.length < UNIT_NAME_MIN || row.unitName.length > UNIT_NAME_MAX) {
    return `Unit name must be between ${UNIT_NAME_MIN} and ${UNIT_NAME_MAX} characters.`;
  }
  return null;
}

async function findExistingUnitNames(names: string[]): Promise<Set<string>> {
  if (names.length === 0) {
    return new Set();
  }
  const lowered = [...new Set(names.map((name) => name.toLowerCase()))];

  try {
    const rows = await getDb()
      .select({ unitName: units.unitName })
      .from(units)
      .where(
        sql`lower(${units.unitName}) in (${sql.join(
          lowered.map((name) => sql`${name}`),
          sql`, `,
        )})`,
      );

    return new Set(rows.map((row) => row.unitName.toLowerCase()));
  } catch (error) {
    mapUnitDatabaseError(error);
  }
}

export async function previewUnitImport(
  fileBuffer: Buffer,
): Promise<UnitImportPreviewResponse> {
  const parsedRows = await parseUnitImportWorkbook(fileBuffer);

  const ready: UnitImportReadyRow[] = [];
  const existing: UnitImportExistingRow[] = [];
  const duplicateNames: UnitImportDuplicateName[] = [];
  const invalidRows: UnitImportInvalidRow[] = [];

  const nameOccurrences = new Map<string, number[]>();
  for (const row of parsedRows) {
    if (!row.unitName) {
      continue;
    }
    const key = row.unitName.toLowerCase();
    const list = nameOccurrences.get(key);
    if (list) {
      list.push(row.rowNumber);
    } else {
      nameOccurrences.set(key, [row.rowNumber]);
    }
  }

  const duplicateNameKeys = new Set<string>();
  for (const [nameKey, rowNumbers] of nameOccurrences) {
    if (rowNumbers.length > 1) {
      duplicateNameKeys.add(nameKey);
      const sample = parsedRows.find((row) => row.unitName.toLowerCase() === nameKey);
      duplicateNames.push({
        unitName: sample?.unitName ?? nameKey,
        rowNumbers: [...rowNumbers].sort((a, b) => a - b),
      });
    }
  }

  const candidateNames: string[] = [];
  for (const row of parsedRows) {
    const validationError = validateParsedRow(row);
    if (validationError) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: validationError });
      continue;
    }
    if (duplicateNameKeys.has(row.unitName.toLowerCase())) {
      continue;
    }
    candidateNames.push(row.unitName);
  }

  const existingNames = await findExistingUnitNames(candidateNames);

  for (const row of parsedRows) {
    const validationError = validateParsedRow(row);
    if (validationError) {
      continue;
    }
    if (duplicateNameKeys.has(row.unitName.toLowerCase())) {
      continue;
    }
    if (existingNames.has(row.unitName.toLowerCase())) {
      existing.push({
        rowNumber: row.rowNumber,
        unitName: row.unitName,
      });
      continue;
    }

    ready.push({
      rowNumber: row.rowNumber,
      unitName: row.unitName,
      isActive: row.isActive,
    });
  }

  ready.sort((a, b) => a.rowNumber - b.rowNumber);
  existing.sort((a, b) => a.rowNumber - b.rowNumber);
  invalidRows.sort((a, b) => a.rowNumber - b.rowNumber);
  duplicateNames.sort((a, b) =>
    a.unitName.localeCompare(b.unitName, undefined, { sensitivity: "base" }),
  );

  return {
    ready,
    existing,
    duplicateNames,
    invalidRows,
    summary: {
      totalRows: parsedRows.length,
      readyCount: ready.length,
      existingCount: existing.length,
      duplicateNameCount: duplicateNames.length,
      invalidRowCount: invalidRows.length,
    },
  };
}

export async function confirmUnitImport(
  input: UnitImportConfirmInput,
): Promise<UnitImportConfirmResponse> {
  const uniqueByName = new Map<string, UnitImportConfirmInput["units"][number]>();

  for (const unit of input.units) {
    const key = unit.unitName.toLowerCase();
    if (uniqueByName.has(key)) {
      throw new AppError("Duplicate unit names in the import request are not allowed.", 400);
    }
    uniqueByName.set(key, unit);
  }

  const unitsToImport = [...uniqueByName.values()];

  try {
    return await getDb().transaction(async (tx) => {
      const names = unitsToImport.map((row) => row.unitName.toLowerCase());
      const existingRows = await tx
        .select({ unitName: units.unitName })
        .from(units)
        .where(
          sql`lower(${units.unitName}) in (${sql.join(
            names.map((name) => sql`${name}`),
            sql`, `,
          )})`,
        );

      const existingNames = new Set(existingRows.map((row) => row.unitName.toLowerCase()));
      const toInsert = unitsToImport.filter(
        (row) => !existingNames.has(row.unitName.toLowerCase()),
      );

      if (toInsert.length > 0) {
        await tx.insert(units).values(
          toInsert.map((row) => ({
            unitName: row.unitName,
            isActive: row.isActive,
          })),
        );
      }

      return {
        importedCount: toInsert.length,
        skippedExistingCount: unitsToImport.length - toInsert.length,
      };
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapUnitDatabaseError(error);
  }
}
