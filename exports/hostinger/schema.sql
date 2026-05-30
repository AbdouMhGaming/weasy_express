-- Weasy Express — MySQL Schema
-- Run this in Hostinger → Databases → phpMyAdmin
-- Select your database first, then paste this in the SQL tab.

-- ─── Tables ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `admins` (
  `id`            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `username`      VARCHAR(100) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role`          VARCHAR(20) NOT NULL DEFAULT 'admin',
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `partners` (
  `id`               INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `first_name`       VARCHAR(100) NOT NULL,
  `last_name`        VARCHAR(100) NOT NULL,
  `email`            VARCHAR(200) NOT NULL,
  `password`         VARCHAR(200),
  `phone`            VARCHAR(50) NOT NULL,
  `address`          TEXT NOT NULL,
  `city`             VARCHAR(100) NOT NULL,
  `parcels_per_month` VARCHAR(50) NOT NULL,
  `status`           VARCHAR(20) NOT NULL DEFAULT 'pending',
  `notes`            TEXT,
  `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `offices` (
  `id`            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `wilaya_number` INT NOT NULL,
  `wilaya`        VARCHAR(100) NOT NULL,
  `commune`       VARCHAR(100),
  `address`       TEXT NOT NULL,
  `phone`         VARCHAR(50),
  `maps_url`      TEXT NOT NULL,
  `is_principal`  TINYINT(1) NOT NULL DEFAULT 0,
  `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── Seed: Offices ───────────────────────────────────────────────────────────

INSERT INTO `offices` (`wilaya_number`, `wilaya`, `commune`, `address`, `phone`, `maps_url`, `is_principal`) VALUES
(2,  'Chlef',    NULL,        'Chlef',                              '0671 72 27 36', 'https://maps.app.goo.gl/azNdMzs4VKnuaUfY7', 0),
(16, 'Alger',    'Draria',    'Draria, Alger',                      '0660 77 63 49', 'https://maps.app.goo.gl/YyiYsHhUiaCd8NAe8', 0),
(48, 'Relizane', 'Oued Rhiou','Rue Benkahla Menaouer, Oued Rhiou',  '0654 97 06 62', 'https://maps.app.goo.gl/sCRi9VdRS9sa4vk8A', 1),
(48, 'Relizane', 'Mazouna',   'Mazouna',                            '0660 77 63 39', 'https://maps.app.goo.gl/usittQKLifoyCt3e6', 0);

-- ─── Seed: Admin account ─────────────────────────────────────────────────────
-- This is your existing admin account (password hash is already stored securely).

INSERT INTO `admins` (`username`, `password_hash`, `role`) VALUES
('admin', 'e98c74e845ceb00dac2677cc77d84516:16b0d37798b405373a3342e835ea26fca3cc319ea9ba9ba3ddb34a8222030e262e25fe8fdccd69695d19104b0b0739cf2c142c0a45b5d19f6862d6ea2a62e354', 'admin');

-- Log in at /admin/login with username: admin
-- (use the same password you set up in this project)
