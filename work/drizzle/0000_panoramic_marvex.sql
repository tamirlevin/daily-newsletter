CREATE TABLE `brief_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`issue_date` text NOT NULL,
	`generated_at` text NOT NULL,
	`published_at` text NOT NULL,
	`source_health` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `brief_runs_generated_at_idx` ON `brief_runs` (`generated_at`);