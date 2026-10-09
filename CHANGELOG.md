# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Features
- History page (DM Settings): every change to loot and gold is logged with who made it and when: loot submissions (Loot Entry and the loot generator), status changes, edits, identification, consumable use, wand charges, gold entries, distributions, balances and sales. Each entry shows its before and after, and a DM can undo it from the page
- Undo reverses the latest change to those rows: items go back to their earlier status or values, gold entries come off the ledger (refused if a total would go negative), and a sale puts the items back in Pending Sale and removes the gold. Changes come off newest first; an undo is logged and cannot itself be undone
- Restore on the Trashed page (DM): selected items go back to the status they had before they were trashed, or Unprocessed if that is not known

### Notes
- Migration 086 adds the audit_log table. History starts with this release; earlier changes are not shown

## [0.16.0] - 2026-10-08

Big one: the whole code base was reviewed and cleaned up. About 60 unused endpoints and a pile of dead files are gone, dozens of bugs are fixed, and the superadmin finally has a real admin page.

### Features
- System Admin page (superadmin): create campaigns and pick their DM, rename or deactivate a campaign, add and remove members and change their roles. Nothing is ever deleted
- Account & Settings: your account, your characters and (for the superadmin) System Admin now live in one place, reached from the account menu at the top right. It always uses the default colours, not the campaign's
- Characters page lists your characters across every campaign, and you can create one in any campaign you belong to
- Superadmin who is a Player in a campaign is now a Player there. An "Act as DM" switch in System Admin turns DM powers back on, with an "Acting as DM!" banner while it is on
- Users list in System Admin shows each account's campaigns and roles, and when they were last active
- Session tasks are fully configurable: who can draw a task, how it rotates, priority, player-count range, a description, and an "Announce as" label that names the holder in the Discord announcement ("Snack Master: Bob")
- Tasks can require attendance at the last session; the Tasks page pre-fills who was there
- "Leaving Early" button on the Discord session announcement, and matching tick boxes in the Update Attendance dialog. Late and early can be combined
- Crew hire date, and captain, notes and flag fields on ships
- "Can't reach the server" screen that recovers by itself when the backend is back
- Loot generator can use PC wealth by level instead of the NPC gear table

### Changes
- Every task is always dealt; "Free Space" fills the gaps so everyone shows the same number of tasks
- Loot entry defaults are per campaign: default quantity, and auto-split stacks into rows of 1
- Identify is rolled on the server; enter your Spellcraft bonus and it rolls. No take 10. Hard-refresh after updating
- Wand charges are set when the wand is entered (1 to 50) and only change by use; a wand at 0 is trashed
- Item types are weapon, armor, magic, gear, trade good and other; everything else is a subtype
- Item availability uses the full price including mods, and a wand counts as a new 50-charge wand. It is labelled as a house rule next to the book rule
- A successful appraisal returns the exact value; only failures are rounded
- Loot generator follows the rules more closely: NPC gear from the Core Rulebook table, spellbooks valued at writing cost, magic items stay within budget
- DM-only now: deleting crew, outposts and ships, Balance on the gold page, Search History, marking an item sold outside the sale buttons, editing a sold item
- Official holidays are read-only; custom holidays belong to their campaign
- A session short of its minimum is cancelled only once the reminder is 12 hours old
- Short invite codes are retired; codes are 8 characters
- Browsers cache the built app for a year, but new versions still show up straight away

### Fixed
- New campaigns no longer inherit another campaign's region, timezone or Discord channel
- Old loot rows now have a proper type and status, so the filters find them
- Loot pages sort by when an item was last changed, not when it was entered
- Pending Sale: "Sell All Except" could sell the items you meant to keep, and "Sell up to" and "Sell Selected" always failed
- Selling is exact and can never sell the same item twice; the coin split no longer loses a silver
- Gold entries, distribution, infamy and Harrow point spending are safe against double clicks
- The active character follows the selected campaign everywhere
- Loot list and the Kept and Trashed reports were silently cut off at 50 rows
- Editing a ship, crew member, outpost or catalog item no longer wipes fields the form did not show
- Sessions page: "Your Status" and the attendance list work, cards show their start time, late/early count as attending
- An RSVP can no longer cancel a session by accident
- Discord sends are only marked sent when they succeed, and failed ones are retried
- Unidentified items show the right Spellcraft DC and names; Character Ledger "Value of Loot" is no longer 0
- Accounts saved with a lowercase role can log in again
- The last 61 placeholder catalog items are merged or priced; scroll, wand and potion prices corrected; 105 named magic items priced; junk spell rows removed
- Two official holidays corrected: First Crusader Day on 6 Arodus, Loyalty Day on 19 Calistril
- Smaller fixes: Discord Unlink, the forgot-password message, the split dialog, duplicate character names on the Tasks page, calendar dates drifting by a day, validation messages from the server are now shown

### Security
- Discord broker calls are authenticated with a shared secret
- Players can no longer act as another player's character, see hidden details of unidentified items, or send DM-only fields
- Sessions end when a password changes; reset links work once; every auth route is rate-limited
- Bot token and API keys are superadmin-only and are never sent back to the browser
- The app's database login can no longer delete users or campaigns or touch the superadmin flag
- Removed a debug endpoint that echoed the login cookie
- Dependency security updates: all open advisories cleared across the app, the frontend and the Discord broker

### Removed
- About 60 API endpoints nothing called, six unused database tables and views, and the obsolete deployment files and scripts

