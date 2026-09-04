import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'https://locaio.petertecnet.com.br/';
const BROWSER = process.env.BROWSER;
const SCOPE = process.env.SMOKE_SCOPE || 'public';
const E2E_TOKEN = process.env.LOCAIO_E2E_TOKEN || '';
const E2E_USER = process.env.LOCAIO_E2E_USER || '';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!BROWSER) {
  throw new Error('BROWSER não informado.');
}

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const page = await browser.newPage();
page.setDefaultTimeout(20000);
page.setDefaultNavigationTimeout(30000);

const pageErrors = [];
const providerErrors = [];
const criticalRequestFailures = [];
const googleRequestFailures = [];

const prohibitedGoogleError = /origin is not allowed|not a valid origin|invalid client|invalid_client|client id.*invalid/i;
const criticalConsoleError = /uncaught|typeerror|referenceerror|syntaxerror|cannot read properties|failed to load module script/i;

page.on('pageerror', (error) => pageErrors.push(error?.stack || error?.message || String(error)));
page.on('console', (message) => {
  const text = message.text();
  console.log(`[browser:${message.type()}] ${text}`);
  if (prohibitedGoogleError.test(text)) providerErrors.push(text);
  if (message.type() === 'error' && criticalConsoleError.test(text)) pageErrors.push(text);
});
page.on('requestfailed', (request) => {
  const url = request.url();
  const errorText = request.failure()?.errorText || 'request failed';
  const failure = `${errorText} ${url}`;
  const isBenignAbort = errorText === 'net::ERR_ABORTED';
  if ((url.includes('accounts.google.com') || url.includes('googleapis.com')) && !isBenignAbort) {
    googleRequestFailures.push(failure);
  }
  try {
    const host = new URL(url).hostname;
    if ((host === 'locaio.petertecnet.com.br' || host === 'api.petertecnet.com.br') && !isBenignAbort) {
      criticalRequestFailures.push(failure);
    }
  } catch {
    // Ignore malformed/non-network URLs.
  }
});

async function navigate() {
  const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  if (!response || response.status() >= 400) {
    throw new Error(`Locaio respondeu HTTP ${response?.status() ?? 'sem resposta'}.`);
  }
  await page.waitForSelector('#root > *', { visible: true });
  await page.waitForFunction(() => (document.querySelector('#root')?.innerText || '').trim().length > 20);
}

async function assertHealthy(label) {
  const state = await page.evaluate(() => ({
    rootTextLength: (document.querySelector('#root')?.innerText || '').trim().length,
    recoveryVisible: Boolean(document.querySelector('.locaio-recovery')),
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    shellVisible: Boolean(document.querySelector('.pt-app-shell')),
    authVisible: Boolean(document.querySelector('.auth-page')),
  }));
  console.log(`${label}:`, JSON.stringify(state));
  if (state.rootTextLength < 20) throw new Error(`${label}: raiz da aplicação sem conteúdo útil.`);
  if (state.recoveryVisible) throw new Error(`${label}: AppRecoveryBoundary foi acionado.`);
  if (state.scrollWidth > state.width + 24) throw new Error(`${label}: overflow horizontal excessivo (${state.scrollWidth}px > ${state.width}px).`);
}

async function assertGoogleLogin() {
  const authVisible = await page.$('.auth-page');
  if (!authVisible) {
    console.log('Google login: sessão autenticada detectada; check público do botão ignorado.');
    return;
  }

  await page.waitForSelector('.google-login');
  await page.waitForFunction(() => {
    const host = document.querySelector('.google-login');
    if (!host) return false;
    const candidate = host.querySelector('iframe') || host.firstElementChild;
    if (!candidate) return false;
    const rect = candidate.getBoundingClientRect();
    return rect.width > 100 && rect.height > 20;
  }, { timeout: 20000 });

  const state = await page.evaluate(() => {
    const host = document.querySelector('.google-login');
    const iframe = host?.querySelector('iframe');
    return {
      hostPresent: Boolean(host),
      childCount: host?.childElementCount || 0,
      iframeHost: iframe?.src ? new URL(iframe.src).hostname : null,
    };
  });
  console.log('Google login DOM:', JSON.stringify(state));

  if (state.iframeHost && state.iframeHost !== 'accounts.google.com') {
    throw new Error(`Google login renderizado por host inesperado: ${state.iframeHost}`);
  }
  if (googleRequestFailures.length) throw new Error(`Falha ao carregar recursos Google: ${googleRequestFailures.join(' | ')}`);
  if (providerErrors.length) throw new Error(`Google rejeitou configuração/origem: ${providerErrors.join(' | ')}`);
}

