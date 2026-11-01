CREATE TABLE `marketplace_connections` (
	`provider` varchar(40) NOT NULL,
	`accountId` varchar(80) NOT NULL,
	`accessTokenCiphertext` text NOT NULL,
	`refreshTokenCiphertext` text NOT NULL,
	`accessTokenExpiresAt` timestamp NOT NULL,
	`scope` varchar(255) NOT NULL,
	`connectedAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `marketplace_connections_provider` PRIMARY KEY(`provider`)
);
--> statement-breakpoint
CREATE TABLE `product_price_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`provider` varchar(40) NOT NULL,
	`previousPrice` decimal(65,2) NOT NULL,
	`currentPrice` decimal(65,2) NOT NULL,
	`checkedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_price_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scheduled_jobs` (
	`name` varchar(80) NOT NULL,
	`taskUid` varchar(128) NOT NULL,
	`cronExpression` varchar(120) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`lastRunAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduled_jobs_name` PRIMARY KEY(`name`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD `sourceProvider` varchar(40) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `sourceUrl` text;--> statement-breakpoint
ALTER TABLE `products` ADD `monitorEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `availabilityStatus` enum('unknown','available','out_of_stock','unavailable') DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `lastCheckedAt` timestamp;--> statement-breakpoint
ALTER TABLE `products` ADD `nextCheckAt` timestamp;--> statement-breakpoint
ALTER TABLE `products` ADD `lastSyncError` varchar(64);--> statement-breakpoint
ALTER TABLE `products` ADD `syncFailureCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `product_price_history_product_checked_idx` ON `product_price_history` (`productId`,`checkedAt`);--> statement-breakpoint
CREATE INDEX `products_monitor_due_idx` ON `products` (`monitorEnabled`,`nextCheckAt`);