import { inArray, sql } from "drizzle-orm";
import type {
  StoreImportConfirmInput,
  StoreImportConfirmResponse,
  StoreImportDuplicateCode,
  StoreImportExistingRow,
  StoreImportInvalidRow,
  StoreImportPreviewResponse,
  StoreImportReadyRow,
  StoreImportUnknownBranchRow,
  StoreImportUnknownUnderStoreRow,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import { branches } from "../db/schema/branches.js";
import { stores } from "../db/schema/stores.js";
import { AppError } from "../utils/errors.js";
import { mapStoreDatabaseError } from "../utils/db-errors.js";
import {
  parseStoreImportWorkbook,
  type ParsedStoreImportRow,
} from "../utils/store-import-xlsx.js";

const STORE_CODE_MAX = 30;
const STORE_NAME_MIN = 2;
const STORE_NAME_MAX = 150;

type BranchLookup = {
  id: string;
  branchCode: string;
  branchName: string;
  isActive: boolean;
};

type StoreLookup = {
  id: string;
  storeCode: string;
  storeName: string;
  branchId: string;
  isActive: boolean;
};

function normalizeNameKey(value: string): string {
  return value.trim().toLowerCase();
}

function validateParsedRow(row: ParsedStoreImportRow): string | null {
  if (!row.storeCode) {
    return "Store code is required.";
  }
  if (row.storeCode.length > STORE_CODE_MAX) {
    return `Store code must be between 1 and ${STORE_CODE_MAX} characters.`;
  }
  if (!row.storeName) {
    return "Store name is required.";
  }
  if (
    row.storeName.length < STORE_NAME_MIN ||
    row.storeName.length > STORE_NAME_MAX
  ) {
    return `Store name must be between ${STORE_NAME_MIN} and ${STORE_NAME_MAX} characters.`;
  }
  if (!row.branchName) {
    return "Branch name is required.";
  }
  if (
    row.underStoreName &&
    normalizeNameKey(row.underStoreName) === normalizeNameKey(row.storeName)
  ) {
    return "A store cannot be nested under itself.";
  }
  return null;
}

async function loadBranchLookups(): Promise<Map<string, BranchLookup[]>> {
  const rows = await getDb()
    .select({
      id: branches.id,
      branchCode: branches.branchCode,
      branchName: branches.branchName,
      isActive: branches.isActive,
    })
    .from(branches);

  const byName = new Map<string, BranchLookup[]>();
  for (const row of rows) {
    const key = normalizeNameKey(row.branchName);
    const list = byName.get(key);
    if (list) {
      list.push(row);
    } else {
      byName.set(key, [row]);
    }
  }
  return byName;
}

async function loadStoreLookups(): Promise<{
  byCode: Map<string, StoreLookup>;
  byName: Map<string, StoreLookup[]>;
}> {
  const rows = await getDb()
    .select({
      id: stores.id,
      storeCode: stores.storeCode,
      storeName: stores.storeName,
      branchId: stores.branchId,
      isActive: stores.isActive,
    })
    .from(stores);

  const byCode = new Map<string, StoreLookup>();
  const byName = new Map<string, StoreLookup[]>();
  for (const row of rows) {
    byCode.set(normalizeNameKey(row.storeCode), row);
    const nameKey = normalizeNameKey(row.storeName);
    const list = byName.get(nameKey);
    if (list) {
      list.push(row);
    } else {
      byName.set(nameKey, [row]);
    }
  }
  return { byCode, byName };
}

function resolveBranch(
  branchName: string,
  byName: Map<string, BranchLookup[]>,
): { branch: BranchLookup | null; reason?: string } {
  const matches = byName.get(normalizeNameKey(branchName)) ?? [];
  if (matches.length === 0) {
    return { branch: null };
  }
  if (matches.length > 1) {
    return {
      branch: null,
      reason: `Ambiguous branch name "${branchName}".`,
    };
  }
  const branch = matches[0]!;
  if (!branch.isActive) {
    return {
      branch: null,
      reason: `Branch "${branch.branchName}" is inactive.`,
    };
  }
  return { branch };
}

function resolveUnderStore(
  underStoreName: string,
  storeLookups: { byName: Map<string, StoreLookup[]> },
  namesInFile: Set<string>,
): {
  underStoreId: string | null;
  resolved: boolean;
  reason?: string;
} {
  if (!underStoreName) {
    return { underStoreId: null, resolved: true };
  }

  const matches = storeLookups.byName.get(normalizeNameKey(underStoreName)) ?? [];
  if (matches.length > 1) {
    return {
      underStoreId: null,
      resolved: false,
      reason: `Ambiguous under-store name "${underStoreName}".`,
    };
  }
  if (matches.length === 1) {
    const underStore = matches[0]!;
    if (!underStore.isActive) {
      return {
        underStoreId: null,
        resolved: false,
        reason: `Under store "${underStore.storeName}" is inactive.`,
      };
    }
    return { underStoreId: underStore.id, resolved: true };
  }

  if (namesInFile.has(normalizeNameKey(underStoreName))) {
    return { underStoreId: null, resolved: true };
  }

  return { underStoreId: null, resolved: false };
}

export async function previewStoreImport(
  fileBuffer: Buffer,
): Promise<StoreImportPreviewResponse> {
  const parsedRows = await parseStoreImportWorkbook(fileBuffer);
  const [branchByName, storeLookups] = await Promise.all([
    loadBranchLookups(),
    loadStoreLookups(),
  ]);

  const namesInFile = new Set(
    parsedRows
      .filter((row) => row.storeName)
      .map((row) => normalizeNameKey(row.storeName)),
  );

  const ready: StoreImportReadyRow[] = [];
  const existing: StoreImportExistingRow[] = [];
  const duplicateCodes: StoreImportDuplicateCode[] = [];
  const unknownBranches: StoreImportUnknownBranchRow[] = [];
  const unknownUnderStores: StoreImportUnknownUnderStoreRow[] = [];
  const invalidRows: StoreImportInvalidRow[] = [];

  const codeOccurrences = new Map<string, number[]>();
  for (const row of parsedRows) {
    if (!row.storeCode) {
      continue;
    }
    const key = normalizeNameKey(row.storeCode);
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
        (row) => normalizeNameKey(row.storeCode) === codeKey,
      );
      duplicateCodes.push({
        storeCode: sample?.storeCode ?? codeKey,
        rowNumbers: [...rowNumbers].sort((a, b) => a - b),
      });
    }
  }

  const branchNameByBranchInFile = new Map<string, Set<string>>();

  for (const row of parsedRows) {
    const validationError = validateParsedRow(row);
    if (validationError) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: validationError });
      continue;
    }
    if (duplicateCodeKeys.has(normalizeNameKey(row.storeCode))) {
      continue;
    }

    const branchResult = resolveBranch(row.branchName, branchByName);
    if (branchResult.reason) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: branchResult.reason });
      continue;
    }
    if (!branchResult.branch) {
      unknownBranches.push({
        rowNumber: row.rowNumber,
        storeCode: row.storeCode,
        branchName: row.branchName,
      });
      continue;
    }

    const underResult = resolveUnderStore(
      row.underStoreName,
      storeLookups,
      namesInFile,
    );
    if (underResult.reason) {
      invalidRows.push({ rowNumber: row.rowNumber, reason: underResult.reason });
      continue;
    }
    if (!underResult.resolved) {
      unknownUnderStores.push({
        rowNumber: row.rowNumber,
        storeCode: row.storeCode,
        underStoreName: row.underStoreName,
      });
      continue;
    }

    const existingByCode = storeLookups.byCode.get(
      normalizeNameKey(row.storeCode),
    );
    if (existingByCode) {
      existing.push({
        rowNumber: row.rowNumber,
        storeCode: row.storeCode,
        storeName: row.storeName,
      });
      continue;
    }

    const namesForBranch =
      branchNameByBranchInFile.get(branchResult.branch.id) ?? new Set();
    if (namesForBranch.has(normalizeNameKey(row.storeName))) {
      invalidRows.push({
        rowNumber: row.rowNumber,
        reason: `Duplicate store name "${row.storeName}" for branch "${branchResult.branch.branchName}" in the workbook.`,
      });
      continue;
    }
    namesForBranch.add(normalizeNameKey(row.storeName));
    branchNameByBranchInFile.set(branchResult.branch.id, namesForBranch);

    const existingSameBranchName = (
      storeLookups.byName.get(normalizeNameKey(row.storeName)) ?? []
    ).some((store) => store.branchId === branchResult.branch!.id);
    if (existingSameBranchName) {
      existing.push({
        rowNumber: row.rowNumber,
        storeCode: row.storeCode,
        storeName: row.storeName,
      });
      continue;
    }

    ready.push({
      rowNumber: row.rowNumber,
      storeCode: row.storeCode,
      storeName: row.storeName,
      branchId: branchResult.branch.id,
      branchName: branchResult.branch.branchName,
      underStoreId: underResult.underStoreId,
      underStoreName: row.underStoreName || null,
      allowTransfer: row.allowTransfer,
      allowDepartmentIssue: row.allowDepartmentIssue,
      isActive: row.isActive,
    });
  }

  ready.sort((a, b) => a.rowNumber - b.rowNumber);
  existing.sort((a, b) => a.rowNumber - b.rowNumber);
  invalidRows.sort((a, b) => a.rowNumber - b.rowNumber);
  unknownBranches.sort((a, b) => a.rowNumber - b.rowNumber);
  unknownUnderStores.sort((a, b) => a.rowNumber - b.rowNumber);
  duplicateCodes.sort((a, b) =>
    a.storeCode.localeCompare(b.storeCode, undefined, { sensitivity: "base" }),
  );

  return {
    ready,
    existing,
    duplicateCodes,
    unknownBranches,
    unknownUnderStores,
    invalidRows,
    summary: {
      totalRows: parsedRows.length,
      readyCount: ready.length,
      existingCount: existing.length,
      duplicateCodeCount: duplicateCodes.length,
      unknownBranchCount: unknownBranches.length,
      unknownUnderStoreCount: unknownUnderStores.length,
      invalidRowCount: invalidRows.length,
    },
  };
}

