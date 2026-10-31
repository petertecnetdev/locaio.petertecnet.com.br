import axios from 'axios';
import { isCurrentAuthSession, shouldInvalidateSessionForUnauthorized } from './session401Guard.js';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://api.petertecnet.com.br/api';
export const APP_SLUG = import.meta.env.VITE_APP_SLUG || 'locaio';
export const CONTEXT_STORAGE_KEY = `peter_context_role:${APP_SLUG}`;

const SESSION_STORAGE_KEYS = ['token', 'access_token', 'auth_token', 'user'];
const DEFAULT_READ_CACHE_TTL_MS = 2500;
const readCache = new Map();
const inFlightReads = new Map();
let cacheGeneration = 0;
let sessionEpoch = 0;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { Accept: 'application/json', 'X-Peter-App': APP_SLUG },
});

function stableSerialize(value) {
  if (value === null || value === undefined) return String(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${key}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  return String(value);
}

export function getCurrentAuthSession() {
  return {
    token: localStorage.getItem('token'),
    role: localStorage.getItem(CONTEXT_STORAGE_KEY) || null,
    epoch: sessionEpoch,
  };
}

export function isAuthSessionCurrent(snapshot) {
  return isCurrentAuthSession(snapshot, getCurrentAuthSession());
}

export function clearAppReadCache() {
  cacheGeneration += 1;
  readCache.clear();
}

export function appMutationPolicy(role, method, path) {
  const normalizedRole = ['landlord', 'tenant'].includes(role) ? role : null;
  const normalizedMethod = String(method || '').toLowerCase();
  const normalizedPath = String(path || '').split('?')[0];

  if (normalizedRole === 'landlord'
    && normalizedMethod === 'post'
    && /^\/leases\/\d+\/charges\/\d+\/payment$/.test(normalizedPath)) {
    return {
      allowed: false,
      code: 'LOCAIO_PAYER_ACTION_REQUIRED',
      message: 'O checkout desta cobrança deve ser iniciado pelo inquilino.',
    };
  }

  if (normalizedRole === 'tenant'
    && ((normalizedMethod === 'post' && /^\/leases\/\d+\/charges\/schedule$/.test(normalizedPath))
      || (normalizedMethod === 'patch' && /^\/leases\/\d+\/charges\/\d+\/paid$/.test(normalizedPath)))) {
    return {
      allowed: false,
      code: 'LOCAIO_LANDLORD_ACTION_REQUIRED',
      message: 'Esta ação financeira pertence ao proprietário da locação.',
    };
  }

  return { allowed: true, code: null, message: null };
}

function readKey(path, config) {
  const role = localStorage.getItem(CONTEXT_STORAGE_KEY) || 'none';
  return `${cacheGeneration}|${role}|${path}|${stableSerialize(config?.params || null)}`;
}

function cachedAppGet(path, config = {}) {
  const {
    cache = true,
    cacheTtl = DEFAULT_READ_CACHE_TTL_MS,
    ...axiosConfig
  } = config || {};
  const url = `/v1/apps/${APP_SLUG}${path}`;

  if (!cache || axiosConfig.responseType === 'blob' || Number(cacheTtl) <= 0) {
    return api.get(url, axiosConfig);
  }

  const key = readKey(path, axiosConfig);
  const now = Date.now();
  const cached = readCache.get(key);
  if (cached && cached.expiresAt > now) return Promise.resolve(cached.response);
  if (cached) readCache.delete(key);

  const pending = inFlightReads.get(key);
  if (pending) return pending;

  const generation = cacheGeneration;
  const request = api.get(url, axiosConfig)
    .then((response) => {
      if (generation === cacheGeneration) {
        readCache.set(key, {
          expiresAt: Date.now() + Math.max(0, Number(cacheTtl) || DEFAULT_READ_CACHE_TTL_MS),
          response,
        });
      }
      return response;
    })
    .finally(() => inFlightReads.delete(key));

  inFlightReads.set(key, request);
  return request;
}

function mutateApp(method, path, data, config) {
  const role = localStorage.getItem(CONTEXT_STORAGE_KEY);
  const policy = appMutationPolicy(role, method, path);
  if (!policy.allowed) {
    const error = new Error(policy.message);
    error.code = policy.code;
    error.isContextPolicyError = true;
    return Promise.reject(error);
  }

  const url = `/v1/apps/${APP_SLUG}${path}`;
  const request = method === 'delete'
    ? api.delete(url, config)
    : api[method](url, data, config);

  return request.then((response) => {
    clearAppReadCache();
    return response;
  });
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (!config.__locaioExplicitAuthorization) {
    if (token) config.headers.Authorization = `Bearer ${token}`;
    else delete config.headers.Authorization;
  }
  config.headers['X-Frontend-Page'] = window.location.pathname;

  const contextRole = localStorage.getItem(CONTEXT_STORAGE_KEY);
  config.__locaioAuthSnapshot = { token, role: contextRole || null, epoch: sessionEpoch };
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
    if (shouldInvalidateSessionForUnauthorized(error, {
      token: localStorage.getItem('token'),
      role: localStorage.getItem(CONTEXT_STORAGE_KEY),
      epoch: sessionEpoch,
    })) {
      // Somente a requisição iniciada pela sessão e contexto atuais pode
      // invalidar credenciais. Respostas atrasadas A→B→A são ignoradas.
      const hadSession = SESSION_STORAGE_KEYS.some((key) => localStorage.getItem(key) !== null)
        || localStorage.getItem(CONTEXT_STORAGE_KEY) !== null;

      if (hadSession) endSession();
    }
    return Promise.reject(error);
  },
);

