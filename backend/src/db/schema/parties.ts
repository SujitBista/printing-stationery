import { sql } from "drizzle-orm";
import {
  boolean,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const parties = pgTable(
  "parties",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partyCode: varchar("party_code", { length: 20 }).notNull(),
    partyName: varchar("party_name", { length: 200 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("parties_party_code_lower_uidx").on(
      sql`lower(${table.partyCode})`,
    ),
  ],
);

export type PartyRow = typeof parties.$inferSelect;
export type NewPartyRow = typeof parties.$inferInsert;
