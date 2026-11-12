-- The previous seed value was never confirmed by the owner.
-- Keep Plus unavailable until an administrator explicitly saves an approved Stars price.
UPDATE yume_plus_settings
SET setting_value = '0'
WHERE setting_key = 'price_xtr'
  AND setting_value = '250'
  AND updated_by IS NULL;
