CREATE TABLE `candidate` (
	`id` text PRIMARY KEY NOT NULL,
	`species` text NOT NULL,
	`source_feature_id` text NOT NULL,
	`name` text,
	`centroid_lat` real NOT NULL,
	`centroid_lng` real NOT NULL,
	`min_lat` real NOT NULL,
	`min_lng` real NOT NULL,
	`max_lat` real NOT NULL,
	`max_lng` real NOT NULL,
	`area_ha` real,
	`region` text NOT NULL,
	`pipeline_version` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cand_species_region_idx` ON `candidate` (`species`,`region`);--> statement-breakpoint
CREATE INDEX `cand_bbox_idx` ON `candidate` (`min_lat`,`min_lng`,`max_lat`,`max_lng`);--> statement-breakpoint
CREATE TABLE `candidate_score` (
	`candidate_id` text NOT NULL,
	`species` text NOT NULL,
	`pipeline_version` text NOT NULL,
	`composite` real NOT NULL,
	`confidence` text NOT NULL,
	`factors` text NOT NULL,
	`why` text NOT NULL,
	`scored_at` integer NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidate`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cand_score_rank_idx` ON `candidate_score` (`species`,`composite`);--> statement-breakpoint
CREATE INDEX `cand_score_pk_idx` ON `candidate_score` (`candidate_id`,`pipeline_version`);--> statement-breakpoint
CREATE TABLE `species_dataset` (
	`species` text NOT NULL,
	`region` text NOT NULL,
	`pipeline_version` text NOT NULL,
	`kind` text NOT NULL,
	`r2_key` text NOT NULL,
	`published_at` integer NOT NULL
);
