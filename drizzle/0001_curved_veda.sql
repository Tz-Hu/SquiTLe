CREATE TABLE `sync_timelines` (
	`user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`title` text NOT NULL,
	`server_revision` integer NOT NULL,
	`document_json` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `document_id`)
);
