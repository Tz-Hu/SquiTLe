CREATE TABLE `sync_documents` (
	`user_id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`server_revision` integer NOT NULL,
	`document_json` text NOT NULL,
	`updated_at` text NOT NULL
);
