import { inArray, sql } from "drizzle-orm";
import type {
  ItemImportConfirmInput,
  ItemImportConfirmResponse,
  ItemImportDuplicateCode,
  ItemImportExistingRow,
  ItemImportInvalidRow,
  ItemImportPreviewResponse,
  ItemImportReadyRow,
  ItemImportUnknownGroupRow,
  ItemImportUnknownUnitRow,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import { itemGroups } from "../db/schema/item-groups.js";
import { items } from "../db/schema/items.js";
import { units } from "../db/schema/units.js";
import { AppError } from "../utils/errors.js";
import { mapItemDatabaseError } from "../utils/db-errors.js";
import {
  parseItemImportWorkbook,
  type ParsedItemImportRow,
} from "../utils/item-import-xlsx.js";

const ITEM_CODE_MAX = 30;
const ITEM_NAME_MIN = 2;
const ITEM_NAME_MAX = 150;
const PURCHASE_RATE_PATTERN = /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/;

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseReturnType(raw: string): "RETURNABLE" | "NON_RETURNABLE" | null {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) {
    return "NON_RETURNABLE";
  }
  if (
    ["non refundable", "non-refundable", "non_returnable", "non returnable", "nonreturnable"].includes(
      normalized,
    )
  ) {
    return "NON_RETURNABLE";
  }
  if (["refundable", "returnable"].includes(normalized)) {
    return "RETURNABLE";
  }
  return null;
}

function validateParsedRow(row: ParsedItemImportRow): string | null {
  if (!row.itemCode) {
    return "Item code is required.";
  }
  if (row.itemCode.length > ITEM_CODE_MAX) {
    return `Item code must be between 1 and ${ITEM_CODE_MAX} characters.`;
  }
  if (!row.itemName) {
    return "Item name is required.";
  }
  if (row.itemName.length < ITEM_NAME_MIN || row.itemName.length > ITEM_NAME_MAX) {
    return `Item name must be between ${ITEM_NAME_MIN} and ${ITEM_NAME_MAX} characters.`;
  }
  if (!PURCHASE_RATE_PATTERN.test(row.purchaseRate)) {
    return "Purchase rate must be a valid non-negative decimal with up to 4 fractional digits.";
  }
  if (row.remarks.length > 500) {
    return "Remarks must be at most 500 characters.";
  }
  if (parseReturnType(row.refundTypeName) === null) {
    return `Unrecognized return type "${row.refundTypeName}".`;
  }
  return null;
}

type UnitLookup = { id: string; unitName: string; isActive: boolean };
type GroupLookup = {
  id: string;
  groupCode: string;
  groupName: string;
  isActive: boolean;
};

async function loadUnitLookups(): Promise<{
  byName: Map<string, UnitLookup[]>;
}> {
  const rows = await getDb()
    .select({
      id: units.id,
      unitName: units.unitName,
      isActive: units.isActive,
    })
    .from(units);

  const byName = new Map<string, UnitLookup[]>();
  for (const row of rows) {
    const key = normalizeLookupKey(row.unitName);
    const list = byName.get(key);
    if (list) {
      list.push(row);
    } else {
      byName.set(key, [row]);
    }
  }
  return { byName };
}

async function loadGroupLookups(): Promise<{
  byName: Map<string, GroupLookup[]>;
  byCode: Map<string, GroupLookup[]>;
}> {
  const rows = await getDb()
    .select({
      id: itemGroups.id,
      groupCode: itemGroups.groupCode,
      groupName: itemGroups.groupName,
      isActive: itemGroups.isActive,
    })
    .from(itemGroups);

  const byName = new Map<string, GroupLookup[]>();
  const byCode = new Map<string, GroupLookup[]>();
  for (const row of rows) {
    const nameKey = normalizeLookupKey(row.groupName);
    const codeKey = normalizeLookupKey(row.groupCode);
    const nameList = byName.get(nameKey);
    if (nameList) {
      nameList.push(row);
    } else {
      byName.set(nameKey, [row]);
    }
    const codeList = byCode.get(codeKey);
    if (codeList) {
      codeList.push(row);
    } else {
      byCode.set(codeKey, [row]);
    }
  }
  return { byName, byCode };
}

function resolveUnit(
  unitName: string,
  lookups: { byName: Map<string, UnitLookup[]> },
): { unit: UnitLookup | null; reason?: string } {
  if (!unitName) {
    return { unit: null, reason: "Unit name is required." };
  }
  const matches = lookups.byName.get(normalizeLookupKey(unitName)) ?? [];
  if (matches.length === 0) {
    return { unit: null };
  }
  if (matches.length > 1) {
    return { unit: null, reason: `Ambiguous unit name "${unitName}".` };
  }
  const unit = matches[0]!;
  if (!unit.isActive) {
    return { unit: null, reason: `Unit "${unit.unitName}" is inactive.` };
  }
  return { unit };
}

