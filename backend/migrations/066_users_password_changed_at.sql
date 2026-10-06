-- Migration: 066_users_password_changed_at.sql
-- Description: Sessions end when the password changes (finding F-0244).
--
-- users.password_changed_at records when the account's password was last changed or reset.
-- The auth middleware and POST /auth/refresh reject a JWT whose `iat` (issued-at, whole
-- seconds) is older than this timestamp, so every other logged-in session of the user is
-- cut off when the password changes; the session that made the change gets a fresh cookie.
--
-- NULL means "never changed since this feature existed". There is deliberately NO backfill:
-- existing sessions stay valid at deploy time and only a later password change ends them.
--
-- Idempotent (IF NOT EXISTS). The column is nullable with no default, so adding it is a
-- metadata-only change. Nothing existing is altered.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN users.password_changed_at IS
    'When the password was last changed or reset (UTC). JWTs issued before this moment are rejected. NULL = never changed since this column was added.';