function sortStoresParentsFirst(
  rows: StoreImportConfirmInput["stores"],
): StoreImportConfirmInput["stores"] {
  return [...rows].sort((a, b) => {
    const aNeedsParent = a.underStoreId || a.underStoreName ? 1 : 0;
    const bNeedsParent = b.underStoreId || b.underStoreName ? 1 : 0;
    return aNeedsParent - bNeedsParent;
  });
}

export async function confirmStoreImport(
  input: StoreImportConfirmInput,
): Promise<StoreImportConfirmResponse> {
  const uniqueByCode = new Map<string, StoreImportConfirmInput["stores"][number]>();

  for (const store of input.stores) {
    const key = normalizeNameKey(store.storeCode);
    if (uniqueByCode.has(key)) {
      throw new AppError(
        "Duplicate store codes in the import request are not allowed.",
        400,
      );
    }
    uniqueByCode.set(key, store);
  }

  const storesToImport = sortStoresParentsFirst([...uniqueByCode.values()]);

  try {
    return await getDb().transaction(async (tx) => {
      const codes = storesToImport.map((row) => normalizeNameKey(row.storeCode));
      const branchIds = [...new Set(storesToImport.map((row) => row.branchId))];
      const underStoreIds = [
        ...new Set(
          storesToImport
            .map((row) => row.underStoreId)
            .filter((id): id is string => typeof id === "string" && id.length > 0),
        ),
      ];

      const [existingCodeRows, branchRows, underStoreRows] = await Promise.all([
        tx
          .select({
            storeCode: stores.storeCode,
            storeName: stores.storeName,
            branchId: stores.branchId,
          })
          .from(stores)
          .where(
            sql`lower(${stores.storeCode}) in (${sql.join(
              codes.map((code) => sql`${code}`),
              sql`, `,
            )})`,
          ),
        tx
          .select({
            id: branches.id,
            isActive: branches.isActive,
          })
          .from(branches)
          .where(inArray(branches.id, branchIds)),
        underStoreIds.length > 0
          ? tx
              .select({
                id: stores.id,
                storeName: stores.storeName,
                isActive: stores.isActive,
              })
              .from(stores)
              .where(inArray(stores.id, underStoreIds))
          : Promise.resolve([]),
      ]);

      const existingCodes = new Set(
        existingCodeRows.map((row) => normalizeNameKey(row.storeCode)),
      );
      const branchById = new Map(branchRows.map((row) => [row.id, row]));
      const underStoreById = new Map(underStoreRows.map((row) => [row.id, row]));

      for (const row of storesToImport) {
        const branch = branchById.get(row.branchId);
        if (!branch) {
          throw new AppError(`Branch was not found for store ${row.storeCode}.`, 400);
        }
        if (!branch.isActive) {
          throw new AppError(`Branch is inactive for store ${row.storeCode}.`, 400);
        }
        if (row.underStoreId) {
          const underStore = underStoreById.get(row.underStoreId);
          if (!underStore) {
            throw new AppError(
              `Under store was not found for store ${row.storeCode}.`,
              400,
            );
          }
          if (!underStore.isActive) {
            throw new AppError(
              `Under store is inactive for store ${row.storeCode}.`,
              400,
            );
          }
        }
      }

      const toInsert = storesToImport.filter(
        (row) => !existingCodes.has(normalizeNameKey(row.storeCode)),
      );

      let importedCount = 0;
      for (const row of toInsert) {
        let underStoreId = row.underStoreId ?? null;
        if (!underStoreId && row.underStoreName) {
          const parentRows = await tx
            .select({
              id: stores.id,
              isActive: stores.isActive,
            })
            .from(stores)
            .where(sql`lower(${stores.storeName}) = ${normalizeNameKey(row.underStoreName)}`)
            .limit(2);

          if (parentRows.length === 0) {
            throw new AppError(
              `Under store "${row.underStoreName}" was not found for store ${row.storeCode}.`,
              400,
            );
          }
          if (parentRows.length > 1) {
            throw new AppError(
              `Ambiguous under-store name "${row.underStoreName}" for store ${row.storeCode}.`,
              400,
            );
          }
          const parent = parentRows[0]!;
          if (!parent.isActive) {
            throw new AppError(
              `Under store "${row.underStoreName}" is inactive for store ${row.storeCode}.`,
              400,
            );
          }
          underStoreId = parent.id;
        }

        const existingNameRows = await tx
          .select({ id: stores.id })
          .from(stores)
          .where(
            sql`${stores.branchId} = ${row.branchId} and lower(${stores.storeName}) = ${normalizeNameKey(row.storeName)}`,
          )
          .limit(1);

        if (existingNameRows.length > 0) {
          continue;
        }

        await tx.insert(stores).values({
          storeCode: row.storeCode,
          storeName: row.storeName,
          branchId: row.branchId,
          underStoreId,
          allowTransfer: row.allowTransfer,
          allowDepartmentIssue: row.allowDepartmentIssue,
          remarks: null,
          isActive: row.isActive,
        });
        importedCount += 1;
      }

      return {
        importedCount,
        skippedExistingCount: storesToImport.length - importedCount,
      };
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapStoreDatabaseError(error);
  }
}
