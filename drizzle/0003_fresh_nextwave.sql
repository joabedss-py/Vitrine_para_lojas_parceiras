ALTER TABLE `products` ADD `listPrice` decimal(65,2);--> statement-breakpoint
ALTER TABLE `products` ADD `pixPrice` decimal(65,2);--> statement-breakpoint
ALTER TABLE `products` ADD `cardInstallmentPrice` decimal(65,2);--> statement-breakpoint
ALTER TABLE `products` ADD `installments` int;--> statement-breakpoint
ALTER TABLE `products` ADD `cardInterestFree` boolean;--> statement-breakpoint
ALTER TABLE `products` ADD `storeName` varchar(120);--> statement-breakpoint
ALTER TABLE `products` ADD `shippingInfo` varchar(180);--> statement-breakpoint
ALTER TABLE `products` ADD `promotionInfo` varchar(180);