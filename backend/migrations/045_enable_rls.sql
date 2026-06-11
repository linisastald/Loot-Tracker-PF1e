-- Migration: 045_enable_rls.sql
-- Description: Multi-campaign refactor Phase 2a - enable Row-Level Security
--   (RLS) tenant policies on all 39 campaign-scoped tables and switch the four
--   reporting views to security_invoker so the caller's RLS applies through
--   them.
-- Author: Database Architect Agent
-- Date: 2026-06-09
--
-- IMPORTANT - NOT ENFORCED YET: the application currently connects as the
-- table OWNER, and PostgreSQL table owners bypass non-FORCE RLS. This
-- migration therefore enables RLS without changing any runtime behavior.
-- Enforcement begins in a later release, when the app switches to the
-- non-owner role created by database/setup_app_role.sql (DB_APP_USER /
-- DB_APP_PASSWORD). Deliberately NO "FORCE ROW LEVEL SECURITY": the migration
-- runner and admin sessions keep using the owner credentials and must keep
-- unrestricted access.
--
-- Policy semantics (GUC app.current_campaign, read with missing_ok = true):
--   * unset or ''  -> the int cast yields NULL, the comparison is never true,
--                     and NO rows are visible (fail closed)
--   * an integer   -> only rows of that campaign are visible/writable
--   * 'all'        -> cross-campaign mode for background jobs and superadmin
--                     tooling (the double NULLIF turns 'all' into NULL before
--                     the ::int cast, avoiding a cast error on that branch)
-- The default policy type FOR ALL covers SELECT/INSERT/UPDATE/DELETE.
--
-- No RLS on purpose: item, mod, golarion_holidays (shared reference data with
-- the NULL-campaign_id override pattern; scoped reads come in a later phase)
-- and all strictly-global tables (users, settings, spells, impositions,
-- weather_regions, min_caster_levels, min_costs, campaigns, user_campaign,
-- campaign_settings, ...).
--
-- This migration is IDEMPOTENT: ENABLE ROW LEVEL SECURITY is a no-op when
-- already enabled, every CREATE POLICY is preceded by DROP POLICY IF EXISTS
-- (CREATE POLICY alone is not idempotent), and the view changes are guarded
-- DO blocks. It also works on fresh installs (init.sql + migrations 001..045):
-- by the time 045 runs, all 39 tables exist regardless of install path.
-- The migration runner wraps this file in a transaction automatically, so no
-- explicit BEGIN/COMMIT.

-- ============================================================================
-- 1. Tenant policies on the 39 campaign-scoped tables
-- ============================================================================

-- Characters and loot management

ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS characters_tenant ON characters;
CREATE POLICY characters_tenant ON characters
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE loot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS loot_tenant ON loot;
CREATE POLICY loot_tenant ON loot
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE appraisal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appraisal_tenant ON appraisal;
CREATE POLICY appraisal_tenant ON appraisal
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE gold ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gold_tenant ON gold;
CREATE POLICY gold_tenant ON gold
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE sold ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sold_tenant ON sold;
CREATE POLICY sold_tenant ON sold
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE consumableuse ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consumableuse_tenant ON consumableuse;
CREATE POLICY consumableuse_tenant ON consumableuse
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE identify ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS identify_tenant ON identify;
CREATE POLICY identify_tenant ON identify
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE fame ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fame_tenant ON fame;
CREATE POLICY fame_tenant ON fame
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE fame_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fame_history_tenant ON fame_history;
CREATE POLICY fame_history_tenant ON fame_history
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invites_tenant ON invites;
CREATE POLICY invites_tenant ON invites
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

-- Ships, outposts, and crew

ALTER TABLE ships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ships_tenant ON ships;
CREATE POLICY ships_tenant ON ships
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE outposts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outposts_tenant ON outposts;
CREATE POLICY outposts_tenant ON outposts
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE crew ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crew_tenant ON crew;
CREATE POLICY crew_tenant ON crew
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

-- Calendar and weather

ALTER TABLE golarion_current_date ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS golarion_current_date_tenant ON golarion_current_date;
CREATE POLICY golarion_current_date_tenant ON golarion_current_date
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE golarion_calendar_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS golarion_calendar_notes_tenant ON golarion_calendar_notes;
CREATE POLICY golarion_calendar_notes_tenant ON golarion_calendar_notes
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE golarion_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS golarion_notes_tenant ON golarion_notes;
CREATE POLICY golarion_notes_tenant ON golarion_notes
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE golarion_weather ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS golarion_weather_tenant ON golarion_weather;
CREATE POLICY golarion_weather_tenant ON golarion_weather
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

