# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Added
- **System Admin page manages the instance.** The superadmin page now creates campaigns (choosing their DM from the user list, defaulting to the superadmin), edits a campaign's name and world, deactivates and reactivates campaigns, and manages any campaign's members: assign a DM or player from the user list, change a member's role, or remove a member. A campaign always keeps at least one DM, and the last active campaign cannot be deactivated. The instance settings on the same page gained the frontend URL, the Discord bot token and the OpenAI key (write-only, with a stored/not-stored indicator). Deactivated campaigns disappear from their members' campaign list; the superadmin still sees them. Nothing is ever deleted.
- **Every session task now carries its own options; nothing about a phase is hardcoded any more.** In DM Settings > Task Management each task can set who can draw it (skip late arrivals, skip early leavers, let the DM draw, require attendance at the last session, or always give it to one named character), how it rotates (stay with last session's holder, or never the same person two sessions running), a priority (normal, high, or first, which only sets the order tasks are dealt in), a character-count range (minimum and maximum), an active switch to park a task without deleting it, a description shown under the task on the Tasks page and in Discord, and an "Announce as" label. Any task with a label is named in the next session's Discord announcement ("Snack Master: Bob", "Recap by: Alice"), which replaces the single fixed Snack Master flag. Existing tasks keep the behaviour they had: pre-session tasks skip late arrivals, post-session tasks let the DM draw, and the snacks task announces "Snack Master".
- **Session tasks can require attendance at the last session.** With that option on, the Tasks page only deals the task to characters marked "Was at last session", and reports it as not dealt if nobody selected was there. The stock Recap task gets the flag automatically. The Tasks page pre-fills who was at the last session from the previous task assignment (or from that session's RSVPs when there is no assignment yet), and the DM can adjust it per character before dealing.
- **"Leaving Early" button on the Discord session announcement**, next to Running Late. Clicking Running Late and Leaving Early marks you as both; Attending, Not Attending or Maybe replaces the whole answer. The announcement lists you under Attending with "(early)" or "(late/early)", and the Tasks page pre-fills the Early marker from it. The Update Attendance dialog on the Sessions page matches: a "Yes" answer has "I'll be late" and "I need to leave early" tick boxes, each with its time, that can be combined, and "Your Status" on the session card shows the flags.
- **Leaving-early marker on the Tasks page.** When a task skips early leavers, each selected character gets an "Early" toggle, pre-filled from their RSVP, alongside the existing "Late" one.
- **Crew hire date and more ship fields.** A crew member's hire date is stored (migration 074), and the ship form has inputs for captain, notes and flag.
- **"Can't reach the server" screen.** When the backend stops answering, the app shows a notice and recovers by itself once it is back.
- **Loot generator: choose the NPC gear source.** The NPC gear table is the default; PC wealth by level is the alternative.
- **Item availability is labelled as a house rule** on the City Services result, with the rulebook rule beside it.

### Changed
- **Account & Settings is its own area, outside the campaign.** The user's own pages (account, characters, and the superadmin's System Admin) now live under one "Account & Settings" page, reached from the new account menu at the top right of every page and from the account block at the bottom of the sidebar. System Admin is a tab there rather than a sidebar entry, and works whatever campaign is open, including one where the superadmin is a Player. These pages always use the default colours, never the campaign's theme, and can be opened by a user who belongs to no campaign yet. The old /system-admin address redirects.
- **The System Admin users list shows campaign memberships and last activity.** The Role column, which showed the deprecated per-account role, is replaced by a Campaigns column listing each campaign the user belongs to with their role in it (inactive campaigns marked), and a Last active column. Activity is recorded from this release on (migration 085 adds users.last_active_at and grants the application role the right to write it), stamped by a successful login, registration, and the session refresh the app performs on every page load, so it reads as a dash for everyone until they next use the app.
- **The Characters tab lists your characters in every campaign.** Each row names its campaign (and flags a deactivated one); a new character can be created in any campaign you belong to, defaulting to the open one. "Active" is per campaign, so you can have one active character in each.
- **A superadmin who is a Player in a campaign is a Player there.** Before, the superadmin had DM powers in every campaign no matter what role they held in it. Now an explicit Player membership is honoured, so the superadmin can play in a campaign someone else runs. In campaigns where they have no membership, or a DM one, nothing changes. An "Act as DM" switch in Account & Settings > System Admin turns the DM powers back on for that browser when needed; while it is on, every campaign page shows an "Acting as DM!" banner with a button to turn it off. The System Admin page is unaffected either way.
- **Every task is always dealt.** A task is only held back when its own conditions are not met: it is switched off, the number of characters is outside its range, or nobody selected is eligible. The Tasks page lists any task nobody could take. When there are more tasks than people, people double up; "Free Space" fills the remaining slots so everyone shows the same number, which means someone can hold more than one Free Space.
- **Item-entry defaults now work, per campaign.** With "Default quantity" on, new rows on the loot entry page start with the configured quantity. With "Auto-split stacks" on, entering an item with quantity N saves N separate rows of 1 (up to 100).
- **Session auto-cancel rules.** A session short of its minimum is cancelled only once the reminder is at least 12 hours old, or straight away when nobody is left to remind.
- **Official holidays are read-only**; custom holidays belong to their campaign.
- **Identify is rolled on the server.** The player enters their Spellcraft bonus and the server rolls; there is no take 10. Hard-refresh the browser after updating, because an old Identify page sends a roll the server rejects.
- **Wand charges are set when the wand is entered** (1 to 50) and afterwards change only by use; any other edit is DM-only. A wand that reaches 0 charges moves to Trashed.
- **Item types are weapon, armor, magic, gear, trade good and other.** Everything else is a subtype.
- **DM-only actions:** deleting crew, outposts and ships; Balance on the gold page (Distribute stays open to players); Search History; marking an item Sold outside the sale buttons; any edit or status change of a sold item.
- **A DM who sets a wand to 0 charges in the item dialog is asked to confirm, and the wand is then trashed.**
- **Generated wands come with 1 to 50 charges**, most often between 6 and 39.
- **Generated spellbooks are stored as type magic and linked to the catalog Spellbook item**, which now has the subtype spellbook along with the Compact and Traveling Spellbook (migration 080). Spellbooks generated before this are not relinked.
- **Two session tasks in the same phase cannot share a name.**
- **Everyone selected on the Tasks page appears in every phase**; someone who cannot take any task in a phase gets Free Space.
- **The first account on an empty install is the DM and superadmin**, whatever role the form asked for.
- **The server refuses to start in production with unsafe settings**: `JWT_SECRET` and `CSRF_SECRET` must be at least 32 characters, `DB_APP_USER` and `DB_APP_PASSWORD` must be set, and `ALLOWED_ORIGINS` must list real addresses (no `*`).
- **Built frontend files are cached by browsers for a year.** Their names change with every build, and the page itself is never cached, so a new version still shows up straight away.
- **Dev builds made with `--branch` carry and tag their dev version** (`vX.Y.Z-dev.N`), like dev builds from master.
- **Item availability uses the full price**: enhancement and special-ability mods count, and a wand is priced as a new 50-charge wand.
- **A successful appraisal returns the exact value.** Only failed appraisals are rounded.
- **Loot generator values follow the rules more closely**: NPC gear uses the Core Rulebook NPC gear table, generated spellbooks are valued at their writing cost, magic weapons and armour stay inside the budget, and fractional-CR enemies are accepted.
- **Sold history stores the line total** (unit price times quantity) for new sales.
- **Old short invite codes are retired**; codes are 8 characters (migration 067).
- **Locked accounts get the same message as a wrong password.**
- **Typing the address of a DM-only page as a player redirects home**, and the DM controls follow the campaign you are in.
- **The frontend test run is capped at 6 workers** and the linter works again.

### Security
- **Discord broker calls are authenticated.** Backend and broker now share `DISCORD_BROKER_SECRET` (set the same value on both; with `NODE_ENV=production` an unset secret rejects broker traffic). `BROKER_ALLOW_UNAUTHENTICATED_CONTROL=true` on the broker allows a staged rollout.
- **The broker only passes the shared secret to backends that registered with it**, refuses a channel another running backend already owns, and lets a backend take its channels back from a registration that has gone silent.
- **The Discord account-link menu lists only characters whose account has no Discord link**, from the campaign the channel belongs to, by name only.
- **Gold entries are recorded against the signed-in user**, not a user id sent by the browser.
- **The app's database login has fewer rights** (migration 079): it cannot delete users or campaigns, and can change only the user columns the app writes, which excludes the superadmin flag.
- **Discord and global secrets are superadmin-only.** Campaign DMs can no longer change the bot token, and the settings endpoints no longer return token or key fragments.
- **Campaign access is stricter.** A user with no campaign membership no longer falls back to another campaign; a query outside any campaign context returns nothing; city changes and the global settings endpoints are superadmin-only; DM identification needs DM rights; stored mod value formulas are no longer evaluated.
- **Sessions end when a password changes** (migration 066), reset tokens are stored hashed and work once, every auth route is rate-limited, and registering as DM only works on an empty install.
- **A debug endpoint that echoed the login cookie is removed**, along with an unused endpoint that let any player mark loot as sold at any price.
- **Players can no longer act as another player's character** when appraising, identifying, or changing loot status, and can no longer mark an item identified through the general edit.
- **Players no longer receive hidden details of unidentified items** (true item, value, DM notes) from list, search and report endpoints.
- **Discord messages can only ping the campaign role**; text typed into a reason can no longer ping anyone.
- **Test-data generation is superadmin-only** and uses a random password per run.
- **Dependency updates:** axios (all three packages), nodemailer 10, and patched moment, ip-address, proxy-addr and compression (npm audit reports 0 vulnerabilities for the backend).

### Fixed
- **Campaigns no longer inherit another campaign's settings** (migration 084). The old instance-wide copies of the per-campaign settings (region, timezone, treasure track, Discord channel and so on) were still used as a fallback for any campaign without its own value, so a newly created campaign could pick up the original campaign's region or Discord channel. Every campaign now has its own rows and the old copies are removed; a missing value falls back to the built-in default.
- **Old loot rows match the current filters** (migration 083). Items entered before a type was required had none and only appeared under "Other"; they now take the type of their catalog item, or "other" when there is no link. The legacy "Kept Self" status becomes "Kept Character", so the DM Item Management status filter, which only offered one of the two, now finds every kept item. A stray "Trash" status becomes "Trashed".
- **Accounts whose role was saved in lowercase can log in again.** An old test-data seeder wrote "player"; the login check compared the exact text and refused them. The check now ignores case and the migration corrects the stored value.
- **The last 61 placeholder catalog entries are resolved** (migration 082). Forty duplicated a properly named item ("Crossbow, Heavy" beside "Heavy Crossbow") and are merged into it, with any loot that pointed at the duplicate re-linked. Ten with no twin (crossbow, repeating and hushing bolts, sling bullets, silver and wooden holy symbols, mule, tower shield, and Rythius, the Kyton Scourge) get their rulebook value.
- **Loot pages sort by when an item was last changed, not when it was entered.** The "last update" time on a loot item was never refreshed after it was created, so keeping, selling, trashing, editing or identifying an item left it where it was. It is now stamped whenever the item changes (migration 081). Existing items keep their current time until the next change.
- **An RSVP can no longer cancel a session through a database trigger**; cancellation only happens through the scheduled confirmation check.
- **The Pending Sale buttons work again.** "Sell All Except", "Sell up to" and "Sell Selected" sent field names the server did not read, so the first could sell the items meant to be kept and the other two always failed.
- **The active character follows the selected campaign** everywhere in the app, and updates when you change it.
- **A DM is no longer bounced off DM pages when the campaign fails to load**; the page shows the error with a Retry button.
- **Validation messages from the server are shown** instead of a generic failure.
- **A long sale note no longer fails the sale**, splitting a stack can no longer race another edit, and a crew location is checked even when only half of it is changed.
- **Discord sends are only recorded as sent when they succeed**, and failed ones are retried.
- **Selling is atomic and exact.** No sale path can sell the same item twice, and the coin split no longer loses a silver.
- **Gold entries, gold distribution, infamy and Harrow point spending are safe against double clicks and simultaneous requests.**
- **Using a consumable** only draws from party-kept stock and is recorded against the right character.
- **The loot list and the Kept and Trashed reports are no longer silently cut off at 50 rows.**
- **Editing no longer wipes data**: ship weapon types and squibbing, catalog item weight and caster level, and fields a form does not show are preserved; ship, crew and outpost updates only change what was sent.
- **Sessions page**: "Your Status" and the attendance list work, cards show their start time, and late/early RSVPs count as attending everywhere.
- **Unidentified items show the right Spellcraft DC and names**, and the Character Ledger's "Value of Loot" is no longer always 0.
- **Smaller fixes**: Discord "Unlink", the forgot-password success message, the split dialog, Character Management for campaign DMs, duplicate character names on the Tasks page, a campaign with no holidays can add its first, calendar dates no longer drift by a day, and concurrent "next day" clicks no longer lose an update.
- **Scroll, wand and potion catalog prices corrected** (migration 065, wand values stay per charge), plus further seed-data corrections (migration 069). Two catalog wands no class can make (Dispel Good, Dispel Law) are removed where nothing references them, and eight wands that are 4th-level bard, paladin or ranger spells are repriced to 600 gp per charge at caster level 10 (migration 073). 105 named magic armour, shield and weapon rows now carry their book price, one duplicate mod is merged and 408 junk spell rows are removed (migration 075); ten more consumables are priced with their material components (migration 077); five items that existed twice with different capitalisation are merged (migration 078).
- **Two official holidays corrected** (migration 073): First Crusader Day is on 6 Arodus, and 19 Calistril is Loyalty Day.
- **Fresh installs get the same schema as production:** extended ship columns (migration 064), `mod.casterlevel` (migration 071), `loot.cursed` (migration 072) and `password_reset_tokens` (migration 076).

### Removed
- **About 60 API endpoints that nothing called**, with their handlers, model methods and tests, including the legacy Discord session-message flow.
- Unused database objects: `session_notes`, `session_messages` and the `upcoming_sessions` view (migration 068); `fame`, `fame_history` and `golarion_calendar_notes` (migration 070).
- Obsolete deployment files (the nginx image, `Dockerfile.full`, the per-campaign compose file, the broker compose file and deploy script, `update_containers.sh`), the archived migrations folder, and the old Python utility scripts.

### Notes
- Includes database migrations 059 to 084, which run automatically on server start. None of 061 to 084 had been run against a real database when this was written.
- Before deploying: set `DISCORD_BROKER_SECRET` on the broker and every backend, configure the mail variables (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, or `EMAIL_SERVICE` with `EMAIL_USER` and `EMAIL_PASS`), check the production settings listed under Changed (the server will not start without them), and check for users with no campaign membership, who lose access.

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
