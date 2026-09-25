CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`user_id` integer,
	`type` text NOT NULL,
	`direction` text,
	`outcome` text,
	`notes` text,
	`duration_min` integer,
	`ref_type` text,
	`ref_id` integer,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `activities_client_idx` ON `activities` (`client_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `activities_ref_idx` ON `activities` (`ref_type`,`ref_id`);--> statement-breakpoint
CREATE TABLE `asset_photos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`url` text NOT NULL,
	`kind` text DEFAULT 'day' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`city` text NOT NULL,
	`area` text,
	`address` text,
	`landmark` text,
	`map_link` text,
	`width_ft` real,
	`height_ft` real,
	`resolution` text,
	`illumination` text,
	`loop_seconds` integer,
	`slot_seconds` integer,
	`total_slots` integer DEFAULT 1 NOT NULL,
	`sale_mode` text DEFAULT 'exclusive' NOT NULL,
	`monthly_rate` integer DEFAULT 0 NOT NULL,
	`slot_rate` integer,
	`min_days` integer DEFAULT 7 NOT NULL,
	`daily_traffic` integer,
	`operating_hours` text,
	`status` text DEFAULT 'active' NOT NULL,
	`ownership` text DEFAULT 'owned' NOT NULL,
	`site_owner_id` integer,
	`rent_monthly` integer,
	`lease_end` text,
	`permit_number` text,
	`permit_expiry` text,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`site_owner_id`) REFERENCES `site_owners`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_code_unique` ON `assets` (`code`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` integer,
	`summary` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `booking_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`booking_id` integer NOT NULL,
	`asset_id` integer,
	`kind` text NOT NULL,
	`url` text NOT NULL,
	`name` text NOT NULL,
	`uploaded_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `booking_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`booking_id` integer NOT NULL,
	`kind` text DEFAULT 'media' NOT NULL,
	`asset_id` integer,
	`description` text,
	`start_date` text,
	`end_date` text,
	`mode` text,
	`slots` integer,
	`amount` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `booking_lines_asset_idx` ON `booking_lines` (`asset_id`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` text NOT NULL,
	`client_id` integer NOT NULL,
	`quote_id` integer,
	`version_id` integer,
	`title` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`ro_number` text,
	`ro_date` text,
	`advance_amount` integer,
	`payment_terms` text,
	`owner_id` integer,
	`commission_pct` real DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`cancel_reason` text,
	`created_by` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `quote_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_number_unique` ON `bookings` (`number`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'advertiser' NOT NULL,
	`industry` text,
	`website` text,
	`phone` text,
	`email` text,
	`address` text,
	`city` text,
	`state` text,
	`state_code` text,
	`gstin` text,
	`pan` text,
	`source` text,
	`requirement` text,
	`preferred_locations` text,
	`budget` integer,
	`timing` text,
	`stage` text DEFAULT 'new' NOT NULL,
	`lost_reason` text,
	`owner_id` integer,
	`agency_commission` real DEFAULT 0 NOT NULL,
	`credit_days` integer,
	`notes` text,
	`last_activity_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `clients_owner_idx` ON `clients` (`owner_id`);--> statement-breakpoint
CREATE INDEX `clients_stage_idx` ON `clients` (`stage`);--> statement-breakpoint
CREATE TABLE `company_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`company_name` text NOT NULL,
	`legal_name` text,
	`address` text,
	`city` text,
	`state` text,
	`state_code` text,
	`gstin` text,
	`pan` text,
	`phone` text,
	`email` text,
	`website` text,
	`bank_name` text,
	`bank_account` text,
	`bank_ifsc` text,
	`upi_id` text,
	`sac_code` text DEFAULT '998366' NOT NULL,
	`gst_rate` real DEFAULT 18 NOT NULL,
	`hold_hours` integer DEFAULT 48 NOT NULL,
	`quote_validity_days` integer DEFAULT 15 NOT NULL,
	`exec_discount_limit` real DEFAULT 10 NOT NULL,
	`manager_discount_limit` real DEFAULT 20 NOT NULL,
	`payment_terms_days` integer DEFAULT 15 NOT NULL,
	`quote_terms` text,
	`invoice_terms` text
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`name` text NOT NULL,
	`designation` text,
	`phone` text,
	`email` text,
	`is_primary` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `holds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`quote_id` integer NOT NULL,
	`client_id` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`slots` integer NOT NULL,
	`exclusive` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `holds_asset_idx` ON `holds` (`asset_id`,`status`);--> statement-breakpoint
CREATE TABLE `invoice_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer NOT NULL,
	`description` text NOT NULL,
	`sac` text,
	`is_media` integer DEFAULT true NOT NULL,
	`amount` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` text,
	`kind` text DEFAULT 'tax' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`client_id` integer NOT NULL,
	`booking_id` integer,
	`issue_date` text NOT NULL,
	`due_date` text NOT NULL,
	`place_of_supply` text,
	`gross` integer DEFAULT 0 NOT NULL,
	`commission_pct` real DEFAULT 0 NOT NULL,
	`commission` integer DEFAULT 0 NOT NULL,
	`taxable` integer DEFAULT 0 NOT NULL,
	`cgst` integer DEFAULT 0 NOT NULL,
	`sgst` integer DEFAULT 0 NOT NULL,
	`igst` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`cancel_reason` text,
	`created_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_number_unique` ON `invoices` (`number`);--> statement-breakpoint
CREATE TABLE `maintenance_tickets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`asset_id` integer NOT NULL,
	`title` text NOT NULL,
	`notes` text,
	`status` text DEFAULT 'open' NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`assigned_to` integer,
	`cost` integer,
	`created_by` integer,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `number_series` (
	`key` text PRIMARY KEY NOT NULL,
	`next` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_id` integer NOT NULL,
	`client_id` integer NOT NULL,
	`receipt_number` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`tds` integer DEFAULT 0 NOT NULL,
	`mode` text NOT NULL,
	`reference` text,
	`notes` text,
	`recorded_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_receipt_number_unique` ON `payments` (`receipt_number`);--> statement-breakpoint
CREATE TABLE `quote_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version_id` integer NOT NULL,
	`kind` text NOT NULL,
	`asset_id` integer,
	`description` text,
	`start_date` text,
	`end_date` text,
	`days` integer,
	`mode` text,
	`slots` integer,
	`rate` integer DEFAULT 0 NOT NULL,
	`qty` real DEFAULT 1 NOT NULL,
	`gross` integer DEFAULT 0 NOT NULL,
	`discount_pct` real DEFAULT 0 NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `quote_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `quote_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`quote_id` integer NOT NULL,
	`version` integer NOT NULL,
	`media_gross` integer DEFAULT 0 NOT NULL,
	`discount_total` integer DEFAULT 0 NOT NULL,
	`commission_pct` real DEFAULT 0 NOT NULL,
	`commission` integer DEFAULT 0 NOT NULL,
	`production` integer DEFAULT 0 NOT NULL,
	`taxable` integer DEFAULT 0 NOT NULL,
	`cgst` integer DEFAULT 0 NOT NULL,
	`sgst` integer DEFAULT 0 NOT NULL,
	`igst` integer DEFAULT 0 NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`max_discount_pct` real DEFAULT 0 NOT NULL,
	`approved_by` integer,
	`approved_at` integer,
	`notes` text,
	`terms` text,
	`sent_via` text,
	`sent_to` text,
	`created_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` text NOT NULL,
	`client_id` integer NOT NULL,
	`created_by` integer NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`valid_until` text,
	`sent_at` integer,
	`responded_at` integer,
	`reject_reason` text,
	`booking_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_number_unique` ON `quotes` (`number`);--> statement-breakpoint
CREATE TABLE `site_owners` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`email` text,
	`address` text,
	`notes` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stored_files` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`data` blob NOT NULL,
	`uploaded_by` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer,
	`assigned_to` integer NOT NULL,
	`created_by` integer,
	`title` text NOT NULL,
	`notes` text,
	`due_at` integer NOT NULL,
	`priority` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`outcome` text,
	`completed_at` integer,
	`ref_type` text,
	`ref_id` integer,
	`auto_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_auto_key_unique` ON `tasks` (`auto_key`);--> statement-breakpoint
CREATE INDEX `tasks_assignee_idx` ON `tasks` (`assigned_to`,`status`,`due_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`phone` text,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);