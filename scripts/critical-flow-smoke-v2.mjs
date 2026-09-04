import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'https://locaio.petertecnet.com.br/';
const BROWSER = process.env.BROWSER;
if (!BROWSER) throw new Error('BROWSER não informado.');

const fakeUser = { id: 9000001, first_name: 'Locador', name: 'Locador E2E', email: 'locador.e2e@example.invalid' };
const state = {
  property: { id: 101, name: 'Apartamento E2E', type: 'apartment', use_type: 'residential', status: 'occupied', street: 'Rua de Teste', number: '100', neighborhood: 'Centro', city: 'Goiânia', state: 'GO', postal_code: '74000-000', bedrooms: 2, bathrooms: 1, parking_spaces: 1, area_m2: 68, default_rent_amount: 2200, default_due_day: 10 },
  lease: { id: 501, public_id: 'lease-e2e-501', property_id: 101, property_name: 'Apartamento E2E', landlord_user_id: 9000001, tenant_user_id: 9000002, tenant_name: 'Inquilino E2E', tenant_email: 'inquilino.e2e@example.invalid', tenant_phone: '62999999999', tenant_tax_id: '12345678909', purpose: 'residential', status: 'draft', starts_on: '2026-08-01', ends_on: '2027-07-31', rent_amount: 2200, due_day: 10, deposit_months: 1, deposit_amount: 2200, guarantee_type: 'deposit', adjustment_index: 'IPCA', adjustment_frequency_months: 12, included_expenses: [], tenant_expenses: ['iptu', 'water', 'electricity'], is_in_force: false, metadata: {} },
  documents: [{ id: 301, name: 'documento-e2e.pdf', category: 'identity', size: 1024 }],
  charges: [], contract: null, termination: null, terminationDocument: null, calls: [], unexpectedWrites: [],
};

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const now = () => '2026-09-04T20:00:00Z';
const corsHeaders = {
  'access-control-allow-origin': new URL(BASE_URL).origin,
  'access-control-allow-headers': 'Authorization, Content-Type, X-Peter-App, X-Frontend-Page, X-Peter-Context-Role, X-Peter-Ecosystem-SDK',
  'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'content-type': 'application/json; charset=utf-8',
};
const respond = (request, payload = {}, status = 200) => request.respond({ status, headers: corsHeaders, body: status === 204 ? '' : JSON.stringify(payload) });
const workspace = () => ({ property: clone(state.property), current_lease: clone(state.lease), leases: [clone(state.lease)], summary: { inspections_total: 0, open_maintenance: 0, pending_amount: state.charges.filter((item) => item.status !== 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0), overdue_amount: 0, assets_total: 0, leases_total: 1 } });

function newContract(status = 'review') {
  const content = 'CONTRATO DE LOCAÇÃO RESIDENCIAL\n\nLocador: Locador E2E\nLocatário: Inquilino E2E\nAluguel mensal: R$ 2.200,00.';
  return { id: 601, public_id: 'contract-e2e-601', title: 'Contrato de locação — Apartamento E2E', status, current_version: 1, parties: [{ id: 701, role: 'landlord', email: fakeUser.email }, { id: 702, role: 'tenant', email: state.lease.tenant_email }], signatures: [], versions: [{ id: 611, version: 1, status, content, content_hash: 'abcdef1234567890abcdef1234567890', is_locked: !['review', 'draft'].includes(status), created_at: now() }] };
}

