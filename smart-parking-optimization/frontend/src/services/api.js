import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export function extractErrorMessage(err) {
  if (err.response?.data?.error) return err.response.data.error
  if (err.response?.status === 500) {
    return 'Cannot reach Flask backend on http://127.0.0.1:5000 (HTTP 500). Please start the backend by running "python app.py" in backend/.'
  }
  if (err.message) return err.message
  return 'An unexpected network error occurred'
}

export const parkingApi = {
  // Health & Dashboard
  getHealth: () => apiClient.get('/api/health').then((r) => r.data),
  getDashboardStats: () => apiClient.get('/api/dashboard/stats').then((r) => r.data),

  // Vehicles
  getVehicles: (params = {}) => apiClient.get('/api/vehicles', { params }).then((r) => r.data),
  createVehicle: (payload) => apiClient.post('/api/vehicles', payload).then((r) => r.data),
  updateVehicle: (id, payload) => apiClient.put(`/api/vehicles/${id}`, payload).then((r) => r.data),
  deleteVehicle: (id) => apiClient.delete(`/api/vehicles/${id}`).then((r) => r.data),

  // Parking Slots
  getSlots: (params = {}) => apiClient.get('/api/parking-slots', { params }).then((r) => r.data),
  createSlot: (payload) => apiClient.post('/api/parking-slots', payload).then((r) => r.data),
  updateSlot: (id, payload) => apiClient.put(`/api/parking-slots/${id}`, payload).then((r) => r.data),
  deleteSlot: (id) => apiClient.delete(`/api/parking-slots/${id}`).then((r) => r.data),

  // Optimization
  generateMatrix: (payload) =>
    apiClient.post('/api/optimization/generate-matrix', payload).then((r) => r.data),
  runOptimization: (payload) =>
    apiClient.post('/api/optimization/run', payload).then((r) => r.data),
  saveOptimization: (payload) =>
    apiClient.post('/api/optimization/save', payload).then((r) => r.data),
  getLatestResults: () => apiClient.get('/api/optimization/results').then((r) => r.data),
  getOptimizationHistory: () => apiClient.get('/api/optimization/history').then((r) => r.data),

  // Analytics & Export
  getAnalytics: (params = {}) => apiClient.get('/api/analytics', { params }).then((r) => r.data),
  exportCsv: async (type = 'history') => {
    const response = await apiClient.get('/api/reports/export', {
      params: { type },
      responseType: 'blob',
    })
    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const filenameMap = {
      history: 'allocation_history_report.csv',
      vehicles: 'vehicles_report.csv',
      slots: 'parking_slots_report.csv',
    }
    link.setAttribute('download', filenameMap[type] || 'parking_report.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  },

  // Settings & Dataset
  getSettings: () => apiClient.get('/api/settings').then((r) => r.data),
  updateSettings: (payload) => apiClient.put('/api/settings', payload).then((r) => r.data),
  regenerateDataset: (seed = 42) =>
    apiClient.post('/api/dataset/regenerate', { seed }).then((r) => r.data),
}

