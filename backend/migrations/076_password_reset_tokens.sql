-- Migration: 076_password_reset_tokens.sql
-- Description: Create password_reset_tokens on fresh installs (Opus review 2026-10-06, M-2).
--
-- The table has always existed in production (created by hand) but neither
-- database/init.sql nor any migration created it, so on a fresh install
-- forgot-password, generate-manual-reset-link and reset-password failed with
-- 'relation "password_reset_tokens" does not exist'.
--
-- Shape matches production and what authController uses:
--   token       the SHA-256 hex digest of the emailed token (64 chars; VARCHAR(255)
--               is what production has and leaves room), UNIQUE
--   expires_at  checked with  expires_at > NOW()
--   used        set TRUE when a token is consumed
-- The table is GLOBAL (account level): no campaign_id, no row-level security.
-- The controller deletes a user's old tokens by user_id before issuing a new
-- one, hence the user_id index.
--
-- Idempotent: CREATE ... IF NOT EXISTS, so it is a no-op on production. Table
-- privileges for the app role come from database/setup_app_role.sql (GRANT on
-- ALL TABLES plus ALTER DEFAULT PRIVILEGES).

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

COMMENT ON TABLE password_reset_tokens IS 'Single-use password reset tokens (SHA-256 hex digest of the emailed token). Global: not campaign-scoped.';
COMMENT ON COLUMN password_reset_tokens.token IS 'SHA-256 hex digest of the reset token; the raw token is only ever sent to the user.';
