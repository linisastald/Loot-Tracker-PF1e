// src/services/shipService.js
import api from '../utils/api';

const shipService = {
  // Get all ship types
  getShipTypes: async () => {
    return await api.get('/ships/types');
  },

  // Get ship type data for auto-filling
  getShipTypeData: async (type) => {
    return await api.get(`/ships/types/${type}`);
  },

  // Get all ships with crew count
  getAllShips: async () => {
    return await api.get('/ships');
  },

  // Get ship by ID with crew
  getShipById: async (id) => {
    return await api.get(`/ships/${id}`);
  },

  // Create new ship
  createShip: async (shipData) => {
    return await api.post('/ships', shipData);
  },

  // Update ship
  updateShip: async (id, shipData) => {
    return await api.put(`/ships/${id}`, shipData);
  },

  // Delete ship
  deleteShip: async (id) => {
    return await api.delete(`/ships/${id}`);
  },

  // Apply damage to ship
  applyDamage: async (id, damage) => {
    return await api.post(`/ships/${id}/damage`, { damage });
  },

  // Repair ship
  repairShip: async (id, repair) => {
    return await api.post(`/ships/${id}/repair`, { repair });
  }
};

export default shipService;
