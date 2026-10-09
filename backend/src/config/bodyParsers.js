/**
 * Request body parsers and their size limits (used by backend/index.js).
 *
 * Every route accepts at most DEFAULT_BODY_LIMIT. The routes in LARGE_BODY_ROUTES
 * post a whole array of item objects in one request and get a larger limit; their
 * parser is mounted BEFORE the default one (body-parser skips a request whose body
 * was already parsed), so only those exact paths are affected.
 *
 * Sizing (measured from the frontend callers):
 *  - POST /api/sales/calculate sends every pending-sale loot row (about 25 fields,
 *    roughly 0.6 KB each) from PendingSaleManagement; 1 MB would be ~1,700 rows.
 *  - POST /api/loot-generator/commit sends every edited preview item of a generated
 *    hoard (SpellbookGenerator sends one) with names, ids, mods and values.
 * Everything else (id lists, single records, notes, settings) is a few KB at most.
 */
const express = require('express');

const DEFAULT_BODY_LIMIT = '1mb';

const LARGE_BODY_ROUTES = [
  { path: '/api/sales/calculate', limit: '5mb' },
  { path: '/api/loot-generator/commit', limit: '5mb' }
];

const parsersFor = (limit) => [
  express.json({ limit, strict: true }),
  express.urlencoded({ extended: true, limit })
];

/**
 * @param {import('express').Express} app
 */
const mountBodyParsers = (app) => {
  for (const { path, limit } of LARGE_BODY_ROUTES) {
    app.use(path, ...parsersFor(limit));
  }
  app.use(...parsersFor(DEFAULT_BODY_LIMIT));

  // Express 5 leaves req.body undefined when no body was parsed (Express 4
  // defaulted it to {}). Restore that invariant so handlers that read
  // req.body.<field> on a bodyless request (e.g. a POST with no payload) don't
  // throw and 500.
  app.use((req, res, next) => {
    if (req.body === undefined) req.body = {};
    next();
  });
};

module.exports = { mountBodyParsers, DEFAULT_BODY_LIMIT, LARGE_BODY_ROUTES };
