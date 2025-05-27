-- Migration: Add cursed column to loot table
-- Date: 2025-05-27
-- Description: Add a cursed boolean column to track cursed items

-- Add the cursed column to the loot table
ALTER TABLE loot ADD COLUMN cursed BOOLEAN DEFAULT FALSE;

-- Create an index on the cursed column for faster queries
CREATE INDEX idx_loot_cursed ON loot(cursed);

-- Update any existing items that might be cursed (optional - can be done manually later)
-- This is commented out as we don't want to automatically mark any items as cursed
-- UPDATE loot SET cursed = true WHERE name ILIKE '%cursed%';
