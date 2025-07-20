// src/services/shipService.js
import api from '../utils/api';

const shipService = {
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
  }
};

export default shipService;
