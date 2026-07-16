import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** Transaction origin — extend with `plaid` when bank sync ships. */
export const TRANSACTION_SOURCES = ["manual", "plaid"] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const households = sqliteTable("households", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  rolloverMode: integer("rollover_mode", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const budgetMonths = sqliteTable(
  "budget_months",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    month: integer("month").notNull(),
    notes: text("notes"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("budget_months_household_ym").on(t.householdId, t.year, t.month),
  ],
);

export const incomeLines = sqliteTable("income_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  monthId: integer("month_id")
    .notNull()
    .references(() => budgetMonths.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  plannedAmount: real("planned_amount").notNull().default(0),
  payDay: integer("pay_day"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const budgetLines = sqliteTable("budget_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  monthId: integer("month_id")
    .notNull()
    .references(() => budgetMonths.id, { onDelete: "cascade" }),
  groupName: text("group_name").notNull().default("Bills"),
  name: text("name").notNull(),
  plannedAmount: real("planned_amount").notNull().default(0),
  dueDay: integer("due_day"),
  isSinkingFund: integer("is_sinking_fund", { mode: "boolean" }).notNull().default(false),
  isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    householdId: integer("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    monthId: integer("month_id").references(() => budgetMonths.id, { onDelete: "set null" }),
    date: text("date").notNull(),
    amount: real("amount").notNull(),
    payee: text("payee").notNull(),
    memo: text("memo"),
    source: text("source").notNull().default("manual").$type<TransactionSource>(),
    pending: integer("pending", { mode: "boolean" }).notNull().default(false),
    /** Plaid dedupe key — null for manual rows. */
    plaidTransactionId: text("plaid_transaction_id"),
    plaidAccountId: text("plaid_account_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    uniqueIndex("transactions_plaid_txn").on(t.plaidTransactionId),
    index("transactions_household_date").on(t.householdId, t.date),
  ],
);

export const transactionSplits = sqliteTable(
  "transaction_splits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    transactionId: integer("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    budgetLineId: integer("budget_line_id")
      .notNull()
      .references(() => budgetLines.id, { onDelete: "cascade" }),
    amount: real("amount").notNull(),
  },
  (t) => [index("splits_line").on(t.budgetLineId)],
);

export const assignmentRules = sqliteTable("assignment_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  pattern: text("pattern").notNull(),
  budgetLineId: integer("budget_line_id").references(() => budgetLines.id, {
    onDelete: "set null",
  }),
  priority: integer("priority").notNull().default(0),
});

/** Plaid Link items — populated when bank sync is enabled. */
export const plaidItems = sqliteTable("plaid_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull(),
  institutionName: text("institution_name"),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  status: text("status").notNull().default("active"),
  cursor: text("cursor"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const plaidAccounts = sqliteTable(
  "plaid_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    plaidItemId: integer("plaid_item_id")
      .notNull()
      .references(() => plaidItems.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    name: text("name").notNull(),
    mask: text("mask"),
    type: text("type"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [uniqueIndex("plaid_accounts_account_id").on(t.accountId)],
);
