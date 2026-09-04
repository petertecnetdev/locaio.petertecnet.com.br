import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.petertecnet.com.br/api';
export const APP_SLUG = import.meta.env.VITE_APP_SLUG || 'locaio';
export const CONTEXT_STORAGE_KEY = `peter_context_role:${APP_SLUG}`;

const SESSION_STORAGE_KEYS = ['token', 'access_token', 'auth_token', 'user'];

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { Accept: 'application/json', 'X-Peter-App': APP_SLUG },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Frontend-Page'] = window.location.pathname;

  const contextRole = localStorage.getItem(CONTEXT_STORAGE_KEY);
  if (['landlord', 'tenant'].includes(contextRole)) {
    config.headers['X-Peter-Context-Role'] = contextRole;

    // O AppV3 legado continua chamando /leasing/dashboard. Enquanto ele é
    // reutilizado no contexto de proprietário, roteamos apenas esse read para
    // o dashboard contextual, sem duplicar o restante da aplicação.
    if (String(config.url || '').includes('/leasing/dashboard')) {
      config.url = String(config.url).replace(
        '/leasing/dashboard',
        `/leasing/context/dashboard?role=${encodeURIComponent(contextRole)}`,
      );
    }
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && !String(error?.config?.url || '').includes('/auth/login')) {
      // Uma sessão expirada costuma invalidar várias requests em paralelo. A
      // primeira resposta 401 encerra a sessão; as seguintes não precisam
      // disparar authChanged novamente e provocar recargas de contexto em cascata.
      const hadSession = SESSION_STORAGE_KEYS.some((key) => localStorage.getItem(key) !== null)
        || localStorage.getItem(CONTEXT_STORAGE_KEY) !== null;

      SESSION_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
      localStorage.removeItem(CONTEXT_STORAGE_KEY);

      if (hadSession) window.dispatchEvent(new Event('authChanged'));
    }
    return Promise.reject(error);
  },
);

export const setContextRole = (role) => {
  if (['landlord', 'tenant'].includes(role)) localStorage.setItem(CONTEXT_STORAGE_KEY, role);
  else localStorage.removeItem(CONTEXT_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('peterContextChanged', { detail: { role } }));
};

export const getContextRole = () => localStorage.getItem(CONTEXT_STORAGE_KEY);

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
  else localStorage.removeItem('user');
  window.dispatchEvent(new Event('authChanged'));
  return token;
};

export default api;