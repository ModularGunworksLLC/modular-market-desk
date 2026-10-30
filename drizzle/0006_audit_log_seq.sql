-- Rebuild audit_log with an AUTOINCREMENT seq so retention order does not depend
-- on one-second timestamps or random text ids. set/clear rows are not pruned in app code.
CREATE TABLE `audit_log_seq` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`target` text DEFAULT 'outdoor_analytics' NOT NULL,
	`detail` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
INSERT INTO `audit_log_seq` (`actor`, `action`, `target`, `detail`, `created_at`)
SELECT `actor`, `action`, `target`, `detail`, `created_at` FROM `audit_log` ORDER BY rowid;
--> statement-breakpoint
DROP TABLE `audit_log`;
--> statement-breakpoint
ALTER TABLE `audit_log_seq` RENAME TO `audit_log`;
