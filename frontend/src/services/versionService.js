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
      console.log('Fetching version from /api/version');
      const response = await api.get('/version');
      console.log('Version response:', response.data);
      return response;
    } catch (error) {
      console.error('Version API call failed:', error);
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