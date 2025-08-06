-- Create a view for efficient gold totals calculation
-- This view calculates the current totals for all currencies
-- and provides a single row result for quick overview display

CREATE OR REPLACE VIEW gold_totals_view AS
SELECT 
    COALESCE(SUM(platinum), 0) as total_platinum,
    COALESCE(SUM(gold), 0) as total_gold,
    COALESCE(SUM(silver), 0) as total_silver,
    COALESCE(SUM(copper), 0) as total_copper,
    COALESCE(
        (10 * SUM(platinum)) + 
        SUM(gold) + 
        (SUM(silver) / 10.0) + 
        (SUM(copper) / 100.0), 
        0
    ) as total_value_in_gold,
    COUNT(*) as total_transactions,
    MAX(session_date) as last_transaction_date
FROM gold;

-- Add comment to document the view purpose
COMMENT ON VIEW gold_totals_view IS 'Provides current gold totals and overview statistics for efficient display in the overview page';