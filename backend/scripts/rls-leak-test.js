#!/usr/bin/env node
// scripts/rls-leak-test.js
//
// RLS leak test for the multi-campaign refactor.
//
// Verifies that PostgreSQL Row-Level Security actually isolates campaign data
// when connecting as the non-owner application role. Run this AFTER:
//   1. The app role has been created via database/setup_app_role.sql
//   2. DB_APP_USER / DB_APP_PASSWORD are set in the environment (or .env),
//      along with DB_HOST / DB_NAME / DB_PORT
//
// Usage (from backend/):
//   node scripts/rls-leak-test.js
//
// The script is read-only: the single write check is wrapped in a transaction
// that is always rolled back. Exits non-zero on any FAIL.
//
// IMPORTANT: RLS is bypassed for the table owner (and superusers). If this
// script connects as the owner of the tables, every check is meaningless --
// it detects that case up front and aborts.

require('dotenv').config();

const { Client } = require('pg');

// Representative RLS-protected tables (one per "shape" of policy).
const TABLES = [
  'loot',
  'gold',
  'characters',
  'game_sessions',
  'golarion_weather',
  'discord_outbox',
];

const GUC = 'app.current_campaign';
const BOGUS_CAMPAIGN = '999999'; // no campaign with this id exists

let passCount = 0;
let failCount = 0;

function pass(msg) {
  passCount++;
  console.log(`PASS: ${msg}`);
}

function fail(msg) {
  failCount++;
  console.log(`FAIL: ${msg}`);
}

function info(msg) {
  console.log(`INFO: ${msg}`);
}

/**
 * Run SELECT COUNT(*) on a table inside its own transaction, optionally
 * setting the campaign GUC transaction-locally first (set_config(..., true)).
 *
 * @param {Client} client - connected pg client
 * @param {string} table - table name (from the fixed TABLES allowlist above)
 * @param {string|null} gucValue - campaign id to set, or null to leave unset
 * @returns {{count: number}|{error: Error}}
 */
async function countRows(client, table, gucValue) {
  try {
    await client.query('BEGIN');
    if (gucValue !== null) {
      await client.query(`SELECT set_config('${GUC}', $1, true)`, [gucValue]);
    }
    const result = await client.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    await client.query('COMMIT');
    return { count: result.rows[0].count };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (rollbackErr) { /* ignore */ }
    return { error };
  }
}

