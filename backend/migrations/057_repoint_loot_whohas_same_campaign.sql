-- Migration: Repoint loot.whohas to the owning user's character IN THE LOOT'S CAMPAIGN
-- Before the RLS enforcement flip, the "who has it" character picker was not
-- campaign-scoped, so loot in one campaign could be assigned to a player's
-- character row from a DIFFERENT campaign. Now that RLS is enforced, loot_view
-- (security_invoker) hides that cross-campaign character and the "Who Has It"
-- column renders blank -- but only for players who have characters in more than
-- one campaign.
--
-- Fix: for each affected loot row, point whohas at the SAME user's character
-- that lives in the loot's own campaign. This is only applied when the user has
-- exactly one character in that campaign (match_count = 1), so the target is
-- unambiguous; any ambiguous rows are intentionally left untouched for manual
-- review rather than guessed.

UPDATE loot l
   SET whohas = m.new_char_id
  FROM (
        SELECT l2.id AS loot_id,
               (SELECT c2.id
                  FROM characters c2
                 WHERE c2.user_id = c_old.user_id
                   AND c2.campaign_id = l2.campaign_id
                 LIMIT 1) AS new_char_id,
               (SELECT count(*)
                  FROM characters c2
                 WHERE c2.user_id = c_old.user_id
                   AND c2.campaign_id = l2.campaign_id) AS match_count
          FROM loot l2
          JOIN characters c_old ON l2.whohas = c_old.id
         WHERE l2.whohas IS NOT NULL
           AND c_old.campaign_id IS DISTINCT FROM l2.campaign_id
       ) m
 WHERE l.id = m.loot_id
   AND m.new_char_id IS NOT NULL
   AND m.match_count = 1;
