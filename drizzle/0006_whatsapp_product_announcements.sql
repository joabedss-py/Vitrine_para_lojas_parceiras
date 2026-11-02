CREATE TABLE `whatsapp_product_announcements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`productId` int NOT NULL,
	`status` enum('pending','sending','sent','failed') NOT NULL DEFAULT 'pending',
	`attemptCount` int NOT NULL DEFAULT 0,
	`nextAttemptAt` timestamp NOT NULL DEFAULT (now()),
	`lockedUntil` timestamp,
	`lastErrorCode` varchar(64),
	`providerMessageId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`sentAt` timestamp,
	CONSTRAINT `whatsapp_product_announcements_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsapp_product_announcements_product_uq` UNIQUE(`productId`)
);
--> statement-breakpoint
CREATE INDEX `whatsapp_product_announcements_due_idx` ON `whatsapp_product_announcements` (`status`,`nextAttemptAt`);