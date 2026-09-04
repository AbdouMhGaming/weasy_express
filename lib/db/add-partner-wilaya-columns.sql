-- Idempotent MySQL migration. Run once against the production Weasy database:
-- mysql -u USER -p DATABASE < lib/db/add-partner-wilaya-columns.sql
SET @db := DATABASE();
SET @add_code := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE partners ADD COLUMN wilaya_code VARCHAR(10) NULL AFTER city',
  'SELECT 1') FROM information_schema.columns WHERE table_schema=@db AND table_name='partners' AND column_name='wilaya_code');
PREPARE stmt FROM @add_code; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @add_name := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE partners ADD COLUMN wilaya_name VARCHAR(100) NULL AFTER wilaya_code',
  'SELECT 1') FROM information_schema.columns WHERE table_schema=@db AND table_name='partners' AND column_name='wilaya_name');
PREPARE stmt FROM @add_name; EXECUTE stmt; DEALLOCATE PREPARE stmt;
-- Legacy free-text city data remains untouched and becomes the display fallback.
UPDATE partners SET wilaya_name = city
WHERE (wilaya_name IS NULL OR wilaya_name = '') AND city IS NOT NULL AND city <> '';