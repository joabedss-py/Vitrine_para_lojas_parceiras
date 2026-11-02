CREATE TABLE `commercial_alerts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`type` enum('price_drop','price_increase','good_offer','availability_change') NOT NULL,
	`status` enum('unread','read','resolved') NOT NULL DEFAULT 'unread',
	`dedupeKey` varchar(255) NOT NULL,
	`title` varchar(180) NOT NULL,
	`message` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`readAt` timestamp,
	`resolvedAt` timestamp,
	CONSTRAINT `commercial_alerts_id` PRIMARY KEY(`id`),
	CONSTRAINT `commercial_alerts_dedupe_uq` UNIQUE(`dedupeKey`)
);
--> statement-breakpoint
CREATE INDEX `commercial_alerts_product_created_idx` ON `commercial_alerts` (`productId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `commercial_alerts_status_created_idx` ON `commercial_alerts` (`status`,`createdAt`);