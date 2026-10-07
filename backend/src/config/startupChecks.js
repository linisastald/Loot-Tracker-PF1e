/**
 * Startup configuration checks. Pure and dependency-free (except for the small
 * helpers it shares with config/db.js and config/cors.js) so it can run at the very
 * top of index.js, before anything connects, and be unit tested without loading it.
 *
 * In production an unsafe configuration is a startup error; outside production
 * nothing changes (config/db.js still warns when RLS is not enforced).
 */
const { usesAppRole } = require('./poolConfig');
const { parseAllowedOriginsStrict, hasWildcard } = require('./cors');

const MIN_SECRET_LENGTH = 32;

const secretProblem = (env, name, why) => {
  const value = env[name];
  if (typeof value !== 'string' || value.length < MIN_SECRET_LENGTH) {
    return `${name} is missing or shorter than ${MIN_SECRET_LENGTH} characters (${why}). Generate one with: openssl rand -hex 32`;
  }
  return null;
};

/**
 * @param {Object} env - process.env (or a stand-in)
 * @returns {string[]} one human-readable line per problem; empty when the config is fine
 */
const checkStartupConfig = (env) => {
  if (env.NODE_ENV !== 'production') return [];

  const problems = [];

  const jwt = secretProblem(env, 'JWT_SECRET', 'it signs every login token');
  if (jwt) problems.push(jwt);

  const csrf = secretProblem(env, 'CSRF_SECRET', 'without a fixed value every restart invalidates CSRF tokens');
  if (csrf) problems.push(csrf);

  // Same rule config/db.js uses to pick the app role: both must be set, otherwise the
  // pool connects as the table owner and row-level security (campaign isolation) is bypassed.
  if (!usesAppRole(env)) {
    const why = 'the app would connect as the database owner and row-level security would NOT be enforced';
    if (!env.DB_APP_USER) problems.push(`DB_APP_USER is missing: ${why}`);
    if (!env.DB_APP_PASSWORD) problems.push(`DB_APP_PASSWORD is missing: ${why}`);
  }

  const origins = parseAllowedOriginsStrict(env.ALLOWED_ORIGINS);
  if (origins.length === 0) {
    problems.push('ALLOWED_ORIGINS is missing or empty: list the real origins users open the app from, comma-separated');
  } else if (hasWildcard(origins)) {
    problems.push("ALLOWED_ORIGINS contains '*', which is not accepted: list the real origins, comma-separated");
  }

  return problems;
};

/**
 * Print every problem and exit(1) when production is misconfigured.
 * @param {Object} env
 * @param {{exit?: Function, write?: Function}} [io] - injectable for tests
 * @returns {string[]} the problems found
 */
const enforceStartupChecks = (env, io = {}) => {
  const exit = io.exit || ((code) => process.exit(code));
  const write = io.write || ((text) => process.stderr.write(text));
  const problems = checkStartupConfig(env);
  if (problems.length > 0) {
    write(`FATAL: refusing to start in production with unsafe configuration (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n`);
    problems.forEach((p) => write(`  - ${p}\n`));
    write('Fix the environment variables above (see backend/.env.example) and restart.\n');
    exit(1);
  }
  return problems;
};

module.exports = { checkStartupConfig, enforceStartupChecks, MIN_SECRET_LENGTH };