async function apiMock(request) {
  const { pathname: path } = new URL(request.url());
  const method = request.method();
  state.calls.push(`${method} ${path}`);

  if (method === 'OPTIONS') return respond(request, {}, 200);
  if (path.includes('/interactions') || path.includes('/telemetry')) return respond(request, { accepted: true }, 202);

  if (method === 'GET') {
    if (path.endsWith('/leasing/context')) return respond(request, { contexts: [{ key: 'landlord', label: 'Proprietário' }], default_context: 'landlord' });
    if (path.endsWith('/leasing/dashboard') || path.endsWith('/leasing/context/dashboard')) return respond(request, { active_leases: state.lease.status === 'active' ? 1 : 0, properties: 1, pending_amount: state.charges.filter((item) => item.status !== 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0), overdue_amount: 0, next_charges: clone(state.charges.filter((item) => item.status !== 'paid')) });
    if (path.endsWith('/properties')) return respond(request, [clone(state.property)]);
    if (path.endsWith('/leases')) return respond(request, [clone(state.lease)]);
    if (path.endsWith('/me')) return respond(request, { user: fakeUser });
    if (path.endsWith('/leasing/payment-profile')) return respond(request, { can_receive: true, profile: null });
    if (path.endsWith('/leasing/action-center')) return respond(request, { items: [], actions: [] });
    if (path.endsWith('/leasing/portfolio')) return respond(request, { properties: [], summary: {} });
    if (path.endsWith('/leasing/lifecycle')) return respond(request, { items: [] });
    if (path.endsWith('/leasing/tenant-portal')) return respond(request, { leases: [] });
    if (path.endsWith('/properties/101')) return respond(request, workspace());
    if (path.endsWith('/properties/101/inspections')) return respond(request, []);
    if (path.endsWith('/properties/101/assets')) return respond(request, { items: [] });
    if (path.endsWith('/properties/101/maintenance')) return respond(request, { items: [] });
    if (path.endsWith('/properties/101/timeline')) return respond(request, { events: [] });
    if (path.endsWith('/properties/101/financial')) return respond(request, { summary: {}, charges: clone(state.charges) });
    if (path.endsWith('/leases/501')) return respond(request, { lease: clone(state.lease), property: clone(state.property), documents: clone(state.documents), charges: clone(state.charges), signatures: clone(state.contract?.signatures || []) });
    if (path.endsWith('/leases/501/contract')) return respond(request, { document: clone(state.contract), timeline: [] });
    if (path.endsWith('/leases/501/termination')) return respond(request, clone(state.termination));
    if (path.endsWith('/leases/501/termination-document')) return respond(request, { termination: clone(state.termination), document: clone(state.terminationDocument) });
    if (path.endsWith('/account/ecosystem')) return respond(request, { data: { account: fakeUser, applications: [] } });
    if (path.endsWith('/applications')) return respond(request, []);
    return respond(request, {});
  }

  if (method === 'POST' && path.endsWith('/leases/501/proposal/generate')) return respond(request, { document: { id: 590, public_id: 'proposal-e2e-590', title: 'Proposta de locação — Apartamento E2E', status: 'review', current_version: 1, versions: [{ id: 591, version: 1, status: 'review', content: 'PROPOSTA DE LOCAÇÃO\nAluguel: R$ 2.200,00.' }] } }, 201);
  if (method === 'POST' && path.endsWith('/leases/501/contract/generate')) { state.contract = newContract(); state.lease.contract_text = state.contract.versions[0].content; return respond(request, { document: clone(state.contract) }, 201); }
  if (method === 'POST' && path.endsWith('/leases/501/contract/send')) { state.contract.status = 'awaiting_signatures'; state.contract.versions[0].status = 'awaiting_signatures'; state.contract.versions[0].is_locked = true; state.contract.signatures = [{ id: 720, document_party_id: 702, party: 'tenant', signed_at: now() }]; return respond(request, { document: clone(state.contract) }); }
  if (method === 'POST' && path.endsWith('/leases/501/contract/sign')) { state.contract.signatures = [...state.contract.signatures.filter((item) => item.party !== 'landlord'), { id: 721, document_party_id: 701, party: 'landlord', signed_at: now() }]; state.contract.status = 'signed'; state.contract.versions[0].status = 'signed'; state.lease.status = 'active'; state.lease.is_in_force = true; return respond(request, { document: clone(state.contract) }); }
  if (method === 'POST' && path.endsWith('/leases/501/charges/schedule')) { state.charges = [{ id: 901, public_id: 'charge-e2e-901', lease_id: 501, type: 'rent', description: 'Aluguel setembro/2026', due_date: '2026-09-10', amount: 2200, status: 'pending', payment_method: null }]; return respond(request, { created: 1, charges: clone(state.charges) }, 201); }
  if (method === 'PATCH' && path.endsWith('/leases/501/charges/901/paid')) { state.charges[0] = { ...state.charges[0], status: 'paid', paid_at: now(), payment_method: 'transfer' }; return respond(request, clone(state.charges[0])); }
  if (method === 'POST' && path.endsWith('/leases/501/termination')) { state.termination = { id: 801, status: 'open', description: 'Encerramento E2E', payload: {} }; return respond(request, clone(state.termination), 201); }
  if (method === 'POST' && path.endsWith('/leases/501/termination/complete')) { state.termination = { id: 801, status: 'completed', description: 'Encerramento E2E', payload: { ended_on: '2026-09-04' } }; state.terminationDocument = { id: 811, public_id: 'termination-e2e-811', title: 'Distrato da locação — Apartamento E2E', status: 'review', current_version: 1, versions: [{ id: 812, version: 1, status: 'review', content: 'INSTRUMENTO DE DISTRATO\nEntrega de chaves confirmada.' }] }; state.lease.status = 'ended'; state.lease.is_in_force = false; state.property.status = 'available'; return respond(request, { termination: clone(state.termination), document: clone(state.terminationDocument) }); }
  if (method === 'POST' && path.endsWith('/leases/501/termination-document/send')) { state.terminationDocument.status = 'awaiting_signatures'; return respond(request, { document: clone(state.terminationDocument), sent_to: [state.lease.tenant_email] }); }
  if (method === 'POST' && path.endsWith('/leases/501/charges/901/payment')) { state.unexpectedWrites.push(`${method} ${path}`); return respond(request, { message: 'Checkout do pagador não deve ser iniciado pela visão do proprietário.' }, 403); }

  state.unexpectedWrites.push(`${method} ${path}`);
  return respond(request, { message: `Escrita E2E inesperada bloqueada: ${method} ${path}` }, 418);
}

