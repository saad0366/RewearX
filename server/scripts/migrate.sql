-- ============================================================
-- ReWearX Database Migration Script
-- Run once on a fresh MySQL instance:
--   mysql -u root -p < scripts/migrate.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS rewearx
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE rewearx;

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `address` TEXT,
  `location` VARCHAR(150) DEFAULT 'Islamabad',
  `auth_provider` VARCHAR(30) DEFAULT 'local',
  `google_id` VARCHAR(255) UNIQUE,
  `id`                   INT           NOT NULL AUTO_INCREMENT,
  `name`                 VARCHAR(100)  NOT NULL,
  `email`                VARCHAR(100)  NOT NULL,
  `password`             VARCHAR(255)  NULL,
  `phone`                VARCHAR(20)   NULL,
  `profile_image`        VARCHAR(500)  NULL,
  `bio`                  TEXT          NULL,
  `gender`               ENUM('male','female','other') NULL,
  `date_of_birth`        DATE          NULL,
  `is_verified`          TINYINT(1)    NOT NULL DEFAULT 0,
  `verification_token`   VARCHAR(255)  NULL,
  `verification_expires` DATETIME      NULL,
  `otp_code`             VARCHAR(6)    NULL,
  `otp_expires`          DATETIME      NULL,
  `reset_token`          VARCHAR(255)  NULL,
  `reset_expires`        DATETIME      NULL,
  `role`                 ENUM('user','admin') NOT NULL DEFAULT 'user',
  `status`               ENUM('active','blocked') NOT NULL DEFAULT 'active',
  `last_login_at`        DATETIME      NULL,
  `created_at`           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_unique` (`email`),
  INDEX `users_status` (`status`),
  INDEX `users_role` (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- categories
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `categories` (
  `parent_id` INTEGER,
  `id`                    INT          NOT NULL AUTO_INCREMENT,
  `name`                  VARCHAR(100) NOT NULL,
  `description`           VARCHAR(500) NULL,
  `icon_url`              VARCHAR(500) NULL,
  `cloudinary_public_id`  VARCHAR(255) NULL,
  `is_active`             TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `categories_name_unique` (`name`),
  INDEX `categories_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- addresses
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `addresses` (
  `id`            INT          NOT NULL AUTO_INCREMENT,
  `user_id`       INT          NOT NULL,
  `label`         VARCHAR(50)  NULL,
  `address_line1` VARCHAR(255) NOT NULL,
  `address_line2` VARCHAR(255) NULL,
  `city`          VARCHAR(100) NOT NULL,
  `state`         VARCHAR(100) NULL,
  `postal_code`   VARCHAR(20)  NULL,
  `country`       VARCHAR(100) NOT NULL,
  `is_default`    TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `addresses_user_id` (`user_id`),
  CONSTRAINT `addresses_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- user_preferences
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_preferences` (
  `id`                   INT  NOT NULL AUTO_INCREMENT,
  `user_id`              INT  NOT NULL,
  `preferred_gender`     ENUM('male','female','unisex','any') NOT NULL DEFAULT 'any',
  `preferred_sizes`      TEXT NULL,
  `preferred_colors`     TEXT NULL,
  `preferred_styles`     TEXT NULL,
  `preferred_condition`  ENUM('new','like_new','good','fair','any') NOT NULL DEFAULT 'any',
  `preferred_categories` TEXT NULL,
  `created_at`           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_preferences_user_unique` (`user_id`),
  CONSTRAINT `user_preferences_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- user_interests
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_interests` (
  `id`          INT      NOT NULL AUTO_INCREMENT,
  `user_id`     INT      NOT NULL,
  `category_id` INT      NOT NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_interests_unique` (`user_id`, `category_id`),
  INDEX `user_interests_user_id` (`user_id`),
  INDEX `user_interests_category_id` (`category_id`),
  CONSTRAINT `user_interests_user_fk`     FOREIGN KEY (`user_id`)     REFERENCES `users`      (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `user_interests_category_fk` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- clothing_items
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `clothing_items` (
  `location` VARCHAR(150) DEFAULT 'Islamabad',
  `id`           INT          NOT NULL AUTO_INCREMENT,
  `user_id`      INT          NOT NULL,
  `category_id`  INT          NOT NULL,
  `title`        VARCHAR(150) NOT NULL,
  `description`  TEXT         NULL,
  `brand`        VARCHAR(100) NULL,
  `size`         VARCHAR(50)  NOT NULL,
  `gender`       ENUM('male','female','unisex') NOT NULL,
  `condition`    ENUM('new','like_new','good','fair') NOT NULL,
  `color`        VARCHAR(255)  NULL,
  `is_available` TINYINT(1)   NOT NULL DEFAULT 1,
  `view_count`   INT          NOT NULL DEFAULT 0,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `clothing_items_user_id`      (`user_id`),
  INDEX `clothing_items_category_id`  (`category_id`),
  INDEX `clothing_items_is_available` (`is_available`),
  INDEX `clothing_items_gender`       (`gender`),
  INDEX `clothing_items_condition`    (`condition`),
  CONSTRAINT `clothing_items_user_fk`     FOREIGN KEY (`user_id`)     REFERENCES `users`      (`id`) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT `clothing_items_category_fk` FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- clothing_images
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `clothing_images` (
  `id`          INT          NOT NULL AUTO_INCREMENT,
  `item_id`     INT          NOT NULL,
  `url`         VARCHAR(500) NOT NULL,
  `public_id`   VARCHAR(255) NULL,
  `is_primary`  TINYINT(1)   NOT NULL DEFAULT 0,
  `order_index` INT          NOT NULL DEFAULT 0,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `clothing_images_item_id`    (`item_id`),
  INDEX `clothing_images_is_primary` (`is_primary`),
  CONSTRAINT `clothing_images_item_fk` FOREIGN KEY (`item_id`) REFERENCES `clothing_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- item_features
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `item_features` (
  `id`              INT          NOT NULL AUTO_INCREMENT,
  `item_id`         INT          NOT NULL,
  `image_vector`    LONGTEXT     NULL,
  `text_vector`     LONGTEXT     NULL,
  `tags`            TEXT         NULL,
  `extracted_color` VARCHAR(50)  NULL,
  `extracted_style` VARCHAR(100) NULL,
  `embedding_status` ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  `embedding_error` TEXT NULL,
  `image_predictions` JSON NULL,
  `image_processed_at` DATETIME NULL,
  `processed_at`    DATETIME     NULL,
  `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `item_features_item_unique` (`item_id`),
  CONSTRAINT `item_features_item_fk` FOREIGN KEY (`item_id`) REFERENCES `clothing_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- saved_items
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `saved_items` (
  `id`         INT      NOT NULL AUTO_INCREMENT,
  `user_id`    INT      NOT NULL,
  `item_id`    INT      NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `saved_items_unique` (`user_id`, `item_id`),
  INDEX `saved_items_user_id` (`user_id`),
  INDEX `saved_items_item_id` (`item_id`),
  CONSTRAINT `saved_items_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users`          (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `saved_items_item_fk` FOREIGN KEY (`item_id`) REFERENCES `clothing_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- swap_requests
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `swap_requests` (
  `accepted_at` DATETIME,
  `id`                    INT      NOT NULL AUTO_INCREMENT,
  `sender_id`             INT      NOT NULL,
  `receiver_id`           INT      NOT NULL,
  `sender_item_id`        INT      NOT NULL,
  `receiver_item_id`      INT      NOT NULL,
  `message`               TEXT     NULL,
  `status`                ENUM('pending','accepted','rejected','cancelled','completed') NOT NULL DEFAULT 'pending',
  `sender_confirmed_at`   DATETIME NULL,
  `receiver_confirmed_at` DATETIME NULL,
  `created_at`            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `swap_requests_sender_id`        (`sender_id`),
  INDEX `swap_requests_receiver_id`      (`receiver_id`),
  INDEX `swap_requests_sender_item_id`   (`sender_item_id`),
  INDEX `swap_requests_receiver_item_id` (`receiver_item_id`),
  INDEX `swap_requests_status`           (`status`),
  CONSTRAINT `swap_requests_sender_fk`        FOREIGN KEY (`sender_id`)        REFERENCES `users`          (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `swap_requests_receiver_fk`      FOREIGN KEY (`receiver_id`)      REFERENCES `users`          (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `swap_requests_sender_item_fk`   FOREIGN KEY (`sender_item_id`)   REFERENCES `clothing_items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `swap_requests_receiver_item_fk` FOREIGN KEY (`receiver_item_id`) REFERENCES `clothing_items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- conversations
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `conversations` (
  `id`              INT      NOT NULL AUTO_INCREMENT,
  `swap_request_id` INT      NOT NULL,
  `last_message_at` DATETIME NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `conversations_swap_request_unique` (`swap_request_id`),
  CONSTRAINT `conversations_swap_request_fk` FOREIGN KEY (`swap_request_id`) REFERENCES `swap_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- messages
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `messages` (
  `id`              INT          NOT NULL AUTO_INCREMENT,
  `conversation_id` INT          NOT NULL,
  `sender_id`       INT          NOT NULL,
  `message`         TEXT         NOT NULL,
  `attachment_url`  VARCHAR(500) NULL,
  `is_read`         TINYINT(1)   NOT NULL DEFAULT 0,
  `read_at`         DATETIME     NULL,
  `created_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `messages_conversation_id` (`conversation_id`),
  INDEX `messages_sender_id`       (`sender_id`),
  INDEX `messages_is_read`         (`is_read`),
  CONSTRAINT `messages_conversation_fk` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT `messages_sender_fk`       FOREIGN KEY (`sender_id`)       REFERENCES `users`         (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- reviews
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reviews` (
  `id`              INT      NOT NULL AUTO_INCREMENT,
  `reviewer_id`     INT      NOT NULL,
  `reviewee_id`     INT      NOT NULL,
  `swap_request_id` INT      NOT NULL,
  `rating`          TINYINT  NOT NULL,
  `comment`         TEXT     NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `reviews_reviewer_swap_unique` (`reviewer_id`, `swap_request_id`),
  INDEX `reviews_reviewer_id`     (`reviewer_id`),
  INDEX `reviews_reviewee_id`     (`reviewee_id`),
  INDEX `reviews_swap_request_id` (`swap_request_id`),
  CONSTRAINT `reviews_reviewer_fk`     FOREIGN KEY (`reviewer_id`)     REFERENCES `users`         (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `reviews_reviewee_fk`     FOREIGN KEY (`reviewee_id`)     REFERENCES `users`         (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `reviews_swap_request_fk` FOREIGN KEY (`swap_request_id`) REFERENCES `swap_requests` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- notifications
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`         INT          NOT NULL AUTO_INCREMENT,
  `user_id`    INT          NOT NULL,
  `type`       VARCHAR(50)  NOT NULL,
  `title`      VARCHAR(150) NOT NULL,
  `message`    TEXT         NOT NULL,
  `data`       TEXT         NULL,
  `is_read`    TINYINT(1)   NOT NULL DEFAULT 0,
  `read_at`    DATETIME     NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `notifications_user_id` (`user_id`),
  INDEX `notifications_type`    (`type`),
  INDEX `notifications_is_read` (`is_read`),
  CONSTRAINT `notifications_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- recommendations
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `recommendations` (
  `id`           INT            NOT NULL AUTO_INCREMENT,
  `user_id`      INT            NOT NULL,
  `item_id`      INT            NOT NULL,
  `score`        DECIMAL(8,6)   NOT NULL DEFAULT 0,
  `reason`       VARCHAR(255)   NULL,
  `generated_at` DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at`   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `recommendations_user_item_unique` (`user_id`, `item_id`),
  INDEX `recommendations_user_id`       (`user_id`),
  INDEX `recommendations_item_id`       (`item_id`),
  INDEX `recommendations_user_score`    (`user_id`, `score`),
  CONSTRAINT `recommendations_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users`          (`id`) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT `recommendations_item_fk` FOREIGN KEY (`item_id`) REFERENCES `clothing_items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- reports
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reports` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `reporter_id`      INT          NOT NULL,
  `reported_user_id` INT          NOT NULL,
  `reported_item_id` INT          NULL,
  `reason`           VARCHAR(255) NOT NULL,
  `description`      TEXT         NULL,
  `status`           ENUM('pending','reviewed','resolved') NOT NULL DEFAULT 'pending',
  `admin_notes`      TEXT         NULL,
  `resolved_by_id`   INT          NULL,
  `resolved_at`      DATETIME     NULL,
  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `reports_reporter_id`      (`reporter_id`),
  INDEX `reports_reported_user_id` (`reported_user_id`),
  INDEX `reports_reported_item_id` (`reported_item_id`),
  INDEX `reports_status`           (`status`),
  CONSTRAINT `reports_reporter_fk`      FOREIGN KEY (`reporter_id`)      REFERENCES `users`          (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `reports_reported_user_fk` FOREIGN KEY (`reported_user_id`) REFERENCES `users`          (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `reports_reported_item_fk` FOREIGN KEY (`reported_item_id`) REFERENCES `clothing_items` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `reports_resolved_by_fk`   FOREIGN KEY (`resolved_by_id`)   REFERENCES `users`          (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- hero_banners
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `hero_banners` (
  `id`                   INT          NOT NULL AUTO_INCREMENT,
  `image_url`            VARCHAR(512) NOT NULL,
  `cloudinary_public_id` VARCHAR(255) NULL,
  `title`                VARCHAR(255) NULL,
  `subtitle`             TEXT         NULL,
  `display_order`        INT          NOT NULL DEFAULT 0,
  `is_active`            TINYINT(1)   NOT NULL DEFAULT 1,
  `created_at`           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `hero_banners_is_active`     (`is_active`),
  INDEX `hero_banners_display_order` (`display_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- swapper_of_week
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `swapper_of_week` (
  `id`              INT     NOT NULL AUTO_INCREMENT,
  `user_id`         INT     NOT NULL,
  `rank`            INT     NOT NULL,
  `total_swaps`     INT     NOT NULL,
  `week_start_date` DATE    NOT NULL,
  `week_end_date`   DATE    NOT NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `swapper_of_week_user_unique` (`user_id`),
  INDEX `swapper_of_week_rank`            (`rank`),
  INDEX `swapper_of_week_week_start_date` (`week_start_date`),
  CONSTRAINT `swapper_of_week_user_fk` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
-- Default categories seed
-- ------------------------------------------------------------
INSERT IGNORE INTO `categories` (`name`, `description`, `is_active`) VALUES
  ('T-Shirts',    'Casual and everyday t-shirts',          1),
  ('Shirts',      'Formal and casual button-up shirts',    1),
  ('Pants',       'Trousers and dress pants',              1),
  ('Jeans',       'Denim jeans of all styles',             1),
  ('Dresses',     'Casual and formal dresses',             1),
  ('Skirts',      'Mini, midi and maxi skirts',            1),
  ('Jackets',     'Jackets and outerwear',                 1),
  ('Sweaters',    'Sweaters, hoodies and knitwear',        1),
  ('Activewear',  'Sports and gym clothing',               1),
  ('Shoes',       'Footwear of all kinds',                 1),
  ('Accessories', 'Bags, belts, hats and more',            1),
  ('Traditional', 'Traditional and cultural clothing',     1),
  ('Kids',        'Clothing for children',                 1),
  ('Other',       'Anything that does not fit elsewhere',  1);

CREATE TABLE IF NOT EXISTS `disputes` (`id` INTEGER auto_increment , `swap_request_id` INTEGER NOT NULL, `initiator_id` INTEGER NOT NULL, `respondent_id` INTEGER NOT NULL, `reason` ENUM('item_not_as_described', 'damaged_item', 'fake_brand', 'missing_item', 'never_shipped', 'other') NOT NULL, `description` TEXT NOT NULL, `status` ENUM('opened', 'under_review', 'resolved_cancel_swap', 'resolved_dismissed', 'resolved_warning_issued', 'resolved_block_user') DEFAULT 'opened', `resolution_notes` TEXT, `resolved_by_id` INTEGER, `resolved_at` DATETIME, `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL, PRIMARY KEY (`id`), FOREIGN KEY (`swap_request_id`) REFERENCES `swap_requests` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE, FOREIGN KEY (`initiator_id`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE, FOREIGN KEY (`respondent_id`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE, FOREIGN KEY (`resolved_by_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `dispute_evidences` (`id` INTEGER auto_increment , `dispute_id` INTEGER NOT NULL, `uploader_id` INTEGER NOT NULL, `url` VARCHAR(500) NOT NULL, `public_id` VARCHAR(255), `caption` VARCHAR(255), `created_at` DATETIME NOT NULL, `updated_at` DATETIME NOT NULL, PRIMARY KEY (`id`), FOREIGN KEY (`dispute_id`) REFERENCES `disputes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE, FOREIGN KEY (`uploader_id`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `schema_versions` (`id` INTEGER UNSIGNED auto_increment , `category_id` INTEGER NOT NULL, `version` INTEGER UNSIGNED NOT NULL, `status` ENUM('draft', 'active', 'deprecated') NOT NULL DEFAULT 'draft', `snapshot_json` JSON NOT NULL, `created_at` DATETIME NOT NULL, PRIMARY KEY (`id`), FOREIGN KEY (`category_id`) REFERENCES `categories` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;
