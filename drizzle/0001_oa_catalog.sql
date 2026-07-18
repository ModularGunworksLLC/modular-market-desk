CREATE TABLE IF NOT EXISTS `oa_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`condition` text NOT NULL,
	`manufacturer_id` integer NOT NULL,
	`manufacturer` text NOT NULL,
	`is_common` integer DEFAULT false NOT NULL,
	`model_id` integer NOT NULL,
	`model` text NOT NULL,
	`caliber_id` integer NOT NULL,
	`caliber` text NOT NULL,
	`synced_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `oa_catalog_uniq` ON `oa_catalog` (`condition`,`model_id`,`caliber_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `oa_catalog_mfr_idx` ON `oa_catalog` (`manufacturer`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `oa_catalog_model_idx` ON `oa_catalog` (`manufacturer`,`model`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `oa_catalog_ids_idx` ON `oa_catalog` (`model_id`,`caliber_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `oa_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'catalog' NOT NULL,
	`status` text NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`finished_at` integer,
	`manufacturer_count` integer,
	`model_count` integer,
	`row_count` integer,
	`error` text,
	`meta` text DEFAULT '{}' NOT NULL
);
