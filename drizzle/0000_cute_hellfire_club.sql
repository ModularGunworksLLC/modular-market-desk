CREATE TABLE `catalog_items` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_name` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`sku` text,
	`upc` text,
	`manufacturer` text NOT NULL,
	`model` text NOT NULL,
	`caliber` text,
	`category` text,
	`description` text,
	`dealer_price` real NOT NULL,
	`msrp` real,
	`map_price` real,
	`sale_price` real,
	`on_sale` integer DEFAULT false NOT NULL,
	`qty` integer,
	`in_stock` integer DEFAULT true NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`source_file` text,
	`imported_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_items_vendor_dedupe_ux` ON `catalog_items` (`vendor_name`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `catalog_items_upc_idx` ON `catalog_items` (`upc`);--> statement-breakpoint
CREATE INDEX `catalog_items_mfr_model_idx` ON `catalog_items` (`manufacturer`,`model`);--> statement-breakpoint
CREATE INDEX `catalog_items_vendor_sku_idx` ON `catalog_items` (`vendor_name`,`sku`);--> statement-breakpoint
CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`vendor` text NOT NULL,
	`label` text NOT NULL,
	`secret` text NOT NULL,
	`meta` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`last_used_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connections_vendor_kind_ux` ON `connections` (`vendor`,`kind`);--> statement-breakpoint
CREATE TABLE `csv_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_name` text NOT NULL,
	`label` text NOT NULL,
	`delimiter` text DEFAULT ',' NOT NULL,
	`encoding` text DEFAULT 'utf-8' NOT NULL,
	`column_map` text NOT NULL,
	`category_rules` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `csv_presets_vendor_ux` ON `csv_presets` (`vendor_name`);--> statement-breakpoint
CREATE TABLE `valuations` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`canonical_key` text NOT NULL,
	`category` text,
	`manufacturer` text NOT NULL,
	`model` text NOT NULL,
	`variant` text,
	`upc` text,
	`mpn` text,
	`caliber` text,
	`condition` text DEFAULT 'any' NOT NULL,
	`target_acquisition_cost` real NOT NULL,
	`inbound_ship` real DEFAULT 0 NOT NULL,
	`buyer_premium_pct` real DEFAULT 0 NOT NULL,
	`outbound_ship` real DEFAULT 0 NOT NULL,
	`listing_upgrades` real DEFAULT 0 NOT NULL,
	`target_profit` real NOT NULL,
	`min_margin_pct` real NOT NULL,
	`all_in_cost` real NOT NULL,
	`sold_stats` text,
	`asking_stats` text,
	`verdict` text NOT NULL,
	`best_route` text,
	`max_bid` real,
	`net_profit` real,
	`margin_pct` real,
	`route_a` text,
	`route_b` text,
	`wholesale_grid` text,
	`source_status` text DEFAULT '{}' NOT NULL,
	`raw` text
);
--> statement-breakpoint
CREATE INDEX `valuations_canonical_idx` ON `valuations` (`canonical_key`);--> statement-breakpoint
CREATE INDEX `valuations_upc_idx` ON `valuations` (`upc`);--> statement-breakpoint
CREATE INDEX `valuations_created_idx` ON `valuations` ("created_at" DESC);