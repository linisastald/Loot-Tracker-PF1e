-- Migration: 067_retire_short_invite_codes.sql
-- Description: Retire legacy short invite codes (finding F-0582).
--
-- Invite codes are generated with exactly 8 characters. Older invites could be 6 or 7
-- characters long (hand-written or created by the pre-overhaul generator). From now on the
-- registration and redeem endpoints (and the frontend) accept exactly 8 characters, so a
-- still-unused shorter code could no longer be typed anyway. This marks every unused invite
-- whose code is shorter than 8 characters as used, so none of them lingers as an
-- active-looking invite in a DM's list.
--
-- "Used" for this table is is_used = TRUE. used_by and used_at are deliberately left NULL:
-- nobody redeemed these codes and no redeemer is invented.
--
-- RLS: invites has a tenant policy keyed on the app.current_campaign GUC. The migration
-- runner connects as the table owner (RLS does not apply to it), but the statement must not
-- depend on that, so the GUC is set to the cross-campaign mode 'all' for this transaction
-- only (set_config(..., is_local => true)).
--
-- Idempotent: after one run no unused short code remains, so a second run updates 0 rows.

DO $$
DECLARE
    retired_count INTEGER;
BEGIN
    PERFORM set_config('app.current_campaign', 'all', true);

    UPDATE invites
       SET is_used = TRUE
     WHERE is_used = FALSE
       AND char_length(code) < 8;

    GET DIAGNOSTICS retired_count = ROW_COUNT;
    RAISE NOTICE 'Retired % unused invite code(s) shorter than 8 characters', retired_count;
END
$$;