async function clickText(page, text, selector = 'button') {
  const ok = await page.evaluate(({ text, selector }) => {
    const candidates = [...document.querySelectorAll(selector)];
    const element = candidates.find((item) => {
      const rect = item.getBoundingClientRect();
      return item.textContent?.trim().includes(text) && getComputedStyle(item).display !== 'none' && getComputedStyle(item).visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    });
    if (!element) return false;
    element.click(); return true;
  }, { text, selector });
  if (!ok) throw new Error(`Elemento visível não encontrado: ${text}`);
}

const waitText = (page, text, timeout = 12000) => page.waitForFunction((value) => document.body.innerText.includes(value), { timeout }, text);

async function assertOwnerChargeActions(page) {
  const visible = await page.$$eval('.pt-charge-actions button', (buttons) => buttons.filter((button) => { const rect = button.getBoundingClientRect(); return getComputedStyle(button).display !== 'none' && rect.width > 0 && rect.height > 0; }).map((button) => button.textContent?.trim()));
  if (['Pix', 'Boleto', 'Cartão'].some((label) => visible.some((text) => text.includes(label)))) throw new Error(`A visão do proprietário expõe checkout do pagador: ${visible.join(', ')}`);
  if (!visible.some((text) => text.includes('Marcar recebido'))) throw new Error('A baixa manual do proprietário não está disponível.');
  console.log('Ações financeiras visíveis ao proprietário:', visible.join(', '));
}

