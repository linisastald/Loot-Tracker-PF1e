-- Migration: Reclassify cities with 25,001+ population as Metropolis
-- Almas (76,600), Egorian (82,000), Westcrown (60,000) all exceed the
-- Metropolis threshold per GameMastery Guide settlement size table.
-- Update size and stats to Metropolis values (16000/100000/9).

UPDATE city
SET size = 'Metropolis', base_value = 16000, purchase_limit = 100000, max_spell_level = 9
WHERE name IN ('Almas', 'Egorian', 'Westcrown') AND size = 'Large City';
