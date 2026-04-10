-- Migration: Add frontend_url as a configurable setting
-- The frontend URL is used for password reset email links.
-- Previously read only from the FRONTEND_URL environment variable.
-- Now falls back to env var if the setting is not present.

INSERT INTO settings (name, value, value_type)
VALUES ('frontend_url', '', 'text')
ON CONFLICT (name) DO NOTHING;

COMMENT ON COLUMN settings.value IS 'Settings value (frontend_url: base URL for the frontend used in email links, e.g. https://example.com)';
