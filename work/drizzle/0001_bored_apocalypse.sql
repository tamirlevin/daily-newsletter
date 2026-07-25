CREATE TABLE `email_deliveries` (
	`delivery_key` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`status` text NOT NULL,
	`provider` text DEFAULT 'resend' NOT NULL,
	`provider_message_id` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` text,
	`sent_at` text,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_deliveries_run_id_uidx` ON `email_deliveries` (`run_id`);--> statement-breakpoint
CREATE INDEX `email_deliveries_status_idx` ON `email_deliveries` (`status`);--> statement-breakpoint
DROP INDEX `brief_runs_generated_at_idx`;--> statement-breakpoint
ALTER TABLE `brief_runs` ADD `cadence` text DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE `brief_runs` ADD `updated_at` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `brief_runs` ADD `payload_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
DELETE FROM `brief_runs`
WHERE EXISTS (
	SELECT 1
	FROM `brief_runs` AS `newer`
	WHERE `newer`.`cadence` = `brief_runs`.`cadence`
		AND `newer`.`issue_date` = `brief_runs`.`issue_date`
		AND (
			`newer`.`generated_at` > `brief_runs`.`generated_at`
			OR (
				`newer`.`generated_at` = `brief_runs`.`generated_at`
				AND `newer`.`rowid` > `brief_runs`.`rowid`
			)
		)
);--> statement-breakpoint
UPDATE `brief_runs`
SET
	`payload_hash` = 'legacy:' || `run_id`,
	`run_id` = `cadence` || ':' || `issue_date`,
	`updated_at` = `published_at`;--> statement-breakpoint
CREATE UNIQUE INDEX `brief_runs_cadence_issue_date_uidx` ON `brief_runs` (`cadence`,`issue_date`);--> statement-breakpoint
CREATE INDEX `brief_runs_cadence_issue_date_idx` ON `brief_runs` (`cadence`,`issue_date`);
