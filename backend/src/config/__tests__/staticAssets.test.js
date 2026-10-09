const path = require('path');
const fs = require('fs');
const { isHashedAsset } = require('../staticAssets');

const build = path.join(path.sep, 'app', 'backend', 'frontend', 'build');
const inBuild = (...parts) => path.join(build, ...parts);

describe('isHashedAsset', () => {
  it.each([
    ['assets', 'index-a1B2c3D4.js'],
    ['assets', 'index-Dq_x-9Zk.css'],
    ['assets', 'CityServices-BkT4h0aP.js'],
    ['assets', 'logo-C3pQ9xYz.svg'],
  ])('accepts content-hashed files under assets (%s/%s)', (...parts) => {
    expect(isHashedAsset(build, inBuild(...parts))).toBe(true);
  });

  it.each([
    ['index.html'],
    ['favicon.ico'],
    ['manifest.json'],
    ['assets', 'logo.svg'],
    ['assets', 'index.js'],
    ['other', 'index-a1B2c3D4.js'],
    ['assets'],
  ])('rejects files that keep their name across builds (%s %s)', (...parts) => {
    expect(isHashedAsset(build, inBuild(...parts))).toBe(false);
  });

  it('rejects a path outside the build folder', () => {
    expect(isHashedAsset(build, path.join(path.sep, 'app', 'assets', 'index-a1B2c3D4.js'))).toBe(false);
    expect(isHashedAsset(build, inBuild('assets', '..', '..', 'assets', 'index-a1B2c3D4.js'))).toBe(false);
  });
});

describe('backend/index.js static file caching', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../../index.js'), 'utf8');

  it('keeps index.html uncached and gives only hashed assets the long cache', () => {
    expect(source).toMatch(/filePath\.endsWith\('index\.html'\)\) \{\s+res\.setHeader\('Cache-Control', 'no-cache'\);/);
    expect(source).toMatch(/else if \(isHashedAsset\(frontendBuildPath, filePath\)\) \{[\s\S]*?'public, max-age=31536000, immutable'/);
    expect(source.match(/immutable'/g)).toHaveLength(1);
  });
});
