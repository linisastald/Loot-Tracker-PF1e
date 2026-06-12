-- Migration 052: drop structurally redundant indexes (audit 2026-06-11)
--
-- Index audit against the prod schema dump (docs/rotr_schema_2026-06-11.sql)
-- found 16 indexes that add NO capability another index doesn't already
-- provide. Every drop below is justified structurally - exact duplicate,
-- leftmost prefix of a surviving composite, or duplicate of a PK/unique
-- constraint - so usage statistics are irrelevant to their safety (prod's
-- pg_stat counters had just been reset by the v0.13.0 deploy anyway).
-- Biggest win: the hottest table (loot) goes from 19 indexes to 15, cutting
-- write amplification on every insert/status update.
--
-- DEFERRED to a later stats-informed pass (NOT dropped here - they provide
-- unique capability that MIGHT be used): idx_loot_grouping (6-column),
-- idx_loot_cursed, idx_loot_type, idx_crew_is_alive, idx_item_search_found,
-- idx_ships_status, idx_ships_type, idx_city_region, idx_city_size,
-- idx_weather_date_region, idx_gold_transaction_type, idx_characters_active.
-- Re-check pg_stat_user_indexes after a few weeks of normal play.
--
-- All IF EXISTS: idempotent, and tolerant of installs where an index was
-- never created (several exist only on prod, from archived migration 011).

-- ============================================================================
-- 0. Ensure the SURVIVORS exist first. Three of the composites that justify
--    prefix drops below were created only by ARCHIVED migration 011 (prod
--    has them; fresh installs never run it - migration 030's single-column
--    FK indexes were their stand-ins there). Without this, a fresh install
--    would drop its only indexes on identify.lootid / sold.lootid /
--    loot(status, whohas). No-ops on prod.
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_identify_loot_date    ON identify(lootid, golarion_date);
CREATE INDEX IF NOT EXISTS idx_sold_loot_date        ON sold(lootid, soldon);
CREATE INDEX IF NOT EXISTS idx_loot_status_character ON loot(status, whohas);

-- Exact duplicates of a unique index / constraint on the same column(s)
DROP INDEX IF EXISTS idx_settings_name;               -- = unique_name (settings.name)
DROP INDEX IF EXISTS idx_password_reset_tokens_token; -- = password_reset_tokens_token_key
DROP INDEX IF EXISTS idx_city_name;                   -- = city_name_key constraint

-- Duplicates of the table's PRIMARY KEY (or a leftmost prefix of it)
DROP INDEX IF EXISTS idx_golarion_current_date_campaign_id; -- PK IS (campaign_id)
DROP INDEX IF EXISTS idx_golarion_weather_campaign_id;      -- prefix of PK (campaign_id, year, month, day, region)

-- Backward-scan duplicate: a btree serves ORDER BY ... DESC natively
DROP INDEX IF EXISTS idx_loot_session_date_desc;      -- = idx_loot_session_date

-- Leftmost prefixes of surviving composite indexes
DROP INDEX IF EXISTS idx_loot_status;                 -- prefix of idx_loot_status_session / _character / _value / idx_loot_compound
DROP INDEX IF EXISTS idx_loot_status_whohas;          -- = idx_loot_status_character (status, whohas), minus a pointless partial predicate
DROP INDEX IF EXISTS idx_loot_status_identified;      -- prefix of idx_loot_compound (status, unidentified, session_date)
DROP INDEX IF EXISTS idx_appraisal_characterid;       -- prefix of idx_appraisal_character_time (characterid, appraised_on)
DROP INDEX IF EXISTS idx_identify_lootid;             -- prefix of idx_identify_loot_date (lootid, golarion_date)
DROP INDEX IF EXISTS idx_sold_lootid;                 -- prefix of idx_sold_loot_date (lootid, soldon)
DROP INDEX IF EXISTS idx_gold_session_date;           -- prefix of idx_gold_session_character (session_date, character_id)
DROP INDEX IF EXISTS idx_game_sessions_start_time;    -- prefix of idx_game_sessions_timing (start_time, ...)
DROP INDEX IF EXISTS idx_session_messages_session_date; -- prefix of idx_session_messages_session_created (session_date, created_at)

-- (user_id, active) WHERE active = true: 'active' is constant true inside
-- the predicate, so this is just (user_id) - covered by the surviving
-- idx_characters_active_only (user_id, name) WHERE active = true and
-- idx_characters_user_id
DROP INDEX IF EXISTS idx_characters_active_user;
