-- Migration: 085_add_users_last_active_at.sql
-- Description: Record when each account was last seen, for the System Admin users list.
--
-- Nothing recorded user activity before this (login_attempts only counts failures),
-- so the column starts NULL for every account and fills in as people sign in. It is
-- stamped by a successful login, by registration, and by the session refresh the
-- frontend posts on every page load and periodically while the app is open, so it
-- reads as "last active" rather than merely "last login".

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

COMMENT ON COLUMN users.last_active_at IS 'Last successful login, registration or session refresh (UTC). NULL = not seen since this column was added.';

-- The application role may update only an explicit list of users columns
-- (migration 079 / database/setup_app_role.sql step 3c); the new one joins it,
-- or every login would fail with "permission denied".
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loot_app') THEN
        RAISE NOTICE 'Migration 085: role loot_app does not exist; no column grant needed';
        RETURN;
    END IF;

    GRANT UPDATE (last_active_at) ON TABLE public.users TO loot_app;
END
$$;
