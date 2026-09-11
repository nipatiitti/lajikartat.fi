ALTER TABLE `species_dataset` ADD `meta` text;--> statement-breakpoint
CREATE INDEX `dataset_species_kind_idx` ON `species_dataset` (`species`,`kind`);