# Changelog

All notable changes to this project are documented in this file.

## [0.13.3]

### Fixed
- **Discord session responses now work in every campaign.** When a newer campaign posted a session attendance message, players who clicked to respond got "This channel is not configured for session attendance tracking." Each campaign's Discord channel is now registered for interactions, and channels for campaigns created later are picked up automatically (within ~30 seconds) without a restart.
- **The Update Item dialog can calculate an item's value again.** A new **Calculate** button next to the Value field works out the price from the linked base item plus its selected mods (honoring masterwork, size, and charges). It only runs when you click it, so a hand-entered custom value is never overwritten, and it's disabled until a base item is linked.
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
