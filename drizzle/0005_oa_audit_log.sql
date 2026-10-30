CREATE TABLE IF NOT EXISTS `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text DEFAULT 'outdoor_analytics' NOT NULL,
	`detail` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `audit_log_created_idx` ON `audit_log` (`created_at`);
