// src/services/config.service.jsx
import api from '../utils/api';

/** Config used until the server answers, and whenever the request fails. */
export const DEFAULT_CONFIG = Object.freeze({
  groupName: 'Pathfinder Loot Tracker'
});

export const configService = {
  /**
   * Get runtime configuration from the server. Never rejects: any failure
   * resolves to DEFAULT_CONFIG.
   * @returns {Promise<Object>} Configuration object
   */
  async getConfig() {
    try {
      const response = await api.get('/config');
      if (response && response.success) {
        return response.data;
      }
    } catch {
      // fall through to the defaults
    }
    return DEFAULT_CONFIG;
  }
};

export default configService;
