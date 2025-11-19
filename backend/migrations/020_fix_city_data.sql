-- Migration: Fix city data - replace generic cities with real Pathfinder 1e Inner Sea cities
-- This migration removes the generic placeholder cities and adds authentic PF1e locations

-- Remove generic cities that were added in migration 019
DELETE FROM city WHERE name LIKE '%(Generic)%';

-- Insert well-known Pathfinder 1e Inner Sea cities
INSERT INTO city (name, size, population, region, alignment, base_value, purchase_limit, max_spell_level) VALUES
    -- Varisia (Rise of the Runelords region)
    ('Sandpoint', 'Small Town', 1200, 'Varisia', 'NG', 1000, 5000, 2),
    ('Magnimar', 'Large City', 16000, 'Varisia', 'CN', 12800, 75000, 7),
    ('Korvosa', 'Large City', 18000, 'Varisia', 'LE', 12800, 75000, 7),
    ('Riddleport', 'Large City', 10000, 'Varisia', 'CN', 12800, 75000, 7),

    -- The Shackles (Skulls & Shackles region)
    ('Port Peril', 'Small City', 8300, 'The Shackles', 'CN', 4000, 25000, 5),
    ('Bloodcove', 'Small City', 8000, 'The Shackles', 'CN', 4000, 25000, 5),

    -- Major Inner Sea Cities (Metropolises)
    ('Absalom', 'Metropolis', 300000, 'Isle of Kortos', 'N', 16000, 100000, 9),
    ('Oppara', 'Metropolis', 109000, 'Taldor', 'N', 16000, 100000, 9),
    ('Katapesh', 'Metropolis', 85000, 'Katapesh', 'N', 16000, 100000, 9),

    -- Other Notable Inner Sea Cities
    ('Almas', 'Large City', 76600, 'Andoran', 'NG', 12800, 75000, 7),
    ('Westcrown', 'Large City', 60000, 'Cheliax', 'LE', 12800, 75000, 7),
    ('Egorian', 'Large City', 82000, 'Cheliax', 'LE', 12800, 75000, 7),
    ('Ilizmagorti', 'Large Town', 4800, 'Mediogalti Island', 'NE', 2000, 10000, 4)
ON CONFLICT (name) DO NOTHING;
