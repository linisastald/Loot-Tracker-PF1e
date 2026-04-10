-- Migration: Fix Large City base_value and purchase_limit to match CRB Table 15-2
-- Previous values (12800/75000) were incorrect; correct values are 8000/50000

UPDATE city
SET base_value = 8000, purchase_limit = 50000
WHERE size = 'Large City' AND base_value = 12800;
