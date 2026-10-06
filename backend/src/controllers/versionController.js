// src/controllers/versionController.js
const fs = require('fs').promises;
const path = require('path');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

const UNKNOWN_VERSION = 'unknown';

// The version files are baked into the image and never change while the
// process runs, so they are read once and kept in memory.
let cachedVersion = null;

const parseDockerVersion = (content) => {
  const result = {};
  for (const line of content.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1).trim();
    if (key === 'VERSION') {
      result.version = value;
    } else if (key === 'BUILD_NUMBER') {
      result.buildNumber = parseInt(value, 10) || 0;
    }
  }
  return result;
};

const readVersionFiles = async () => {
  let version = '';
  let buildNumber = 0;

  try {
    const content = await fs.readFile(path.resolve(__dirname, '../../../.docker-version'), 'utf-8');
    const parsed = parseDockerVersion(content);
    version = parsed.version || '';
    buildNumber = parsed.buildNumber || 0;
  } catch (error) {
    logger.warn('Could not read .docker-version file, falling back to package.json', error);
  }

  if (!version) {
    try {
      const content = await fs.readFile(path.resolve(__dirname, '../../../package.json'), 'utf-8');
      version = JSON.parse(content).version || '';
    } catch (error) {
      logger.warn('Could not read package.json either, reporting an unknown version', error);
    }
  }

  return { version: version || UNKNOWN_VERSION, buildNumber };
};

/**
 * Get application version information. Only the display version is returned:
 * this endpoint is unauthenticated, so the build timestamp and NODE_ENV are
 * not disclosed.
 */
const getVersion = async (req, res) => {
  if (!cachedVersion) {
    cachedVersion = await readVersionFiles();
  }
  const { version, buildNumber } = cachedVersion;

  let fullVersion = version;
  if (version !== UNKNOWN_VERSION) {
    if (buildNumber > 0) {
      fullVersion = `${version}-dev.${buildNumber}`;
    } else if (process.env.NODE_ENV === 'development') {
      // In development mode without build number, show as dev
      fullVersion = `${version}-dev`;
    }
  }

  return controllerFactory.sendSuccessResponse(
    res,
    { version, buildNumber, fullVersion },
    'Version information retrieved'
  );
};

module.exports = {
  getVersion: controllerFactory.createHandler(getVersion, {
    errorMessage: 'Error fetching version information'
  }),
  // Test hook: forget the memoized version so the next request re-reads the files.
  resetVersionCache: () => {
    cachedVersion = null;
  }
};
