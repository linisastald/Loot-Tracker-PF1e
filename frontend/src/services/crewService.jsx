// src/services/crewService.jsx
import api from '../utils/api';

const crewService = {
  getAllCrew: () => api.get('/crew'),

  getCrewByLocation: (locationType, locationId) =>
    api.get('/crew/by-location', {
      params: { location_type: locationType, location_id: locationId }
    }),

  createCrew: (crewData) => api.post('/crew', crewData),

  updateCrew: (id, crewData) => api.put(`/crew/${id}`, crewData),

  markCrewDead: (id, deathDate) => api.put(`/crew/${id}/mark-dead`, { death_date: deathDate }),

  markCrewDeparted: (id, departureDate, reason) =>
    api.put(`/crew/${id}/mark-departed`, {
      departure_date: departureDate,
      departure_reason: reason
    }),

  moveCrewToLocation: (id, locationType, locationId, shipPosition = null) =>
    api.put(`/crew/${id}/move`, {
      location_type: locationType,
      location_id: locationId,
      ship_position: shipPosition
    }),

  getDeceasedCrew: () => api.get('/crew/deceased'),

  deleteCrew: (id) => api.delete(`/crew/${id}`)
};

export default crewService;