/**
 * Invalida a sessão local imediatamente, sem esperar resposta da rede.
 * A revogação remota usa o token capturado e nunca o de um login posterior.
 */
export function endSession() {
  sessionEpoch += 1;
  SESSION_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(CONTEXT_STORAGE_KEY);
  clearAppReadCache();
  window.dispatchEvent(new Event('authChanged'));
  window.dispatchEvent(new CustomEvent('peterContextChanged', { detail: { role: null } }));
}

export function logoutSession() {
  const token = localStorage.getItem('token');
  endSession();
  if (!token) return Promise.resolve();

  return api.post('/auth/logout', {}, {
    headers: { Authorization: `Bearer ${token}` },
    __locaioExplicitAuthorization: true,
    __locaioSkipAuthInvalidation: true,
  }).catch(() => undefined);
}

export const setContextRole = (role) => {
  const nextRole = ['landlord', 'tenant'].includes(role) ? role : null;
  const currentRole = localStorage.getItem(CONTEXT_STORAGE_KEY);
  if (currentRole === nextRole) return;

  sessionEpoch += 1;
  if (nextRole) localStorage.setItem(CONTEXT_STORAGE_KEY, nextRole);
  else localStorage.removeItem(CONTEXT_STORAGE_KEY);
  clearAppReadCache();
  window.dispatchEvent(new CustomEvent('peterContextChanged', { detail: { role: nextRole } }));
};

export const getContextRole = () => localStorage.getItem(CONTEXT_STORAGE_KEY);

export const appApi = {
  get: cachedAppGet,
  post: (path, data, config) => mutateApp('post', path, data, config),
  patch: (path, data, config) => mutateApp('patch', path, data, config),
  put: (path, data, config) => mutateApp('put', path, data, config),
  delete: (path, config) => mutateApp('delete', path, undefined, config),
};

export const errorMessage = (error, fallback = 'Não foi possível concluir esta ação.') => {
  const data = error?.response?.data;
  if (data?.errors) return Object.values(data.errors).flat().join(' ');
  return data?.message || data?.error || error?.message || fallback;
};

export const storeSession = (response) => {
  const token = response?.data?.token?.access_token || response?.data?.access_token;
  if (!token) throw new Error('A API não retornou uma sessão válida.');
  sessionEpoch += 1;
  const previousRole = localStorage.getItem(CONTEXT_STORAGE_KEY);
  localStorage.removeItem(CONTEXT_STORAGE_KEY);
  localStorage.setItem('token', token);
  const user = response?.data?.token?.user || response?.data?.user;
  if (user) localStorage.setItem('user', JSON.stringify(user));
  else localStorage.removeItem('user');
  clearAppReadCache();
  window.dispatchEvent(new Event('authChanged'));
  if (previousRole) window.dispatchEvent(new CustomEvent('peterContextChanged', { detail: { role: null } }));
  return token;
};

export default api;