ALTER TABLE `whatsapp_product_announcements` MODIFY COLUMN `status` enum('pending','sending','sent','failed','prepared','published_manually','cancelled') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `whatsapp_product_announcements` ADD `announcementText` text;--> statement-breakpoint
ALTER TABLE `whatsapp_product_announcements` ADD `preparedAt` timestamp;--> statement-breakpoint
ALTER TABLE `whatsapp_product_announcements` ADD `publishedManuallyAt` timestamp;