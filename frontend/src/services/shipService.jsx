// src/services/shipService.jsx
import api from '../utils/api';

const shipService = {
  // Get all ship types
  getShipTypes: () => api.get('/ships/types'),

  // Get ship type data for auto-filling
  getShipTypeData: (type) => api.get(`/ships/types/${type}`),

  // Get all ships with crew count
  getAllShips: () => api.get('/ships'),

  // Create new ship
  createShip: (shipData) => api.post('/ships', shipData),

  // Update ship (only the fields sent are changed)
  updateShip: (id, shipData) => api.put(`/ships/${id}`, shipData),

  // Delete ship
  deleteShip: (id) => api.delete(`/ships/${id}`),

  // Apply damage to ship
  applyDamage: (id, damage) => api.post(`/ships/${id}/damage`, { damage }),

  // Repair ship
  repairShip: (id, repair) => api.post(`/ships/${id}/repair`, { repair })
};

export default shipService;