### Notes
- Migrations 059 to 085 run on first start. Back up the database first
- Rebuild the Discord broker too, and set `DISCORD_BROKER_SECRET` on it and on every backend
- Production refuses to start without `JWT_SECRET` and `CSRF_SECRET` of 32+ characters, `DB_APP_USER`, `DB_APP_PASSWORD`, real `ALLOWED_ORIGINS`, and the mail variables
- Users with no campaign membership lose access; check for them before updating
- Hard-refresh (Ctrl+Shift+R) once after updating

## [0.15.2]

### Fixed
- **Discord session buttons stopped working when a second copy of the app was running.** All deployments registered with the Discord broker under the same name, so a test copy starting up replaced production's registration. Each deployment now registers under a name derived from its own web address.

### Notes
- Rebuild the Discord broker container to pick up its side of the fix.

## [0.15.1] - 2026-09-11

### Security
- **Dependency security updates.** Cleared all 33 open Dependabot alerts (16 high, 17 moderate) across the app, the frontend, and the Discord broker. Notable runtime packages: the email library (nodemailer 9.1.1), the client-side router (react-router 7.18.3), and query-string parsing (qs 6.16.0); the rest are build and test tooling. No intended change to how the app works.

## [0.15.0] - 2026-09-11

### Added
- **DMs can edit the session task lists.** A new DM Settings > Task Management page lets the DM add, edit, delete, and reorder the pre-session, during-session, and post-session tasks the Tasks page deals out, per campaign. Each task can be dealt to more than one person ("copies", like the two Loot Masters), can be held back until a minimum number of characters are present (like the extra-chairs task at 6+), and one task can be flagged as the one that names next session's Snack Master. A "Restore defaults" button puts the stock list back. Existing campaigns start with the same tasks they had before.
- **Edit and bulk-delete sessions from DM Session Management.** Each session card now has an Edit action (title, start/end time, description) and a checkbox; a select-all toggle and a Delete Selected button remove several sessions at once after confirmation, cleaning up their Discord announcements and reporting any that could not be deleted.

### Changed
- **Task assignments are listed alphabetically by character.** The Tasks page (both the Assign output and the History tab) and the Discord task announcement now list characters in alphabetical order instead of the random order they were assigned in, so the same person is easy to find in the list every time.

### Fixed
- **Appraisals save again, and believed values show.** Appraising loot from the Unprocessed list silently did nothing — the request was sent to the wrong address and no appraisal was ever recorded, so items showed no average appraisal and players saw no believed value. Appraisals are now saved correctly, and each player's own believed value appears alongside the party average. Items you tried to appraise before this fix were not recorded and need to be appraised again.
- **"Who Has It" is filled in for players who are in more than one campaign.** Items kept by a character could show a blank owner if that player also has a character in another campaign, because the item had been tied to the player's character from the *other* campaign. Affected items are automatically re-linked to the correct character in this campaign.

### Notes
- Includes database migrations (056, 057, 058) that run automatically on server start.

## [0.14.1] - 2026-06-26

### Changed
- **Date fields use a consistent calendar picker.** The Session Date fields on the Loot Entry and Gold pages now use the same date picker as the rest of the app — a calendar field you fill in section by section (month / day / year) — instead of the browser's built-in date box, so entering dates looks and behaves the same everywhere.

### Fixed
- **Discord session buttons keep working after the Discord broker restarts.** If the Discord broker service restarted (for example, during an update), the app could permanently lose its registration with it — anyone clicking a session attendance button then got "This channel is not configured for session attendance tracking" until the app itself was restarted. The app now detects the lost registration and re-registers automatically within about 30 seconds, so attendance buttons recover on their own.

### Security
- **Dependency security updates and library modernization.** Cleared all 82 outstanding dependency security advisories (1 critical, 38 high, 38 moderate, 5 low) across the app, the frontend, and the Discord broker, and brought the whole stack up to current major versions — including the web framework, UI component library, build tooling, password hashing, and the Discord signature-verification library. These are internal upgrades with no intended change to how the app works for players or DMs.

### Notes
- The Discord broker runs as a separate service; its container must be rebuilt to pick up the broker-side updates above.

## [0.14.0] - 2026-06-25

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

## [0.13.3] - 2026-06-14

### Fixed
- **Discord session responses now work in every campaign.** When a newer campaign posted a session attendance message, players who clicked to respond got "This channel is not configured for session attendance tracking." Each campaign's Discord channel is now registered for interactions, and channels for campaigns created later are picked up automatically (within ~30 seconds) without a restart.
- **The Update Item dialog calculates an item's value automatically again.** The Value field now recomputes from the linked base item plus its selected mods (honoring masterwork, size, and charges) whenever you change any of those. Items that aren't linked to a catalog item keep their hand-entered value.
- **+4 and +5 enhancements now appear under armor.** They were mislabeled as weapon enhancements, so they showed up twice in the weapon list and were missing from armor entirely — you can now apply a +4 or +5 enhancement to armor.

### Notes
- Includes database migration (054) that runs automatically on server start.

## [0.13.2] - 2026-06-12

### Added
- **Harrow Point Tracker** for Curse of the Crimson Throne campaigns (campaign-flavor module).

## [0.13.1] - 2026-06-11

### Fixed
- Repaired legacy production schema drift across 16 tables (migration 051) and the legacy invites table shape (migration 050).

### Changed
- Dropped 16 structurally redundant indexes (migration 052).

### Notes
- Includes database migrations (050, 051, 052) that run automatically on server start.

## [0.13.0] - 2026-06-11

### Added
- **Multi-campaign support.** One installation now hosts several campaigns: campaign context and row-level security, a campaign selector with per-campaign themes and settings, an overhauled invite and join-by-code system, a campaigns admin plane and a role-check hardening sweep (migration 044 onward).

### Notes
- Includes database migrations that run automatically on server start.

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
