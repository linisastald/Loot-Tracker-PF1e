-- Add status column to ships table
-- Replace pc_active column with a status column that has predefined values

-- Function to safely add columns
CREATE OR REPLACE FUNCTION add_column_if_not_exists(tbl_name text, col_name text, col_definition text)
RETURNS void AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = tbl_name AND column_name = col_name
    ) THEN
        EXECUTE format('ALTER TABLE %I ADD COLUMN %I %s', tbl_name, col_name, col_definition);
        RAISE NOTICE 'Added column % to table %', col_name, tbl_name;
    ELSE
        RAISE NOTICE 'Column % already exists in table %', col_name, tbl_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Add the status column
SELECT add_column_if_not_exists('ships', 'status', 'VARCHAR(20) DEFAULT ''Active''');

-- Add constraint for valid status values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'ships_status_check' AND table_name = 'ships'
    ) THEN
        ALTER TABLE ships ADD CONSTRAINT ships_status_check 
            CHECK (status IN ('PC Active', 'Active', 'Docked', 'Lost', 'Sunk'));
        RAISE NOTICE 'Added ships_status_check constraint';
    END IF;
END $$;

-- Convert any existing pc_active column to status (if it exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ships' AND column_name = 'pc_active') THEN
        -- Set status based on pc_active value
        UPDATE ships 
        SET status = CASE 
            WHEN pc_active = true THEN 'PC Active'
            ELSE 'Active'
        END
        WHERE status IS NULL OR status = 'Active';
        
        -- Drop the old pc_active column
        ALTER TABLE ships DROP COLUMN pc_active;
        RAISE NOTICE 'Converted pc_active column to status and dropped pc_active';
    END IF;
END $$;

-- Set default status for any existing ships that don't have a status
UPDATE ships 
SET status = 'Active' 
WHERE status IS NULL;

-- Add index for status filtering
CREATE INDEX IF NOT EXISTS idx_ships_status ON ships(status);

-- Drop the helper function
DROP FUNCTION IF EXISTS add_column_if_not_exists(text, text, text);

-- Report completion
DO $$
BEGIN
    RAISE NOTICE 'Ship status column migration completed successfully';
END $$;
