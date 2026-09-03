import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const API_BASE_URL = (process.env.VITE_API_URL || 'https://api.petertecnet.com.br/api').replace(/\/+$/, '');
const PROVIDERS_URL = process.env.PETER_IDENTITY_PROVIDERS_URL || `${API_BASE_URL}/account/identity/providers`;

function validGoogleClientId(value) {
  return typeof value === 'string'
    && /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(value.trim());
}

async function resolveGoogleClientId() {
  const explicit = process.env.VITE_GOOGLE_CLIENT_ID?.trim();
  if (explicit) {
    if (!validGoogleClientId(explicit)) {
      throw new Error('VITE_GOOGLE_CLIENT_ID possui um formato inválido.');
    }
    return explicit;
  }

  const response = await fetch(PROVIDERS_URL, {
    headers: { Accept: 'application/json', 'X-Peter-App': process.env.VITE_APP_SLUG || 'locaio' },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Não foi possível obter provedores de identidade (${response.status}).`);
  }

  const providers = await response.json();
  const clientId = providers?.google?.enabled ? providers?.google?.client_id?.trim() : '';

  if (!validGoogleClientId(clientId)) {
    throw new Error('A API não publicou um Google Client ID válido.');
  }

  return clientId;
}

try {
  const googleClientId = await resolveGoogleClientId();
  const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
  const result = spawnSync(process.execPath, [viteBin, 'build'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_GOOGLE_CLIENT_ID: googleClientId,
    },
  });

  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
} catch (error) {
  console.error(`[Locaio build] ${error?.message || error}`);
  process.exit(1);
}