function resolveGroup(
  groupName: string,
  lookups: { byName: Map<string, GroupLookup[]>; byCode: Map<string, GroupLookup[]> },
): { group: GroupLookup | null; reason?: string } {
  if (!groupName) {
    return { group: null, reason: "Group name is required." };
  }
  const key = normalizeLookupKey(groupName);
  const matches = [
    ...(lookups.byName.get(key) ?? []),
    ...(lookups.byCode.get(key) ?? []),
  ];
  const unique = [...new Map(matches.map((row) => [row.id, row])).values()];
  if (unique.length === 0) {
    return { group: null };
  }
  if (unique.length > 1) {
    return { group: null, reason: `Ambiguous group name "${groupName}".` };
  }
  const group = unique[0]!;
  if (!group.isActive) {
    return { group: null, reason: `Item group "${group.groupName}" is inactive.` };
  }
  return { group };
}

async function findExistingItemCodes(codes: string[]): Promise<Set<string>> {
  if (codes.length === 0) {
    return new Set();
  }
  const lowered = [...new Set(codes.map((code) => code.toLowerCase()))];
  const rows = await getDb()
    .select({ itemCode: items.itemCode })
    .from(items)
    .where(
      sql`lower(${items.itemCode}) in (${sql.join(
        lowered.map((code) => sql`${code}`),
        sql`, `,
      )})`,
    );
  return new Set(rows.map((row) => row.itemCode.toLowerCase()));
}

async function findExistingItemNames(names: string[]): Promise<Set<string>> {
  if (names.length === 0) {
    return new Set();
  }
  const lowered = [...new Set(names.map((name) => name.toLowerCase()))];
  const rows = await getDb()
    .select({ itemName: items.itemName })
    .from(items)
    .where(
      sql`lower(${items.itemName}) in (${sql.join(
        lowered.map((name) => sql`${name}`),
        sql`, `,
      )})`,
    );
  return new Set(rows.map((row) => row.itemName.toLowerCase()));
}

export async function previewItemImport(
  fileBuffer: Buffer,
): Promise<ItemImportPreviewResponse> {
  const parsedRows = await parseItemImportWorkbook(fileBuffer);
  const [unitLookups, groupLookups] = await Promise.all([
    loadUnitLookups(),
    loadGroupLookups(),
  ]);

  const ready: ItemImportReadyRow[] = [];
  const existing: ItemImportExistingRow[] = [];
  const duplicateCodes: ItemImportDuplicateCode[] = [];
  const unknownUnits: ItemImportUnknownUnitRow[] = [];
  const unknownGroups: ItemImportUnknownGroupRow[] = [];
  const invalidRows: ItemImportInvalidRow[] = [];

  const codeOccurrences = new Map<string, number[]>();
  for (const row of parsedRows) {
    if (!row.itemCode) {
      continue;
    }
    const key = row.itemCode.toLowerCase();
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
      const sample = parsedRows.find((row) => row.itemCode.toLowerCase() === codeKey);
      duplicateCodes.push({
        itemCode: sample?.itemCode ?? codeKey,
        rowNumbers: [...rowNumbers].sort((a, b) => a - b),
      });
    }
  }

  const candidateCodes: string[] = [];
  const candidateNames: string[] = [];

  for (const row of parsedRows) {
    const validationError = validateParsedRow(row);
    if (validationError) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: validationError });
      continue;
    }
    if (duplicateCodeKeys.has(row.itemCode.toLowerCase())) {
      continue;
    }

    const unitResult = resolveUnit(row.unitName, unitLookups);
    if (unitResult.reason) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: unitResult.reason });
      continue;
    }
    if (!unitResult.unit) {
      unknownUnits.push({
        rowNumber: row.rowNumber,
        itemCode: row.itemCode,
        unitName: row.unitName,
      });
      continue;
    }

    const groupResult = resolveGroup(row.groupName, groupLookups);
    if (groupResult.reason) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: groupResult.reason });
      continue;
    }
    if (!groupResult.group) {
      unknownGroups.push({
        rowNumber: row.rowNumber,
        itemCode: row.itemCode,
        groupName: row.groupName,
      });
      continue;
    }

    candidateCodes.push(row.itemCode);
    candidateNames.push(row.itemName);
  }

  const [existingCodes, existingNames] = await Promise.all([
    findExistingItemCodes(candidateCodes),
    findExistingItemNames(candidateNames),
  ]);

  for (const row of parsedRows) {
    const validationError = validateParsedRow(row);
    if (validationError) {
      continue;
    }
    if (duplicateCodeKeys.has(row.itemCode.toLowerCase())) {
      continue;
    }

    const unitResult = resolveUnit(row.unitName, unitLookups);
    if (!unitResult.unit || unitResult.reason) {
      continue;
    }
    const groupResult = resolveGroup(row.groupName, groupLookups);
    if (!groupResult.group || groupResult.reason) {
      continue;
    }

    if (
      existingCodes.has(row.itemCode.toLowerCase()) ||
      existingNames.has(row.itemName.toLowerCase())
    ) {
      existing.push({
        rowNumber: row.rowNumber,
        itemCode: row.itemCode,
        itemName: row.itemName,
      });
      continue;
    }

    ready.push({
      rowNumber: row.rowNumber,
      itemCode: row.itemCode,
      itemName: row.itemName,
      unitId: unitResult.unit.id,
      unitName: unitResult.unit.unitName,
      itemGroupId: groupResult.group.id,
      groupName: groupResult.group.groupName,
      returnType: parseReturnType(row.refundTypeName)!,
      purchaseRate: row.purchaseRate,
      remarks: row.remarks || null,
      isActive: row.isActive,
      isRequestable: row.isRequestable,
      isIssuable: row.isIssuable,
      trackSerialNumber: row.trackSerialNumber,
    });
  }

  ready.sort((a, b) => a.rowNumber - b.rowNumber);
  existing.sort((a, b) => a.rowNumber - b.rowNumber);
  invalidRows.sort((a, b) => a.rowNumber - b.rowNumber);
  unknownUnits.sort((a, b) => a.rowNumber - b.rowNumber);
  unknownGroups.sort((a, b) => a.rowNumber - b.rowNumber);
  duplicateCodes.sort((a, b) =>
    a.itemCode.localeCompare(b.itemCode, undefined, { sensitivity: "base" }),
  );

  return {
    ready,
    existing,
    duplicateCodes,
    unknownUnits,
    unknownGroups,
    invalidRows,
    summary: {
      totalRows: parsedRows.length,
      readyCount: ready.length,
      existingCount: existing.length,
      duplicateCodeCount: duplicateCodes.length,
      unknownUnitCount: unknownUnits.length,
      unknownGroupCount: unknownGroups.length,
      invalidRowCount: invalidRows.length,
    },
  };
}

