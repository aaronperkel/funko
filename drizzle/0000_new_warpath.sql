CREATE TABLE `cron_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text DEFAULT 'running' NOT NULL,
	`pops_processed` integer DEFAULT 0 NOT NULL,
	`pops_failed` integer DEFAULT 0 NOT NULL,
	`notes` text
);
--> statement-breakpoint
CREATE TABLE `pops` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`line` text,
	`franchise` text,
	`item_number` integer,
	`upc` text,
	`price_charting_id` text,
	`price_charting_console` text,
	`ebay_epid` text,
	`match_status` text DEFAULT 'unmatched' NOT NULL,
	`needs_disambiguation` integer DEFAULT false NOT NULL,
	`search_override` text,
	`variant` text DEFAULT 'common' NOT NULL,
	`exclusive_to` text,
	`release_year` integer,
	`is_vaulted` integer DEFAULT false NOT NULL,
	`condition` text DEFAULT 'near_mint' NOT NULL,
	`has_box` integer DEFAULT true NOT NULL,
	`box_condition` text DEFAULT 'minor_damage' NOT NULL,
	`has_protector` integer DEFAULT false NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'owned' NOT NULL,
	`acquired_as` text DEFAULT 'unknown' NOT NULL,
	`purchase_price_cents` integer,
	`purchase_date` text,
	`purchase_source` text,
	`sold_price_cents` integer,
	`sold_date` text,
	`manual_value_cents` integer,
	`image_url` text,
	`catalog_image_url` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pops_status_idx` ON `pops` (`status`);--> statement-breakpoint
CREATE INDEX `pops_franchise_idx` ON `pops` (`franchise`);--> statement-breakpoint
CREATE INDEX `pops_upc_idx` ON `pops` (`upc`);--> statement-breakpoint
CREATE INDEX `pops_match_status_idx` ON `pops` (`match_status`);--> statement-breakpoint
CREATE TABLE `price_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`pop_id` text NOT NULL,
	`source` text NOT NULL,
	`loose_price_cents` integer,
	`damaged_box_price_cents` integer,
	`new_price_cents` integer,
	`sales_volume_yearly` integer,
	`currency` text DEFAULT 'USD' NOT NULL,
	`captured_at` text NOT NULL,
	`raw_json` text,
	FOREIGN KEY (`pop_id`) REFERENCES `pops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `price_snapshots_pop_captured_idx` ON `price_snapshots` (`pop_id`,`captured_at`);