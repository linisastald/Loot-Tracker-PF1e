/**
 * Which frontend build files may be cached by browsers for a long time (used by
 * backend/index.js).
 *
 * Vite writes its JavaScript, CSS and imported media to <build>/assets/ and puts a
 * hash of the content in each file name (index-a1B2c3D4.js). A new build therefore
 * gets new names, so those files never change under a name a browser already has.
 * Everything else (index.html, favicon, manifest, files copied from public/) keeps
 * its name across builds and must not get the long cache.
 */
const path = require('path');

// name-HASH.ext, where HASH is at least 8 characters of Vite's base64url alphabet
const HASHED_NAME = /[-.][A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;

const isHashedAsset = (buildPath, filePath) => {
  const relative = path.relative(path.join(buildPath, 'assets'), filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }
  return HASHED_NAME.test(path.basename(filePath));
};

module.exports = { isHashedAsset };
