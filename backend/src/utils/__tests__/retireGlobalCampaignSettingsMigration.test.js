/**
 * Guards migration 084 (deprecated per-campaign rows removed from the global
 * settings table) against the application's own list of per-campaign setting
 * names and the Discord-seeding rule in campaign creation.
 */
const fs = require('fs');
const path = require('path');

const { PER_CAMPAIGN_SETTINGS } = require('../campaignSettings');

const root = path.join(__dirname, '../../../..');
const migration = fs.readFileSync(path.join(root, 'backend/migrations/084_retire_global_campaign_settings.sql'), 'utf8');
const campaignModel = fs.readFileSync(path.join(root, 'backend/src/models/Campaign.js'), 'utf8');

const DISCORD = ['discord_integration_enabled', 'discord_channel_id', 'campaign_role_id'];
const namesIn = (sql) => [...sql.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

describe('migration 084: retire global campaign settings', () => {
  const sections = migration.split(/-- \d[a-z]?\. /);
  const copy = sections.find((s) => s.startsWith('Freeze'));
  const del = sections.find((s) => s.startsWith('Retire'));

  it('copies every non-Discord per-campaign setting before deleting', () => {
    const copied = namesIn(copy.slice(0, copy.indexOf('ON CONFLICT')));
    const expected = PER_CAMPAIGN_SETTINGS.filter((n) => !DISCORD.includes(n));
    expect(copied.sort()).toEqual(expected.slice().sort());
  });

  it('deletes exactly the per-campaign names plus campaign_name', () => {
    const deleted = namesIn(del.slice(0, del.indexOf('GET DIAGNOSTICS')));
    expect(deleted.sort()).toEqual([...PER_CAMPAIGN_SETTINGS, 'campaign_name'].sort());
  });

  it('never copies the Discord trio to campaigns other than 1', () => {
    expect(migration).toMatch(/SELECT 1, s\.name, s\.value[\s\S]*?'discord_integration_enabled', 'discord_channel_id', 'campaign_role_id'/);
    expect(migration).toMatch(/WHERE c\.id <> 1\s*ON CONFLICT/);
  });

  it('seeds the same unset Discord rows campaign creation uses', () => {
    const seed = campaignModel.match(/\(\$1, 'discord_integration_enabled', '0', 'boolean'\)[\s\S]*?\(\$1, 'campaign_role_id', '', 'string'\)/);
    expect(seed).not.toBeNull();
    expect(migration).toMatch(/\('discord_integration_enabled', '0', 'boolean'\)/);
    expect(migration).toMatch(/\('discord_channel_id', '', 'string'\)/);
    expect(migration).toMatch(/\('campaign_role_id', '', 'string'\)/);
  });

  it('leaves the instance-wide settings alone', () => {
    ['registration_mode', 'frontend_url', 'discord_bot_token', 'openai_key', 'registrations_open', 'invite_required'].forEach((n) => {
      expect(namesIn(del.slice(0, del.indexOf('GET DIAGNOSTICS')))).not.toContain(n);
    });
  });

  it('runs in one transaction with a NOTICE and a roll-back preview', () => {
    expect(migration).toMatch(/^BEGIN;/m);
    expect(migration).toMatch(/^COMMIT;/m);
    expect(migration).toMatch(/RAISE NOTICE 'Migration 084/);
    expect(migration).toMatch(/sed 's\/\^COMMIT;\$\/ROLLBACK;\/'/);
    expect(migration).toMatch(/ON CONFLICT \(campaign_id, name\) DO NOTHING/);
  });
});
