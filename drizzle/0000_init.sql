CREATE TABLE `candidate` (
	`id` text PRIMARY KEY NOT NULL,
	`species` text NOT NULL,
	`name` text,
	`area_ha` real,
	`composite` real NOT NULL,
	`confidence` text NOT NULL,
	`why` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `candidate_species_idx` ON `candidate` (`species`);--> statement-breakpoint
CREATE TABLE `species_dataset` (
	`species` text NOT NULL,
	`kind` text NOT NULL,
	`version` text NOT NULL,
	`r2_key` text NOT NULL,
	`published_at` integer NOT NULL,
	`meta` text,
	PRIMARY KEY(`species`, `kind`, `version`)
);
