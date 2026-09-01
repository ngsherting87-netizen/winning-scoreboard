CREATE TABLE `activity_definitions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`label_zh` text NOT NULL,
	`label_en` text NOT NULL,
	`points` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_activity_definitions_code` ON `activity_definitions` (`code`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'agent' NOT NULL,
	`user_id` text,
	`user_email` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agents_code` ON `agents` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_agents_user_id` ON `agents` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_agents_active_role` ON `agents` (`active`,`role`);--> statement-breakpoint
CREATE TABLE `daily_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` integer NOT NULL,
	`activity_id` integer NOT NULL,
	`activity_date` text NOT NULL,
	`completed` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activity_id`) REFERENCES `activity_definitions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_daily_agent_date_activity` ON `daily_activity` (`agent_id`,`activity_date`,`activity_id`);--> statement-breakpoint
CREATE INDEX `idx_daily_agent_date` ON `daily_activity` (`agent_id`,`activity_date`);--> statement-breakpoint
CREATE TABLE `weekly_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` integer NOT NULL,
	`week_start` text NOT NULL,
	`strongest_action` text DEFAULT '' NOT NULL,
	`biggest_gap` text DEFAULT '' NOT NULL,
	`top_prospects` text DEFAULT '' NOT NULL,
	`next_improvement` text DEFAULT '' NOT NULL,
	`next_case_target` text DEFAULT '' NOT NULL,
	`next_tpc_target` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_weekly_agent_week` ON `weekly_reviews` (`agent_id`,`week_start`);