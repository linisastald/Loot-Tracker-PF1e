# Changelog

All notable changes to this project are documented in this file.

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