async function main() {
  const config = {
    user: process.env.DB_APP_USER,
    password: process.env.DB_APP_PASSWORD,
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '5432', 10),
  };

  if (!config.user || !config.password || !config.database) {
    console.error('ERROR: DB_APP_USER, DB_APP_PASSWORD, and DB_NAME must be set.');
    console.error('Create the app role first via database/setup_app_role.sql,');
    console.error('then export the DB_APP_* variables (or add them to backend/.env).');
    process.exit(2);
  }

  const client = new Client(config);

  try {
    await client.connect();
  } catch (error) {
    console.error(`ERROR: could not connect to ${config.host}:${config.port}/${config.database} as ${config.user}: ${error.message}`);
    process.exit(2);
  }

  try {
    // ── Check 1: connected role must NOT own the tables ────────────────
    const userResult = await client.query('SELECT current_user');
    const currentUser = userResult.rows[0].current_user;
    info(`Connected as: ${currentUser}`);

    const ownerResult = await client.query(
      "SELECT tableowner FROM pg_tables WHERE tablename = 'loot'"
    );
    if (ownerResult.rows.length === 0) {
      fail("table 'loot' not found in pg_tables -- wrong database?");
      process.exit(1);
    }
    const owner = ownerResult.rows[0].tableowner;
    info(`Owner of table 'loot': ${owner}`);

    if (currentUser === owner) {
      console.log('');
      console.log('WARNING: you are connected as the TABLE OWNER.');
      console.log('PostgreSQL bypasses RLS for the table owner, so RLS is NOT');
      console.log('enforced for this role and every result below would be a');
      console.log('false positive. Connect as the non-owner application role');
      console.log('(DB_APP_USER) created by database/setup_app_role.sql.');
      process.exit(1);
    }
    pass(`current_user (${currentUser}) is not the table owner (${owner}) -- RLS applies`);

    // ── Check 2: per-table visibility ──────────────────────────────────
    for (const table of TABLES) {
      // 2a. Bogus campaign: nothing should be visible.
      const bogus = await countRows(client, table, BOGUS_CAMPAIGN);
      if (bogus.error) {
        fail(`${table}: COUNT with ${GUC}='${BOGUS_CAMPAIGN}' errored: ${bogus.error.message}`);
      } else if (bogus.count === 0) {
        pass(`${table}: 0 rows visible for nonexistent campaign ${BOGUS_CAMPAIGN}`);
      } else {
        fail(`${table}: LEAK -- ${bogus.count} rows visible for nonexistent campaign ${BOGUS_CAMPAIGN}`);
      }

      // 2b. Campaign 1: informational only (>0 expected for populated tables).
      const real = await countRows(client, table, '1');
      if (real.error) {
        fail(`${table}: COUNT with ${GUC}='1' errored: ${real.error.message}`);
      } else {
        info(`${table}: ${real.count} rows visible for campaign 1`);
      }

      // 2c. GUC unset: must fail closed (0 rows). A policy that errors on the
      // missing/empty GUC also leaks nothing, so an error counts as closed.
      const unset = await countRows(client, table, null);
      if (unset.error) {
        pass(`${table}: GUC unset -> query rejected (${unset.error.message.trim()}) -- fail closed via error`);
      } else if (unset.count === 0) {
        pass(`${table}: GUC unset -> 0 rows visible -- fail closed`);
      } else {
        fail(`${table}: LEAK -- ${unset.count} rows visible with ${GUC} unset`);
      }
    }

    // ── Check 3: loot_view honors RLS (security_invoker) ───────────────
    const view = await countRows(client, 'loot_view', BOGUS_CAMPAIGN);
    if (view.error) {
      fail(`loot_view: COUNT with ${GUC}='${BOGUS_CAMPAIGN}' errored: ${view.error.message}`);
    } else if (view.count === 0) {
      pass(`loot_view: 0 rows visible for nonexistent campaign ${BOGUS_CAMPAIGN} (security_invoker working)`);
    } else {
      fail(`loot_view: LEAK -- ${view.count} rows visible for nonexistent campaign ${BOGUS_CAMPAIGN} (view bypasses RLS; needs security_invoker)`);
    }

    // ── Check 4: cross-campaign write is rejected by WITH CHECK ────────
    // Insert is otherwise valid against gold's NOT NULL columns
    // (session_date, transaction_type; campaign_id defaults to 1) so the
    // only thing that can reject it is the RLS WITH CHECK policy
    // (campaign_id 1 vs GUC 999999). Always rolled back.
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('${GUC}', $1, true)`, [BOGUS_CAMPAIGN]);
      await client.query(
        "INSERT INTO gold (session_date, transaction_type, campaign_id) VALUES (NOW(), 'leak-test', 1)"
      );
      // If we get here the insert was accepted -- that's a leak.
      fail(`gold: cross-campaign INSERT (campaign_id=1 under ${GUC}='${BOGUS_CAMPAIGN}') was ACCEPTED -- WITH CHECK policy missing or broken (rolled back)`);
    } catch (error) {
      pass(`gold: cross-campaign INSERT rejected (${error.message.trim()})`);
    } finally {
      try { await client.query('ROLLBACK'); } catch (rollbackErr) { /* ignore */ }
    }

    // ── Summary ─────────────────────────────────────────────────────────
    console.log('');
    console.log('='.repeat(60));
    console.log(`Summary: ${passCount} passed, ${failCount} failed`);
    console.log(failCount === 0
      ? 'RLS enforcement looks correct for the tested tables.'
      : 'RLS LEAKS DETECTED -- do not deploy with the app role until fixed.');
    console.log('='.repeat(60));

    process.exit(failCount === 0 ? 0 : 1);
  } catch (error) {
    console.error(`ERROR: unexpected failure: ${error.message}`);
    process.exit(2);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
