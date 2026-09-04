import { spawnSync } from 'node:child_process';
import { rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const API_BASE_URL = (process.env.VITE_API_URL || 'https://api.petertecnet.com.br/api').replace(/\/+$/, '');
const PROVIDERS_URL = process.env.PETER_IDENTITY_PROVIDERS_URL || `${API_BASE_URL}/account/identity/providers`;
const IS_CI = String(process.env.CI || '').toLowerCase() === 'true';
const SOURCE_LOGO = fileURLToPath(new URL('../public/logo-locaio.png', import.meta.url));
const DIST_LOGO = fileURLToPath(new URL('../dist/logo-locaio.png', import.meta.url));
const RELEASE_FILE = fileURLToPath(new URL('../dist/release.json', import.meta.url));

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

  try {
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
  } catch (error) {
    // CI validates source/build integrity and must not depend on availability of a
    // production identity endpoint. Runtime/production builds remain strict.
    if (IS_CI) {
      console.warn(`[Locaio build] Provedor Google indisponível no CI: ${error?.message || error}. O bundle será validado com login Google desabilitado.`);
      return '';
    }
    throw error;
  }
}

async function optimizeProductionAssets() {
  const temporaryLogo = `${DIST_LOGO}.tmp`;
  try {
    const { default: sharp } = await import('sharp');
    await sharp(SOURCE_LOGO)
      .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
      .toFile(temporaryLogo);
    await rename(temporaryLogo, DIST_LOGO);
    console.log('[Locaio build] Logo de produção otimizada para carregamento rápido.');
  } catch (error) {
    await rm(temporaryLogo, { force: true }).catch(() => {});
    console.warn(`[Locaio build] Não foi possível otimizar a logo; mantendo o arquivo original: ${error?.message || error}`);
  }
}

function resolveReleaseCommit() {
  const explicit = process.env.LOCAIO_RELEASE_SHA?.trim() || process.env.GITHUB_SHA?.trim();
  if (explicit && /^[a-f0-9]{40}$/i.test(explicit)) return explicit.toLowerCase();

  const git = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  const commit = git.status === 0 ? git.stdout.trim() : '';
  if (!/^[a-f0-9]{40}$/i.test(commit)) {
    throw new Error('Não foi possível determinar o commit da release.');
  }
  return commit.toLowerCase();
}

async function writeReleaseManifest() {
  const release = {
    app: 'locaio',
    commit: resolveReleaseCommit(),
    built_at: new Date().toISOString(),
  };

  await writeFile(RELEASE_FILE, `${JSON.stringify(release, null, 2)}\n`, 'utf8');
  console.log(`[Locaio build] Release verificável gerada para ${release.commit}.`);
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
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);

  await optimizeProductionAssets();
  await writeReleaseManifest();
  process.exit(0);
} catch (error) {
  console.error(`[Locaio build] ${error?.message || error}`);
  process.exit(1);
}
