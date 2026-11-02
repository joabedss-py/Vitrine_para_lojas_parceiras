CREATE TABLE `product_availability_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`provider` varchar(40) NOT NULL,
	`externalProductId` varchar(40),
	`availabilityStatus` enum('available','out_of_stock','unavailable') NOT NULL,
	`checkedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_availability_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `product_price_history` MODIFY COLUMN `previousPrice` decimal(65,2);--> statement-breakpoint
ALTER TABLE `product_price_history` ADD `externalProductId` varchar(40);--> statement-breakpoint
CREATE INDEX `product_availability_history_product_checked_idx` ON `product_availability_history` (`productId`,`checkedAt`);--> statement-breakpoint
CREATE INDEX `product_price_history_provider_external_idx` ON `product_price_history` (`provider`,`externalProductId`);