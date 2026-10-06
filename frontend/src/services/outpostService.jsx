// src/services/outpostService.jsx
import api from '../utils/api';

const outpostService = {
  getAllOutposts: () => api.get('/outposts'),

  createOutpost: (outpostData) => api.post('/outposts', outpostData),

  updateOutpost: (id, outpostData) => api.put(`/outposts/${id}`, outpostData),

  deleteOutpost: (id) => api.delete(`/outposts/${id}`)
};

export default outpostService;
