CREATE TABLE IF NOT EXISTS `trade_in_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`manufacturer` text NOT NULL,
	`model` text NOT NULL,
	`serial_number` text NOT NULL,
	`caliber` text,
	`customer_name` text NOT NULL,
	`customer_email` text NOT NULL,
	`customer_phone` text NOT NULL,
	`notes` text,
	`estimate_p25` real,
	`estimate_sold_count` integer,
	`estimate_label` text,
	`oa_model_id` integer,
	`oa_caliber_id` integer,
	`notify_sent` integer DEFAULT false NOT NULL,
	`notify_error` text,
	`source_ip` text,
	`user_agent` text,
	`handled_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `trade_in_requests_status_idx` ON `trade_in_requests` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `trade_in_requests_created_idx` ON `trade_in_requests` (`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `trade_in_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`stored_name` text NOT NULL,
	`thumb_name` text,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`request_id`) REFERENCES `trade_in_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `trade_in_photos_request_idx` ON `trade_in_photos` (`request_id`);