async function clickNavigationTargets(prefix) {
  const labels = await page.$$eval('button', (buttons) => buttons.map((button) => button.textContent?.trim()).filter(Boolean));
  const expected = ['Visão geral', 'Imóveis', 'Locações'];
  const missing = expected.filter((label) => !labels.some((text) => text.includes(label)));
  if (missing.length) throw new Error(`${prefix}: navegação ausente: ${missing.join(', ')}.`);

  for (const target of expected) {
    await page.evaluate((label) => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(label));
      button?.click();
    }, target);
    await page.waitForFunction((label) => [...document.querySelectorAll('button')]
      .some((item) => item.textContent?.includes(label) && item.classList.contains('active')), {}, target);
    await assertHealthy(`${prefix}:${target}`);
  }
}

async function assertNavigationIfAuthenticated() {
  if (!E2E_TOKEN) return;

  await page.evaluate(({ token, user }) => {
    localStorage.setItem('token', token);
    if (user) localStorage.setItem('user', user);
  }, { token: E2E_TOKEN, user: E2E_USER });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pt-app-shell', { visible: true });
  await assertHealthy('authenticated-live');
  await clickNavigationTargets('authenticated-live');
}

async function assertMockAuthenticatedNavigation() {
  const appOrigin = new URL(BASE_URL).origin;
  const fakeUser = { id: 9000001, first_name: 'Smoke', name: 'Smoke Test', email: 'smoke@example.invalid' };
  const jsonHeaders = {
    'access-control-allow-origin': appOrigin,
    'access-control-allow-headers': 'Authorization, Content-Type, X-Peter-App, X-Frontend-Page, X-Peter-Context-Role, X-Peter-Ecosystem-SDK',
    'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'content-type': 'application/json; charset=utf-8',
  };

  await page.setRequestInterception(true);
  page.on('request', async (request) => {
    if (request.isInterceptResolutionHandled?.()) return;
    let url;
    try { url = new URL(request.url()); } catch { await request.continue(); return; }
    if (url.hostname !== 'api.petertecnet.com.br') {
      await request.continue();
      return;
    }

    if (request.method() === 'OPTIONS') {
      await request.respond({ status: 204, headers: jsonHeaders, body: '' });
      return;
    }

    const path = url.pathname;
    let payload = {};
    if (path.endsWith('/leasing/context')) {
      payload = { contexts: [{ key: 'landlord', label: 'Proprietário' }], default_context: 'landlord' };
    } else if (path.endsWith('/leasing/context/dashboard')) {
      payload = { active_leases: 0, properties: 0, pending_amount: 0, overdue_amount: 0, next_charges: [] };
    } else if (path.endsWith('/properties') || path.endsWith('/leases') || path.endsWith('/applications')) {
      payload = [];
    } else if (path.endsWith('/me')) {
      payload = { user: fakeUser };
    } else if (path.endsWith('/account/ecosystem')) {
      payload = { data: { account: fakeUser, applications: [] } };
    }

    await request.respond({ status: 200, headers: jsonHeaders, body: JSON.stringify(payload) });
  });

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.evaluate((user) => {
    localStorage.setItem('token', 'locaio-smoke-token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('peter_context_role:locaio', 'landlord');
  }, fakeUser);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pt-app-shell', { visible: true });
  await assertHealthy('authenticated-mock-desktop');
  await clickNavigationTargets('authenticated-mock');

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await assertHealthy('authenticated-mock-mobile');
  console.log('Navegação autenticada simulada concluída sem escrever na API de produção.');
}

try {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await navigate();
  await assertHealthy('desktop');

  if (SCOPE === 'google' || SCOPE === 'all') await assertGoogleLogin();

  if (SCOPE === 'public' || SCOPE === 'all') {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#root > *', { visible: true });
    await assertHealthy('mobile');
  }

  if ((SCOPE === 'authenticated' || SCOPE === 'all') && E2E_TOKEN) await assertNavigationIfAuthenticated();
  if (SCOPE === 'public' || SCOPE === 'authenticated' || SCOPE === 'all') await assertMockAuthenticatedNavigation();

  if (pageErrors.length) throw new Error(`Erros críticos de JavaScript: ${pageErrors.join(' | ')}`);
  if (criticalRequestFailures.length) throw new Error(`Falhas críticas de rede: ${criticalRequestFailures.join(' | ')}`);

  console.log(`Smoke de produção concluído com sucesso (scope=${SCOPE}).`);
} finally {
  await browser.close();
}
