// src/controllers/versionController.js
const fs = require('fs').promises;
const path = require('path');
const controllerFactory = require('../utils/controllerFactory');
const logger = require('../utils/logger');

/**
 * Get application version information
 */
const getVersion = async (req, res) => {
  try {
    logger.info('Version endpoint called');
    // Read version from .docker-version file
    const versionFilePath = path.resolve(__dirname, '../../../.docker-version');
    let version = '0.7.1'; // Fallback version
    let buildNumber = 0;
    let lastBuild = null;

    try {
      const versionFileContent = await fs.readFile(versionFilePath, 'utf-8');
      const versionLines = versionFileContent.split('\n');
      
      for (const line of versionLines) {
        if (line.startsWith('VERSION=')) {
          version = line.split('=')[1];
        } else if (line.startsWith('BUILD_NUMBER=')) {
          buildNumber = parseInt(line.split('=')[1]) || 0;
        } else if (line.startsWith('LAST_BUILD=')) {
          const buildValue = line.split('=')[1];
          lastBuild = buildValue || null;
        }
      }
    } catch (error) {
      logger.warn('Could not read .docker-version file, using fallback version', error);
      
      // Try to read from package.json as fallback
      try {
        const packageJsonPath = path.resolve(__dirname, '../../../package.json');
        const packageContent = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageContent);
        version = packageJson.version || '0.7.1';
      } catch (packageError) {
        logger.warn('Could not read package.json either, using hardcoded fallback', packageError);
      }
    }

    // Construct full version string
    let fullVersion = version;
    if (buildNumber > 0) {
      fullVersion = `${version}-dev.${buildNumber}`;
    }

    const versionInfo = {
      version,
      buildNumber,
      fullVersion,
      lastBuild,
      environment: process.env.NODE_ENV || 'development'
    };

    return controllerFactory.sendSuccessResponse(res, versionInfo, 'Version information retrieved');
  } catch (error) {
    logger.error('Error fetching version information:', error);
    throw error;
  }
};

module.exports = {
  getVersion: controllerFactory.createHandler(getVersion, {
    errorMessage: 'Error fetching version information'
  })
};