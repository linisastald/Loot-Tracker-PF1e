// src/services/crewService.js
import api from '../utils/api';

const crewService = {
  getAllCrew: async () => {
    return await api.get('/crew');
  },

  getCrewByLocation: async (locationType, locationId) => {
    return await api.get('/crew/by-location', {
      params: { location_type: locationType, location_id: locationId }
    });
  },

  getCrewById: async (id) => {
    return await api.get(`/crew/${id}`);
  },

  createCrew: async (crewData) => {
    return await api.post('/crew', crewData);
  },

  updateCrew: async (id, crewData) => {
    return await api.put(`/crew/${id}`, crewData);
  },

  markCrewDead: async (id, deathDate) => {
    return await api.put(`/crew/${id}/mark-dead`, { death_date: deathDate });
  },

  markCrewDeparted: async (id, departureDate, reason) => {
    return await api.put(`/crew/${id}/mark-departed`, { 
      departure_date: departureDate, 
      departure_reason: reason 
    });
  },

  moveCrewToLocation: async (id, locationType, locationId, shipPosition = null) => {
    return await api.put(`/crew/${id}/move`, {
      location_type: locationType,
      location_id: locationId,
      ship_position: shipPosition
    });
  },

  getDeceasedCrew: async () => {
    return await api.get('/crew/deceased');
  },

  deleteCrew: async (id) => {
    return await api.delete(`/crew/${id}`);
  }
};

export default crewService;
