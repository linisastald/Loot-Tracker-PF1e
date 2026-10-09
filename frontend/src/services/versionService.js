// frontend/src/services/versionService.js
import api from '../utils/api';

/**
 * Service for fetching version information
 */
const versionService = {
  /**
   * Get application version information
   * @returns {Promise<Object>} Version information; version 'unknown' when the API call fails
   */
  async getVersion() {
    try {
      return await api.get('/version');
    } catch {
      // Report an unmistakable "unknown" marker rather than a made-up version
      return {
        data: {
          version: 'unknown',
          buildNumber: 0,
          fullVersion: 'unknown'
        }
      };
    }
  }
};

export default versionService;
