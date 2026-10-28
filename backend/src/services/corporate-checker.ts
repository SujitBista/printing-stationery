import { and, eq } from "drizzle-orm";
import { isCorporateControlStore } from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import { branches } from "../db/schema/branches.js";
import { stores } from "../db/schema/stores.js";
import { storeUsers } from "../db/schema/store-users.js";

/** Active supervisor of the Corporate Store (code 999, or the head-office Corporate Store). */
export async function userSupervisesCorporateStore(
  userId: string,
): Promise<boolean> {
  const rows = await getDb()
    .select({
      storeCode: stores.storeCode,
      storeName: stores.storeName,
      underStoreId: stores.underStoreId,
      branchType: branches.branchType,
    })
    .from(storeUsers)
    .innerJoin(stores, eq(storeUsers.storeId, stores.id))
    .innerJoin(branches, eq(stores.branchId, branches.id))
    .where(
      and(
        eq(storeUsers.supervisorApplicationUserId, userId),
        eq(storeUsers.isActive, true),
      ),
    );

  return rows.some((row) => isCorporateControlStore(row));
}
