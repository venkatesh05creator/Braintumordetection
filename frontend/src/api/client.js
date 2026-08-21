import axios from 'axios';
import { API_BASE_URL } from './imageUrl';

const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 60000, // 60s for AI inference
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
});

// ── Request interceptor: attach JWT ──────────────────────────────────────────
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor: auto-refresh on 401 ────────────────────────────────
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const res = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {
          refresh_token: refreshToken,
        });
        const { access_token, refresh_token } = res.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        apiClient.defaults.headers.common.Authorization = `Bearer ${access_token}`;
        processQueue(null, access_token);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ── API Methods ───────────────────────────────────────────────────────────────

export const authAPI = {
  register: (data) => apiClient.post('/auth/register', data),
  login: (data) => apiClient.post('/auth/login', data),
  refresh: (refreshToken) => apiClient.post('/auth/refresh', { refresh_token: refreshToken }),
  me: () => apiClient.get('/auth/me'),
};

export const scansAPI = {
  upload: (patientId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post(`/scans/?patient_id=${patientId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000, // 2 minutes for AI ensemble
    });
  },
  getScan: (scanId) => apiClient.get(`/scans/${scanId}`),
  getPatientScans: (patientId) => apiClient.get(`/scans/patient/${patientId}`),
  // Calibration ledger — doctor verdicts on reviewed scans
  recordVerdict: (scanId, data) => apiClient.put(`/scans/${scanId}/verdict`, data),
  getCalibration: () => apiClient.get('/scans/calibration'),
  // Tumor growth map — pixel-level diff between two scans
  growthMap: (previousScanId, currentScanId) =>
    apiClient.post('/scans/growth-map', {
      previous_scan_id: previousScanId,
      current_scan_id: currentScanId,
    }),
};

export const patientsAPI = {
  list: () => apiClient.get('/patients/'),
  get: (patientId) => apiClient.get(`/patients/${patientId}`),
  update: (patientId, data) => apiClient.patch(`/patients/${patientId}`, data),
  listDoctors: () => apiClient.get('/patients/doctors'),
  sendRequest: (doctorId) => apiClient.post(`/patients/connections/request?doctor_id=${doctorId}`),
  getIncomingRequests: () => apiClient.get('/patients/connections/incoming'),
  respondToRequest: (requestId, status) => apiClient.post(`/patients/connections/requests/${requestId}/respond`, { status }),
  invitePatient: (email) => apiClient.post('/patients/connections/invite', { email }),
  getPendingInvitations: () => apiClient.get('/patients/connections/pending'),
  respondToInvitation: (requestId, status) => apiClient.post(`/patients/connections/pending/${requestId}/respond`, { status }),
};

export const symptomsAPI = {
  create: (data) => apiClient.post('/symptoms/', data),
  getHistory: (patientId, days = 14) =>
    apiClient.get(`/symptoms/patient/${patientId}?days=${days}`),
};

export const reportsAPI = {
  get: (reportId) => apiClient.get(`/reports/${reportId}`),
  getPatientReports: (patientId) => apiClient.get(`/reports/patient/${patientId}`),
  delete: (reportId) => apiClient.delete(`/reports/${reportId}`),
  downloadPdf: (reportId, version = 'auto') =>
    apiClient.get(`/reports/${reportId}/pdf`, { params: { version }, responseType: 'blob' }),
};

/**
 * Trigger a browser download for a Blob (e.g. a generated PDF).
 */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const messagesAPI = {
  send: (data) => apiClient.post('/messages/', data),
  getThread: (patientId) => apiClient.get(`/messages/thread/${patientId}`),
  edit: (messageId, content) => apiClient.patch(`/messages/${messageId}`, { content }),
  delete: (messageId) => apiClient.delete(`/messages/${messageId}`),
  uploadImage: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/messages/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const alertsAPI = {
  list: (unreadOnly = false) => apiClient.get(`/alerts/?unread_only=${unreadOnly}`),
  acknowledge: (alertId) => apiClient.post(`/alerts/${alertId}/acknowledge`),
  acknowledgeAll: () => apiClient.post('/alerts/acknowledge-all'),
  listPatient: () => apiClient.get('/alerts/patient'),
  acknowledgePatient: (alertId) => apiClient.post(`/alerts/patient/${alertId}/acknowledge`),
};

export const chatAPI = {
  sendMessage: (messages, patientId) => apiClient.post('/chat/', { messages, patient_id: patientId }),
};

export const systemAPI = {
  getAiStatus: () => apiClient.get('/system/ai-status'),
};

export default apiClient;