export async function confirmItemImport(
  input: ItemImportConfirmInput,
): Promise<ItemImportConfirmResponse> {
  const uniqueByCode = new Map<string, ItemImportConfirmInput["items"][number]>();

  for (const item of input.items) {
    const key = item.itemCode.toLowerCase();
    if (uniqueByCode.has(key)) {
      throw new AppError("Duplicate item codes in the import request are not allowed.", 400);
    }
    uniqueByCode.set(key, item);
  }

  const itemsToImport = [...uniqueByCode.values()];

  try {
    return await getDb().transaction(async (tx) => {
      const codes = itemsToImport.map((row) => row.itemCode.toLowerCase());
      const names = itemsToImport.map((row) => row.itemName.toLowerCase());
      const unitIds = [...new Set(itemsToImport.map((row) => row.unitId))];
      const groupIds = [...new Set(itemsToImport.map((row) => row.itemGroupId))];

      const [existingCodeRows, existingNameRows, unitRows, groupRows] = await Promise.all([
        tx
          .select({ itemCode: items.itemCode })
          .from(items)
          .where(
            sql`lower(${items.itemCode}) in (${sql.join(
              codes.map((code) => sql`${code}`),
              sql`, `,
            )})`,
          ),
        tx
          .select({ itemName: items.itemName })
          .from(items)
          .where(
            sql`lower(${items.itemName}) in (${sql.join(
              names.map((name) => sql`${name}`),
              sql`, `,
            )})`,
          ),
        tx
          .select({ id: units.id, isActive: units.isActive })
          .from(units)
          .where(inArray(units.id, unitIds)),
        tx
          .select({ id: itemGroups.id, isActive: itemGroups.isActive })
          .from(itemGroups)
          .where(inArray(itemGroups.id, groupIds)),
      ]);

      const existingCodes = new Set(existingCodeRows.map((row) => row.itemCode.toLowerCase()));
      const existingNames = new Set(existingNameRows.map((row) => row.itemName.toLowerCase()));
      const unitById = new Map(unitRows.map((row) => [row.id, row]));
      const groupById = new Map(groupRows.map((row) => [row.id, row]));

      for (const row of itemsToImport) {
        const unit = unitById.get(row.unitId);
        if (!unit) {
          throw new AppError(`Unit was not found for item ${row.itemCode}.`, 400);
        }
        if (!unit.isActive) {
          throw new AppError(`Unit is inactive for item ${row.itemCode}.`, 400);
        }
        const group = groupById.get(row.itemGroupId);
        if (!group) {
          throw new AppError(`Item group was not found for item ${row.itemCode}.`, 400);
        }
        if (!group.isActive) {
          throw new AppError(`Item group is inactive for item ${row.itemCode}.`, 400);
        }
      }

      const toInsert = itemsToImport.filter(
        (row) =>
          !existingCodes.has(row.itemCode.toLowerCase()) &&
          !existingNames.has(row.itemName.toLowerCase()),
      );

      if (toInsert.length > 0) {
        await tx.insert(items).values(
          toInsert.map((row) => ({
            itemCode: row.itemCode,
            itemName: row.itemName,
            unitId: row.unitId,
            itemGroupId: row.itemGroupId,
            returnType: row.returnType,
            purchaseRate: row.purchaseRate,
            remarks: row.remarks,
            isActive: row.isActive,
            isRequestable: row.isRequestable,
            isIssuable: row.isIssuable,
            trackSerialNumber: row.trackSerialNumber,
          })),
        );
      }

      return {
        importedCount: toInsert.length,
        skippedExistingCount: itemsToImport.length - toInsert.length,
      };
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapItemDatabaseError(error);
  }
}
