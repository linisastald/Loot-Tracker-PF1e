// src/services/config.service.js
import api from '../utils/api';

export const configService = {
  /**
   * Get runtime configuration from the server
   * @returns {Promise<Object>} Configuration object
   */
  async getConfig() {
    try {
      const response = await api.get('/config');
      if (response && response.success) {
        return response.data;
      }
      throw new Error('Failed to get config');
    } catch (error) {
      console.error('Error fetching config:', error);
      // Return default values if the request fails
      return {
        groupName: 'Pathfinder Loot Tracker'
      };
    }
  }
};

export default configService;