const browser = await puppeteer.launch({ executablePath: BROWSER, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(30000);
page.on('pageerror', (error) => console.error('[pageerror]', error.message));

try {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    let url;
    try { url = new URL(request.url()); } catch { request.continue(); return; }
    if (url.hostname === 'api.petertecnet.com.br') { apiMock(request).catch((error) => { console.error('[api-mock]', error); if (!request.isInterceptResolutionHandled?.()) request.abort(); }); return; }
    request.continue();
  });

  await page.evaluateOnNewDocument((user) => { localStorage.setItem('token', 'locaio-critical-flow-e2e'); localStorage.setItem('user', JSON.stringify(user)); localStorage.setItem('peter_context_role:locaio', 'landlord'); }, fakeUser);
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  if (!response || response.status() >= 400) throw new Error(`Aplicação respondeu HTTP ${response?.status() ?? 'sem resposta'}.`);
  await page.waitForSelector('.pt-app-shell', { visible: true });

  await clickText(page, 'Locações', '.pt-sidebar nav button');
  await waitText(page, 'Inquilino E2E');
  await clickText(page, 'Inquilino E2E', '.pt-lease-row');
  await waitText(page, 'Contrato ainda não emitido');
  await clickText(page, 'Gerar proposta');
  await waitText(page, 'Proposta de locação — Apartamento E2E');
  await clickText(page, 'Gerar contrato');
  await waitText(page, 'CONTRATO DE LOCAÇÃO RESIDENCIAL');
  await clickText(page, 'Bloquear e enviar para assinatura');
  await waitText(page, '1/2');
  await page.type('.pt-sign-box input', 'Locador E2E');
  await clickText(page, 'Assinar versão atual');
  await waitText(page, '2/2');

  await clickText(page, 'Gerar cronograma');
  await waitText(page, 'Aluguel setembro/2026');
  await assertOwnerChargeActions(page);
  await clickText(page, 'Marcar recebido');
  await waitText(page, 'Pago');

  await new Promise((resolve) => setTimeout(resolve, 3800));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('locaio:open-property', { detail: { propertyId: 101 } })));
  await page.waitForSelector('.pw-shell', { visible: true, timeout: 12000 });
  await page.waitForSelector('[data-lease-termination-trigger]', { visible: true, timeout: 12000 });
  await page.click('[data-lease-termination-trigger]');
  await page.waitForSelector('.lt-overlay', { visible: true });
  await waitText(page, 'Distrato e entrega de chaves');

  const confirmations = await page.evaluate(() => {
    const click = (needle) => { const label = [...document.querySelectorAll('.lt-overlay label')].find((item) => item.textContent?.includes(needle)); const input = label?.querySelector('input[type="checkbox"]'); if (!input) return false; input.click(); return true; };
    return { keys: click('Chaves recebidas'), final: click('Revisei as informações e confirmo o encerramento') };
  });
  if (!confirmations.keys || !confirmations.final) throw new Error('Confirmações obrigatórias do distrato não foram encontradas.');
  await clickText(page, 'Concluir e gerar distrato');
  await waitText(page, 'Distrato gerado e encerramento registrado com sucesso.');
  await waitText(page, 'Distrato documentado');
  await clickText(page, 'Enviar para assinatura');
  await waitText(page, 'Distrato enviado para assinatura');

  if (state.unexpectedWrites.length) throw new Error(`Escritas inesperadas bloqueadas: ${state.unexpectedWrites.join(' | ')}`);
  if (state.calls.some((call) => call.endsWith('/charges/901/payment'))) throw new Error('A visão do proprietário tentou iniciar checkout do inquilino.');
  for (const suffix of ['/contract/generate', '/contract/sign', '/charges/schedule', '/charges/901/paid', '/termination/complete']) if (!state.calls.some((call) => call.endsWith(suffix))) throw new Error(`Etapa crítica não exercitada: ${suffix}`);
  console.log('E2E crítico aprovado: contrato → assinatura → cobrança → baixa → distrato, sem escrita na produção.');
} finally {
  await browser.close();
}
