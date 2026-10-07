// index.js starts a server and a database pool when required, so these checks
// read its source. They pin the security-relevant wiring that cannot be
// exercised without running the app.
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8');
const lines = source.split(/\r?\n/);
const indexOfLine = (re) => lines.findIndex(l => re.test(l));

describe('backend/index.js wiring', () => {
  it('has no debug endpoint that echoes cookies', () => {
    expect(source).not.toMatch(/debug\/cookies/);
    expect(source).not.toMatch(/req\.headers\.cookie/);
  });

  it('mounts the JSON 404 for unknown /api paths after every router and before the SPA fallback', () => {
    const notFound = indexOfLine(/app\.use\('\/api', apiNotFoundHandler\)/);
    const lastRouter = lines.map((l, i) => (/^app\.use\('\/api\/[a-z-]+'/.test(l) ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
    const spa = indexOfLine(/app\.get\('\/\{\*splat\}'/);
    expect(notFound).toBeGreaterThan(lastRouter);
    expect(spa).toBeGreaterThan(notFound);
  });

  it('registers the error handler last, after the API 404', () => {
    expect(indexOfLine(/app\.use\(errorHandler\)/)).toBeGreaterThan(indexOfLine(/app\.use\('\/api', apiNotFoundHandler\)/));
  });

  it('keeps CSRF protection on every router except auth, config and version', () => {
    const mounts = lines.filter(l => /^app\.use\('\/api\/[a-z-]+'/.test(l));
    const unprotected = mounts.filter(l => !/csrfProtection|selectiveCSRFProtection/.test(l))
      .map(l => l.match(/'(\/api\/[a-z-]+)'/)[1]);
    expect(unprotected.sort()).toEqual(['/api/auth', '/api/config', '/api/version']);
  });

  it('applies the global limiter before the CSRF-protected routers', () => {
    expect(indexOfLine(/app\.use\('\/api', limiter\)/)).toBeGreaterThan(-1);
    expect(indexOfLine(/app\.use\('\/api', limiter\)/)).toBeLessThan(indexOfLine(/app\.use\('\/api\/user'/));
  });

  it('does not keep the unreachable second /assets static mount', () => {
    expect(source).not.toMatch(/app\.use\('\/assets'/);
  });
  it('reports a wildcard ALLOWED_ORIGINS entry as an error, never as an accepted setting', () => {
    expect(source).toContain(`logger.error("ALLOWED_ORIGINS contains '*'`);
    expect(source).not.toContain(`logger.warn("ALLOWED_ORIGINS contains`);
  });

  const lineWith = (text) => lines.findIndex(l => l.includes(text));

  it('mounts the general limiter on health, csrf-token and config BEFORE those routes are registered', () => {
    const limiterMount = lineWith("app.use(['/api/health', '/api/csrf-token', '/api/config'], limiter)");
    expect(limiterMount).toBeGreaterThan(-1);
    expect(limiterMount).toBeLessThan(lineWith("app.get('/api/health'"));
    expect(limiterMount).toBeLessThan(lineWith("app.get('/api/csrf-token'"));
    expect(limiterMount).toBeLessThan(lineWith("app.use('/api/config'"));
  });

  it('declares the limiter before it is used', () => {
    expect(lineWith('const limiter = rateLimit(')).toBeLessThan(lineWith("'/api/config'], limiter)"));
  });

  it('uses the shared body parsers (1 MB default) instead of an inline 10 MB limit', () => {
    expect(source).toContain('mountBodyParsers(app)');
    expect(source).not.toContain('10mb');
    expect(source).not.toContain('express.json(');
  });

  it('mounts the body parsers before any route', () => {
    expect(lineWith('mountBodyParsers(app)')).toBeLessThan(lineWith("app.get('/api/health'"));
  });

  it('runs the production startup checks before the database config or any other app module is required', () => {
    const check = lineWith('enforceStartupChecks(process.env)');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(lineWith("require('./src/config/db')"));
    expect(check).toBeLessThan(lineWith("require('express')"));
    expect(check).toBeLessThan(lineWith("require('./src/utils/logger')"));
  });
});
