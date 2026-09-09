import { and, asc, count, eq, or, sql, type SQL } from "drizzle-orm";
import type {
  CreatePartyInput,
  PaginatedPartyResponse,
  Party,
  PartyListQuery,
  UpdatePartyInput,
  UpdatePartyStatusInput,
} from "@printing-stationery/shared";
import { getDb } from "../db/client.js";
import { parties, type PartyRow } from "../db/schema/parties.js";
import { AppError } from "../utils/errors.js";
import { mapPartyDatabaseError } from "../utils/db-errors.js";

function toParty(row: PartyRow): Party {
  return {
    id: row.id,
    partyCode: row.partyCode,
    partyName: row.partyName,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function escapeIlikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildListFilters(query: PartyListQuery): SQL | undefined {
  const conditions: SQL[] = [];

  if (query.status === "ACTIVE") {
    conditions.push(eq(parties.isActive, true));
  } else if (query.status === "INACTIVE") {
    conditions.push(eq(parties.isActive, false));
  }

  if (query.search) {
    const pattern = `%${escapeIlikePattern(query.search)}%`;
    const searchCondition = or(
      sql`${parties.partyCode} ILIKE ${pattern} ESCAPE '\\'`,
      sql`${parties.partyName} ILIKE ${pattern} ESCAPE '\\'`,
    );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  if (conditions.length === 0) {
    return undefined;
  }

  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

async function findPartyByCodeInsensitive(
  partyCode: string,
  excludeId?: string,
): Promise<PartyRow | undefined> {
  const conditions: SQL[] = [
    sql`lower(${parties.partyCode}) = ${partyCode.toLowerCase()}`,
  ];

  if (excludeId) {
    conditions.push(sql`${parties.id} <> ${excludeId}`);
  }

  const where =
    conditions.length === 1 ? conditions[0]! : and(...conditions)!;

  try {
    const rows = await getDb().select().from(parties).where(where).limit(1);
    return rows[0];
  } catch (error) {
    mapPartyDatabaseError(error);
  }
}

export async function listParties(
  query: PartyListQuery,
): Promise<PaginatedPartyResponse> {
  const where = buildListFilters(query);

  try {
    const countQuery = getDb().select({ value: count() }).from(parties);
    const countRows = where ? await countQuery.where(where) : await countQuery;
    const totalItems = countRows[0]?.value ?? 0;

    const totalPages =
      totalItems === 0 ? 0 : Math.ceil(totalItems / query.pageSize);
    const offset = (query.page - 1) * query.pageSize;

    const listQuery = getDb()
      .select()
      .from(parties)
      .orderBy(asc(parties.partyName), asc(parties.id))
      .limit(query.pageSize)
      .offset(offset);

    const rows = where ? await listQuery.where(where) : await listQuery;

    return {
      items: rows.map(toParty),
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages,
    };
  } catch (error) {
    mapPartyDatabaseError(error);
  }
}

export async function getPartyById(id: string): Promise<Party> {
  try {
    const rows = await getDb()
      .select()
      .from(parties)
      .where(eq(parties.id, id))
      .limit(1);

    const row = rows[0];
    if (!row) {
      throw new AppError("Party not found", 404);
    }

    return toParty(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapPartyDatabaseError(error);
  }
}

export async function createParty(input: CreatePartyInput): Promise<Party> {
  const existing = await findPartyByCodeInsensitive(input.partyCode);
  if (existing) {
    throw new AppError("A party with this party code already exists", 409);
  }

  try {
    const rows = await getDb()
      .insert(parties)
      .values({
        partyCode: input.partyCode,
        partyName: input.partyName,
        isActive: input.isActive,
      })
      .returning();

    const row = rows[0];
    if (!row) {
      throw new AppError("Failed to create party", 500);
    }

    return toParty(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapPartyDatabaseError(error);
  }
}

export async function updateParty(
  id: string,
  input: UpdatePartyInput,
): Promise<Party> {
  if (input.partyCode !== undefined) {
    const existing = await findPartyByCodeInsensitive(input.partyCode, id);
    if (existing) {
      throw new AppError("A party with this party code already exists", 409);
    }
  }

  const updates: {
    partyCode?: string;
    partyName?: string;
    updatedAt: SQL;
  } = {
    updatedAt: sql`now()`,
  };

  if (input.partyCode !== undefined) {
    updates.partyCode = input.partyCode;
  }
  if (input.partyName !== undefined) {
    updates.partyName = input.partyName;
  }

  try {
    const rows = await getDb()
      .update(parties)
      .set(updates)
      .where(eq(parties.id, id))
      .returning();

    const row = rows[0];
    if (!row) {
      throw new AppError("Party not found", 404);
    }

    return toParty(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapPartyDatabaseError(error);
  }
}

export async function updatePartyStatus(
  id: string,
  input: UpdatePartyStatusInput,
): Promise<Party> {
  try {
    const rows = await getDb()
      .update(parties)
      .set({
        isActive: input.isActive,
        updatedAt: sql`now()`,
      })
      .where(eq(parties.id, id))
      .returning();

    const row = rows[0];
    if (!row) {
      throw new AppError("Party not found", 404);
    }

    return toParty(row);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    mapPartyDatabaseError(error);
  }
}
