// src/services/outpostService.js
import api from '../utils/api';

const outpostService = {
  getAllOutposts: async () => {
    return await api.get('/outposts');
  },

  getOutpostById: async (id) => {
    return await api.get(`/outposts/${id}`);
  },

  createOutpost: async (outpostData) => {
    return await api.post('/outposts', outpostData);
  },

  updateOutpost: async (id, outpostData) => {
    return await api.put(`/outposts/${id}`, outpostData);
  },

  deleteOutpost: async (id) => {
    return await api.delete(`/outposts/${id}`);
  }
};

export default outpostService;
