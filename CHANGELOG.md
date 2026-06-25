# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [0.14.0]

### Added
- **"Level Up" button for the party (DM only).** On the DM Campaign Settings page, a new Party Level section shows the party's shared **character level** alongside the derived **Average Party Level (APL)**, and a Level Up button that raises the character level by one. The APL is calculated the standard Pathfinder way (Core Rulebook p.397) from the character level and the number of active characters: 3 or fewer characters give APL −1, four or five no change, six or more APL +1. If Discord integration is enabled, the announcement tells players which level to level up to. A confirmation dialog guards the action since it pings Discord.
- **Loot Entry action bar is now reachable from top and bottom.** The Add Item / Add Gold / Submit bar is stickied at both the top and the bottom of the page, so you no longer have to scroll back up to add another row when entering a long list of loot.
- **Per-character gold withdrawal tracking.** Gold can now be attributed to a character: distributions record which character each share went to (not just a note), and the Character Ledger has a new **Gold Withdrawn** column showing how much each character has taken (including distributions). When a player records a gold transaction it is automatically tied to their active character; a DM can choose any character (or leave it unattributed) from a new selector available on both the Gold page's Add Transaction form and the Loot Entry page's gold entry form.
- **Sortable tables on the Consumables page.** Click a column header (Quantity, Name, or Charges) in the Wands, Potions, or Scrolls table to sort by it; click again to reverse. Each table sorts independently, and wands with no charges set yet always sort to the bottom.

### Changed
- **Infamy check DC now uses the size-adjusted Average Party Level.** The Skulls & Shackles Infamy check DC (15 + 2 × APL) previously used the raw party-level number; it now uses the true APL derived from the shared character level and party size, so the DC shifts by ±2 for parties of three-or-fewer or six-or-more characters. The Infamy section of Campaign Settings now labels its input "Character Level" and shows the resulting APL and DC.
- **City Services now accounts for caster level (house rule).** Item availability is no longer based on gold value alone — an item whose caster level is higher than a settlement can support is harder to find (−10% per caster level over the settlement's effective caster level, never fully impossible). This is why a cheap-but-high-caster-level item like a cracked ioun stone is now a rare find in a small town. Each settlement size has an "effective caster level" shown in the settlement summary and the quick-reference table.
- **Spellcasting services respect realistic caster levels.** A settlement no longer offers a CL 20 casting just because the spell's level is available. The minimum caster level for a spell is always available; requesting a higher caster level now rolls a find chance that drops the further it is above what the settlement can supply. Caster level below a spell's minimum is rejected.

### Fixed
- **Session reminders no longer ping players from other campaigns.** A campaign's reminder could mention someone who only belongs to a different campaign. The cause: anyone whose Discord account was linked could react to a session announcement and be recorded as attending — even a session in a campaign they're not part of — which then pulled them into that campaign's reminders. Responding to a session via Discord now requires having an active character in that session's campaign; players who haven't joined the campaign are told to join first instead of being silently signed up. Reminder recipients are also now limited to that campaign's members.
- **The Snack Master shown on session announcements is correct again.** The next session's Discord announcement could name the wrong person (lagging one session behind), because the lookup trusted the task assignment's linked session rather than when it was made — and the DM usually runs the Tasks page after a session has started, which links that assignment to the *following* session. It now uses the most recent task assignment created before the session begins.

### Notes
- Includes database migration (055) that runs automatically on server start.

## [0.13.3]

### Fixed
- **Discord session responses now work in every campaign.** When a newer campaign posted a session attendance message, players who clicked to respond got "This channel is not configured for session attendance tracking." Each campaign's Discord channel is now registered for interactions, and channels for campaigns created later are picked up automatically (within ~30 seconds) without a restart.
- **The Update Item dialog calculates an item's value automatically again.** The Value field now recomputes from the linked base item plus its selected mods (honoring masterwork, size, and charges) whenever you change any of those. Items that aren't linked to a catalog item keep their hand-entered value.
- **+4 and +5 enhancements now appear under armor.** They were mislabeled as weapon enhancements, so they showed up twice in the weapon list and were missing from armor entirely — you can now apply a +4 or +5 enhancement to armor.

### Notes
- Includes database migration (054) that runs automatically on server start.

## [0.12.2]

### Added
- **Session task history.** The Tasks page now has **Assign** and **History** tabs. Every assignment is saved automatically (it survives a page refresh), and the History tab shows past assignments with date, session, who got what, and player/late counts.

### Changed
- **Snack Master is now driven by the task system.** Whoever is assigned the post-session "Ensure no duplicate snacks for next session" task becomes the snack master for the next session, and that name is shown in the next session's Discord announcement (replacing the old automatic rotation).

### Fixed
- **Two Loot Masters are now always assigned to different people.** The during-session list includes two Loot Masters again, and the assignment logic guarantees they never land on the same person — fixing last session's double-assignment. The same fix prevents anyone from receiving any duplicate task.

### Removed
- Automatic hourly task generation and its Campaign Settings toggle — tasks are now assigned manually from the Tasks page.
- Unused legacy snack-master database columns and supporting code.

### Notes
- Includes database migrations (037, 038) that run automatically on server start.
