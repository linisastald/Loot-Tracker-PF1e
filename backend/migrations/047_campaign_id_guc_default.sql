-- Migration: 047_campaign_id_guc_default.sql
-- Description: Multi-campaign refactor Phase 3c - swap the temporary literal
--   DEFAULT 1 on campaign_id (added by migration 044) for a session-GUC-based
--   default on all 39 campaign-scoped tables:
--     DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int
-- Author: Database Architect Agent
-- Date: 2026-06-10
--
-- Semantics of the new default:
--   * Request context (GUC set to an integer by dbUtils): inserts inherit the
--     request's campaign automatically - application code does not need to pass
--     campaign_id explicitly.
--   * GUC unset or set to 'all': the default evaluates to NULL and the NOT NULL
--     constraint REJECTS the insert. This is INTENTIONAL fail-safe behavior:
--     cross-campaign/background code ('all' mode) and manual psql sessions must
--     either SET app.current_campaign to a campaign id or pass campaign_id
--     explicitly in the INSERT. (A GUC set to '' would raise a cast error
--     instead - also fail-safe; middleware validates the GUC to ^\d+$|^all$ so
--     '' is never an expected state.)
--
-- WARNING for future migration authors: the migration runner sets NO GUC, so
-- ANY migration that INSERTs into a campaign-scoped table MUST specify
-- campaign_id explicitly (or SET app.current_campaign first). Note this
-- applies to fresh installs even for migrations numbered BELOW 047: the 25
-- tables defined in init.sql carry the GUC default from creation, before
-- migration 001 runs. Existing past migrations were audited and are safe:
-- 014/017's session_config seeds run before 044 adds campaign_id to that
-- table, and 040's golarion_notes INSERT..SELECT reads from
-- golarion_calendar_notes, which is empty on a fresh install (zero rows, the
-- default is never evaluated). Importing legacy calendar-note data into a
-- fresh DB BEFORE first boot would break 040 — import after boot instead.
--
-- This migration is IDEMPOTENT by nature (re-running SET DEFAULT is harmless).
-- It covers the same 39 tables as migrations 044/045. database/init.sql is
-- updated in lockstep so fresh installs create the 25 tables it defines with
-- the GUC default directly; the remaining 14 tables (created by earlier
-- migrations and stamped by 044) are covered here. The migration runner wraps
-- this file in a transaction automatically, so no explicit BEGIN/COMMIT.

-- ============================================================================
-- Swap DEFAULT 1 -> session-GUC default on the 39 campaign-scoped tables
-- ============================================================================

-- Characters and loot management

ALTER TABLE characters ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE loot ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE appraisal ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE gold ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE sold ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE consumableuse ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE identify ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE fame ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE fame_history ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE invites ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;

-- Ships, outposts, and crew

ALTER TABLE ships ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE outposts ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE crew ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;

-- Calendar and weather

ALTER TABLE golarion_current_date ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE golarion_calendar_notes ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE golarion_notes ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE golarion_weather ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;

-- Infamy system (Skulls & Shackles)

ALTER TABLE ship_infamy ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE infamy_history ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE favored_ports ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE port_visits ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE imposition_uses ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;

-- Generated spellbooks (loot generator)

ALTER TABLE spellbook ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE spellbook_spell ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;

-- Session management

ALTER TABLE session_messages ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE game_sessions ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE session_attendance ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE session_reminders ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE session_notes ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE session_tasks ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE session_task_assignments ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE session_task_history ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE session_completions ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE session_automations ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE session_config ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;

-- Discord integration

ALTER TABLE discord_reaction_tracking ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE discord_outbox ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;

-- City services

ALTER TABLE item_search ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;
ALTER TABLE spellcasting_service ALTER COLUMN campaign_id SET DEFAULT NULLIF(current_setting('app.current_campaign', true), 'all')::int;

-- DOWN (manual rollback): re-run the same 39 statements with
--   SET DEFAULT 1
-- to restore the Phase 1 literal default.
