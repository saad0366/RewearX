-- Stage 1: PREPARED ONLY. Do not execute automatically or use sync alter/force.
-- MySQL 5.7+/8.x; select the intended database first. Adds nullable columns only.
-- Existing extracted_color, text_vector, embedding state and confirmed listing data are untouched.
-- Enable IMAGE_AI_STORAGE_ENABLED=true only after verifying both columns exist.
SET @rewearx_image_columns = (
  SELECT GROUP_CONCAT(CONCAT('ADD COLUMN `',desired.column_name,'` ',desired.column_type,' NULL')
    ORDER BY desired.ordinal_position SEPARATOR ', ')
  FROM (
    SELECT 1 ordinal_position, 'image_predictions' column_name, 'JSON' column_type
    UNION ALL SELECT 2, 'image_processed_at', 'DATETIME'
  ) desired
  WHERE NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS c WHERE c.TABLE_SCHEMA = DATABASE()
      AND c.TABLE_NAME = 'item_features' AND c.COLUMN_NAME = desired.column_name
  )
);
SET @rewearx_image_upgrade = IF(@rewearx_image_columns IS NULL,
  'SELECT ''Image prediction columns already exist'' AS migration_status',
  CONCAT('ALTER TABLE `item_features` ',@rewearx_image_columns));
PREPARE rewearx_image_statement FROM @rewearx_image_upgrade;
EXECUTE rewearx_image_statement;
DEALLOCATE PREPARE rewearx_image_statement;
SET @rewearx_image_columns = NULL;
SET @rewearx_image_upgrade = NULL;
