import { sql } from "drizzle-orm";
import {
  boolean,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const branchTypeEnum = pgEnum("branch_type", ["HEAD_OFFICE", "BRANCH"]);

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchCode: varchar("branch_code", { length: 20 }).notNull(),
    branchName: varchar("branch_name", { length: 150 }).notNull(),
    branchType: branchTypeEnum("branch_type").notNull(),
    address: varchar("address", { length: 255 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("branches_branch_code_lower_uidx").on(
      sql`lower(${table.branchCode})`,
    ),
  ],
);

export type BranchRow = typeof branches.$inferSelect;
export type NewBranchRow = typeof branches.$inferInsert;
