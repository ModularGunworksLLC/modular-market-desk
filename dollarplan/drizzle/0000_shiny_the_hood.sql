CREATE TABLE `assignment_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`pattern` text NOT NULL,
	`budget_line_id` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`budget_line_id`) REFERENCES `budget_lines`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `budget_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month_id` integer NOT NULL,
	`group_name` text DEFAULT 'Bills' NOT NULL,
	`name` text NOT NULL,
	`planned_amount` real DEFAULT 0 NOT NULL,
	`due_day` integer,
	`is_sinking_fund` integer DEFAULT false NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`month_id`) REFERENCES `budget_months`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `budget_months` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budget_months_household_ym` ON `budget_months` (`household_id`,`year`,`month`);--> statement-breakpoint
CREATE TABLE `households` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`rollover_mode` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `income_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`month_id` integer NOT NULL,
	`name` text NOT NULL,
	`planned_amount` real DEFAULT 0 NOT NULL,
	`pay_day` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`month_id`) REFERENCES `budget_months`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plaid_accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plaid_item_id` integer NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`mask` text,
	`type` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`plaid_item_id`) REFERENCES `plaid_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plaid_accounts_account_id` ON `plaid_accounts` (`account_id`);--> statement-breakpoint
CREATE TABLE `plaid_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`item_id` text NOT NULL,
	`institution_name` text,
	`access_token_encrypted` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`cursor` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `transaction_splits` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`transaction_id` integer NOT NULL,
	`budget_line_id` integer NOT NULL,
	`amount` real NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`budget_line_id`) REFERENCES `budget_lines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `splits_line` ON `transaction_splits` (`budget_line_id`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`month_id` integer,
	`date` text NOT NULL,
	`amount` real NOT NULL,
	`payee` text NOT NULL,
	`memo` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`pending` integer DEFAULT false NOT NULL,
	`plaid_transaction_id` text,
	`plaid_account_id` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`month_id`) REFERENCES `budget_months`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_plaid_txn` ON `transactions` (`plaid_transaction_id`);--> statement-breakpoint
CREATE INDEX `transactions_household_date` ON `transactions` (`household_id`,`date`);