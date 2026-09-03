import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.petertecnet.com.br/api';
export const APP_SLUG = import.meta.env.VITE_APP_SLUG || 'locaio';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { Accept: 'application/json', 'X-Peter-App': APP_SLUG },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Frontend-Page'] = window.location.pathname;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && !String(error?.config?.url || '').includes('/auth/login')) {
      ['token', 'access_token', 'auth_token', 'user'].forEach((key) => localStorage.removeItem(key));
      window.dispatchEvent(new Event('authChanged'));
    }
    return Promise.reject(error);
  },
);

export const appApi = {
  get: (path, config) => api.get(`/v1/apps/${APP_SLUG}${path}`, config),
  post: (path, data, config) => api.post(`/v1/apps/${APP_SLUG}${path}`, data, config),
  patch: (path, data, config) => api.patch(`/v1/apps/${APP_SLUG}${path}`, data, config),
  put: (path, data, config) => api.put(`/v1/apps/${APP_SLUG}${path}`, data, config),
  delete: (path, config) => api.delete(`/v1/apps/${APP_SLUG}${path}`, config),
};

export const errorMessage = (error, fallback = 'Não foi possível concluir esta ação.') => {
  const data = error?.response?.data;
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  return data?.message || data?.error || error?.message || fallback;
};

export const storeSession = (response) => {
  const token = response?.data?.token?.access_token || response?.data?.access_token;
  if (!token) throw new Error('A API não retornou uma sessão válida.');
  localStorage.setItem('token', token);
  const user = response?.data?.token?.user || response?.data?.user;
  if (user) localStorage.setItem('user', JSON.stringify(user));
  window.dispatchEvent(new Event('authChanged'));
  return token;
};

export default api;
