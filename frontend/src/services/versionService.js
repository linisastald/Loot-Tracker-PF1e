// frontend/src/services/versionService.js
import api from '../utils/api';

/**
 * Service for fetching version information
 */
const versionService = {
  /**
   * Get application version information
   * @returns {Promise<Object>} Version information object
   */
  async getVersion() {
    try {
      const response = await api.get('/version');
      return response;
    } catch {
      // Return fallback version info on error
      return {
        data: {
          version: '0.7.1',
          buildNumber: 0,
          fullVersion: '0.7.1',
          environment: 'development'
        }
      };
    }
  }
};

export default versionService;