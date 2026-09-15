/** Configured store code of the Corporate / control store. Not a database UUID. */
export const CORPORATE_STORE_CODE = "999";

export type CorporateStoreIdentity = {
  storeCode: string;
  storeName?: string | null;
  underStoreId?: string | null;
  branchType?: string | null;
};

/**
 * Identifies the Corporate Store from store configuration: code 999, or the
 * unique head-office root store named Corporate Store.
 */
export function isCorporateControlStore(
  store: CorporateStoreIdentity,
): boolean {
  if (store.storeCode.trim() === CORPORATE_STORE_CODE) {
    return true;
  }

  const name = store.storeName?.trim().toLowerCase() ?? "";
  const isHeadOfficeRoot =
    store.branchType === "HEAD_OFFICE" && (store.underStoreId ?? null) === null;

  return isHeadOfficeRoot && name === "corporate store";
}

export function preferCorporateControlStore<T extends CorporateStoreIdentity>(
  stores: readonly T[],
): T | undefined {
  const byCode = stores.find(
    (store) => store.storeCode.trim() === CORPORATE_STORE_CODE,
  );
  if (byCode) {
    return byCode;
  }

  const matches = stores.filter((store) => isCorporateControlStore(store));
  if (matches.length === 1) {
    return matches[0];
  }

  return undefined;
}