-- Infamy system (Skulls & Shackles)

ALTER TABLE ship_infamy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ship_infamy_tenant ON ship_infamy;
CREATE POLICY ship_infamy_tenant ON ship_infamy
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE infamy_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS infamy_history_tenant ON infamy_history;
CREATE POLICY infamy_history_tenant ON infamy_history
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE favored_ports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS favored_ports_tenant ON favored_ports;
CREATE POLICY favored_ports_tenant ON favored_ports
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE port_visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS port_visits_tenant ON port_visits;
CREATE POLICY port_visits_tenant ON port_visits
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE imposition_uses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS imposition_uses_tenant ON imposition_uses;
CREATE POLICY imposition_uses_tenant ON imposition_uses
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

-- Generated spellbooks (loot generator)

ALTER TABLE spellbook ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spellbook_tenant ON spellbook;
CREATE POLICY spellbook_tenant ON spellbook
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE spellbook_spell ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spellbook_spell_tenant ON spellbook_spell;
CREATE POLICY spellbook_spell_tenant ON spellbook_spell
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

-- Session management

ALTER TABLE session_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_messages_tenant ON session_messages;
CREATE POLICY session_messages_tenant ON session_messages
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS game_sessions_tenant ON game_sessions;
CREATE POLICY game_sessions_tenant ON game_sessions
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE session_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_attendance_tenant ON session_attendance;
CREATE POLICY session_attendance_tenant ON session_attendance
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE session_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_reminders_tenant ON session_reminders;
CREATE POLICY session_reminders_tenant ON session_reminders
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE session_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_notes_tenant ON session_notes;
CREATE POLICY session_notes_tenant ON session_notes
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE session_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_tasks_tenant ON session_tasks;
CREATE POLICY session_tasks_tenant ON session_tasks
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE session_task_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_task_assignments_tenant ON session_task_assignments;
CREATE POLICY session_task_assignments_tenant ON session_task_assignments
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE session_task_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_task_history_tenant ON session_task_history;
CREATE POLICY session_task_history_tenant ON session_task_history
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE session_completions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_completions_tenant ON session_completions;
CREATE POLICY session_completions_tenant ON session_completions
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE session_automations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_automations_tenant ON session_automations;
CREATE POLICY session_automations_tenant ON session_automations
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE session_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS session_config_tenant ON session_config;
CREATE POLICY session_config_tenant ON session_config
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

-- Discord integration

ALTER TABLE discord_reaction_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS discord_reaction_tracking_tenant ON discord_reaction_tracking;
CREATE POLICY discord_reaction_tracking_tenant ON discord_reaction_tracking
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE discord_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS discord_outbox_tenant ON discord_outbox;
CREATE POLICY discord_outbox_tenant ON discord_outbox
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

-- City services

ALTER TABLE item_search ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS item_search_tenant ON item_search;
CREATE POLICY item_search_tenant ON item_search
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

ALTER TABLE spellcasting_service ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spellcasting_service_tenant ON spellcasting_service;
CREATE POLICY spellcasting_service_tenant ON spellcasting_service
    USING (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    )
    WITH CHECK (
        campaign_id = NULLIF(NULLIF(current_setting('app.current_campaign', true), ''), 'all')::int
        OR current_setting('app.current_campaign', true) = 'all'
    );

-- ============================================================================
-- 2. Views: run with the caller's privileges (security_invoker)
--    Without this, a view executes with its OWNER's privileges and would
--    silently bypass the underlying tables' RLS once enforcement starts.
--    ALTER VIEW ... SET (security_invoker = true) requires PostgreSQL 15+;
--    this project runs PostgreSQL 16. Guarded with to_regclass in case a
--    database predates one of the views (all four exist on current prod;
--    on fresh installs migrations 014/029/035 create them before 045 runs).
-- ============================================================================

DO $$
DECLARE
    v text;
BEGIN
    FOREACH v IN ARRAY ARRAY[
        'loot_view',
        'gold_totals_view',
        'upcoming_sessions',
        'session_attendance_summary'
    ] LOOP
        IF to_regclass(v) IS NOT NULL THEN
            EXECUTE format('ALTER VIEW %I SET (security_invoker = true)', v);
        END IF;
    END LOOP;
END $$;
