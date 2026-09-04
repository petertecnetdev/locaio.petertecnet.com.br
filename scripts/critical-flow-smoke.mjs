import puppeteer from 'puppeteer-core';

const BASE_URL = process.env.BASE_URL || 'https://locaio.petertecnet.com.br/';
const BROWSER = process.env.BROWSER;

if (!BROWSER) throw new Error('BROWSER não informado.');

const fakeUser = {
  id: 9000001,
  first_name: 'Locador',
  name: 'Locador E2E',
  email: 'locador.e2e@example.invalid',
};

const state = {
  property: {
    id: 101,
    name: 'Apartamento E2E',
    type: 'apartment',
    use_type: 'residential',
    status: 'occupied',
    street: 'Rua de Teste',
    number: '100',
    neighborhood: 'Centro',
    city: 'Goiânia',
    state: 'GO',
    postal_code: '74000-000',
    bedrooms: 2,
    bathrooms: 1,
    parking_spaces: 1,
    area_m2: 68,
    default_rent_amount: 2200,
    default_due_day: 10,
  },
  lease: {
    id: 501,
    public_id: 'lease-e2e-501',
    property_id: 101,
    property_name: 'Apartamento E2E',
    landlord_user_id: 9000001,
    tenant_user_id: 9000002,
    tenant_name: 'Inquilino E2E',
    tenant_email: 'inquilino.e2e@example.invalid',
    tenant_phone: '62999999999',
    tenant_tax_id: '12345678909',
    purpose: 'residential',
    status: 'draft',
    starts_on: '2026-08-01',
    ends_on: '2027-07-31',
    rent_amount: 2200,
    due_day: 10,
    deposit_months: 1,
    deposit_amount: 2200,
    guarantee_type: 'deposit',
    adjustment_index: 'IPCA',
    adjustment_frequency_months: 12,
    included_expenses: [],
    tenant_expenses: ['iptu', 'water', 'electricity'],
    is_in_force: false,
    metadata: {},
  },
  documents: [{ id: 301, name: 'documento-e2e.pdf', category: 'identity', size: 1024 }],
  charges: [],
  contract: null,
  termination: null,
  terminationDocument: null,
  calls: [],
  unexpectedWrites: [],
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const now = () => '2026-09-04T20:00:00Z';
const leaseListItem = () => clone(state.lease);
const workspace = () => ({
  property: clone(state.property),
  current_lease: clone(state.lease),
  leases: [clone(state.lease)],
  summary: {
    inspections_total: 0,
    open_maintenance: 0,
    pending_amount: state.charges.filter((item) => item.status !== 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0),
    overdue_amount: 0,
    assets_total: 0,
    leases_total: 1,
  },
});

function contractDocument(status = 'review') {
  const content = 'CONTRATO DE LOCAÇÃO RESIDENCIAL\n\nLocador: Locador E2E\nLocatário: Inquilino E2E\nAluguel mensal: R$ 2.200,00.';
  return {
    id: 601,
    public_id: 'contract-e2e-601',
    title: 'Contrato de locação — Apartamento E2E',
    status,
    current_version: 1,
    parties: [
      { id: 701, role: 'landlord', email: fakeUser.email },
      { id: 702, role: 'tenant', email: state.lease.tenant_email },
    ],
    signatures: [],
    versions: [{
      id: 611,
      version: 1,
      status,
      content,
      content_hash: 'abcdef1234567890abcdef1234567890',
      is_locked: status !== 'review' && status !== 'draft',
      created_at: now(),
    }],
  };
}

function jsonResponse(request, payload, status = 200) {
  return request.respond({
    status,
    headers: {
      'access-control-allow-origin': new URL(BASE_URL).origin,
      'access-control-allow-headers': 'Authorization, Content-Type, X-Peter-App, X-Frontend-Page, X-Peter-Context-Role, X-Peter-Ecosystem-SDK',
      'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(payload ?? {}),
  });
}

async function handleApiRequest(request) {
  const url = new URL(request.url());
  const path = url.pathname;
  const method = request.method();
  state.calls.push(`${method} ${path}`);

  if (method === 'OPTIONS') return request.respond({ status: 204, body: '' });
  if (path.includes('/interactions') || path.includes('/telemetry')) return jsonResponse(request, { accepted: true }, 202);

  if (method === 'GET') {
    if (path.endsWith('/leasing/context')) return jsonResponse(request, { contexts: [{ key: 'landlord', label: 'Proprietário' }], default_context: 'landlord' });
    if (path.endsWith('/leasing/dashboard')) return jsonResponse(request, {
      active_leases: state.lease.status === 'active' ? 1 : 0,
      properties: 1,
      pending_amount: state.charges.filter((item) => item.status !== 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0),
      overdue_amount: 0,
      next_charges: clone(state.charges.filter((item) => item.status !== 'paid')),
    });
    if (path.endsWith('/properties')) return jsonResponse(request, [clone(state.property)]);
    if (path.endsWith('/leases')) return jsonResponse(request, [leaseListItem()]);
    if (path.endsWith('/me')) return jsonResponse(request, { user: fakeUser });
    if (path.endsWith('/leasing/payment-profile')) return jsonResponse(request, { can_receive: true, profile: null });
    if (path.endsWith('/leasing/action-center')) return jsonResponse(request, { items: [], actions: [] });
    if (path.endsWith('/leasing/portfolio')) return jsonResponse(request, { properties: [], summary: {} });
    if (path.endsWith('/leasing/lifecycle')) return jsonResponse(request, { items: [] });
    if (path.endsWith('/leasing/tenant-portal')) return jsonResponse(request, { leases: [] });
    if (path.endsWith('/properties/101')) return jsonResponse(request, workspace());
    if (path.endsWith('/properties/101/inspections')) return jsonResponse(request, []);
    if (path.endsWith('/properties/101/assets')) return jsonResponse(request, { items: [] });
    if (path.endsWith('/properties/101/maintenance')) return jsonResponse(request, { items: [] });
    if (path.endsWith('/properties/101/timeline')) return jsonResponse(request, { events: [] });
    if (path.endsWith('/properties/101/financial')) return jsonResponse(request, { summary: {}, charges: clone(state.charges) });
    if (path.endsWith('/leases/501')) return jsonResponse(request, {
      lease: clone(state.lease),
      property: clone(state.property),
      documents: clone(state.documents),
      charges: clone(state.charges),
      signatures: clone(state.contract?.signatures || []),
    });
    if (path.endsWith('/leases/501/contract')) return jsonResponse(request, { document: clone(state.contract), timeline: [] });
    if (path.endsWith('/leases/501/termination')) return jsonResponse(request, clone(state.termination));
    if (path.endsWith('/leases/501/termination-document')) return jsonResponse(request, { termination: clone(state.termination), document: clone(state.terminationDocument) });
    if (path.endsWith('/leases/501/contract/timeline') || path.endsWith('/leases/501/timeline')) return jsonResponse(request, { events: [] });
    if (path.endsWith('/account/ecosystem')) return jsonResponse(request, { data: { account: fakeUser, applications: [] } });
    return jsonResponse(request, {});
  }

  if (method === 'POST' && path.endsWith('/leases/501/proposal/generate')) {
    return jsonResponse(request, { document: {
      id: 590,
      public_id: 'proposal-e2e-590',
      title: 'Proposta de locação — Apartamento E2E',
      status: 'review',
      current_version: 1,
      versions: [{ id: 591, version: 1, status: 'review', content: 'PROPOSTA DE LOCAÇÃO\nAluguel: R$ 2.200,00.' }],
    } }, 201);
  }

  if (method === 'POST' && path.endsWith('/leases/501/contract/generate')) {
    state.contract = contractDocument('review');
    state.lease.contract_text = state.contract.versions[0].content;
    return jsonResponse(request, { document: clone(state.contract) }, 201);
  }

  if (method === 'POST' && path.endsWith('/leases/501/contract/send')) {
    state.contract.status = 'awaiting_signatures';
    state.contract.versions[0].status = 'awaiting_signatures';
    state.contract.versions[0].is_locked = true;
    // Models the tenant signing asynchronously before the landlord finishes the flow.
    state.contract.signatures = [{ id: 720, document_party_id: 702, party: 'tenant', signed_at: now() }];
    return jsonResponse(request, { document: clone(state.contract) });
  }

  if (method === 'POST' && path.endsWith('/leases/501/contract/sign')) {
    state.contract.signatures = [
      ...state.contract.signatures.filter((item) => item.party !== 'landlord'),
      { id: 721, document_party_id: 701, party: 'landlord', signed_at: now() },
    ];
    state.contract.status = 'signed';
    state.contract.versions[0].status = 'signed';
    state.lease.status = 'active';
    state.lease.is_in_force = true;
    state.property.status = 'occupied';
    return jsonResponse(request, { document: clone(state.contract) });
  }

  if (method === 'POST' && path.endsWith('/leases/501/charges/schedule')) {
    state.charges = [{
      id: 901,
      public_id: 'charge-e2e-901',
      lease_id: 501,
      type: 'rent',
      description: 'Aluguel setembro/2026',
      due_date: '2026-09-10',
      amount: 2200,
      status: 'pending',
      payment_method: null,
    }];
    return jsonResponse(request, { created: 1, charges: clone(state.charges) }, 201);
  }

  if (method === 'PATCH' && path.endsWith('/leases/501/charges/901/paid')) {
    state.charges[0] = { ...state.charges[0], status: 'paid', paid_at: now(), payment_method: 'transfer' };
    return jsonResponse(request, clone(state.charges[0]));
  }

  if (method === 'POST' && path.endsWith('/leases/501/termination')) {
    state.termination = { id: 801, status: 'open', description: 'Encerramento E2E', payload: {} };
    return jsonResponse(request, clone(state.termination), 201);
  }

  if (method === 'POST' && path.endsWith('/leases/501/termination/complete')) {
    state.termination = { id: 801, status: 'completed', description: 'Encerramento E2E', payload: { ended_on: '2026-09-04' } };
    state.terminationDocument = {
      id: 811,
      public_id: 'termination-e2e-811',
      title: 'Distrato da locação — Apartamento E2E',
      status: 'review',
      current_version: 1,
      versions: [{ id: 812, version: 1, status: 'review', content: 'INSTRUMENTO DE DISTRATO\nEntrega de chaves confirmada.' }],
    };
    state.lease.status = 'ended';
    state.lease.is_in_force = false;
    state.property.status = 'available';
    return jsonResponse(request, { termination: clone(state.termination), document: clone(state.terminationDocument) });
  }

  if (method === 'POST' && path.endsWith('/leases/501/termination-document/send')) {
    state.terminationDocument.status = 'awaiting_signatures';
    return jsonResponse(request, { document: clone(state.terminationDocument), sent_to: [state.lease.tenant_email] });
  }

  if (method === 'POST' && path.endsWith('/leases/501/charges/901/payment')) {
    state.unexpectedWrites.push(`${method} ${path}`);
    return jsonResponse(request, { message: 'Checkout do pagador não deve ser iniciado pela visão do proprietário.' }, 403);
  }

  state.unexpectedWrites.push(`${method} ${path}`);
  return jsonResponse(request, { message: `Escrita E2E inesperada bloqueada: ${method} ${path}` }, 418);
}

async function clickByText(page, text, selector = 'button') {
  const clicked = await page.evaluate(({ text, selector }) => {
    const element = [...document.querySelectorAll(selector)].find((item) => item.textContent?.trim().includes(text) && getComputedStyle(item).display !== 'none');
    if (!element) return false;
    element.click();
    return true;
  }, { text, selector });
  if (!clicked) throw new Error(`Elemento visível não encontrado para clique: ${text}`);
}

async function waitText(page, text, timeout = 10000) {
  await page.waitForFunction((value) => document.body.innerText.includes(value), { timeout }, text);
}

async function assertOwnerPaymentActions(page) {
  const actions = await page.$$eval('.pt-charge-actions button', (buttons) => buttons.map((button) => ({
    text: button.textContent?.trim(),
    visible: getComputedStyle(button).display !== 'none' && button.getBoundingClientRect().width > 0,
  })));
  const visible = actions.filter((item) => item.visible).map((item) => item.text);
  for (const forbidden of ['Pix', 'Boleto', 'Cartão']) {
    if (visible.some((text) => text.includes(forbidden))) {
      throw new Error(`A visão do proprietário ainda expõe ação de pagamento do inquilino: ${forbidden}.`);
    }
  }
  if (!visible.some((text) => text.includes('Marcar recebido'))) {
    throw new Error('A ação do proprietário para confirmar recebimento não está disponível.');
  }
  console.log('Ações financeiras do proprietário:', JSON.stringify(visible));
}

const browser = await puppeteer.launch({
  executablePath: BROWSER,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const page = await browser.newPage();
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(30000);

try {
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    let url;
    try { url = new URL(request.url()); } catch { request.continue(); return; }
    if (url.hostname === 'api.petertecnet.com.br') {
      handleApiRequest(request).catch((error) => {
        console.error('Falha no mock da API:', error);
        if (!request.isInterceptResolutionHandled?.()) request.abort();
      });
      return;
    }
    request.continue();
  });

  await page.evaluateOnNewDocument((user) => {
    localStorage.setItem('token', 'locaio-critical-flow-e2e');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('peter_context_role:locaio', 'landlord');
  }, fakeUser);

  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
  const response = await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  if (!response || response.status() >= 400) throw new Error(`Produção respondeu HTTP ${response?.status() ?? 'sem resposta'}.`);
  await page.waitForSelector('.pt-app-shell', { visible: true });

  await clickByText(page, 'Locações');
  await waitText(page, 'Inquilino E2E');
  await clickByText(page, 'Inquilino E2E', '.pt-lease-row');
  await waitText(page, 'Central do contrato');
  await waitText(page, 'Contrato ainda não emitido');

  await clickByText(page, 'Gerar proposta');
  await waitText(page, 'Proposta de locação — Apartamento E2E');

  await clickByText(page, 'Gerar contrato');
  await waitText(page, 'CONTRATO DE LOCAÇÃO RESIDENCIAL');
  await clickByText(page, 'Bloquear e enviar para assinatura');
  await waitText(page, '1/2');

  const signer = await page.$('.pt-sign-box input');
  if (!signer) throw new Error('Campo do signatário não encontrado.');
  await signer.type('Locador E2E');
  await clickByText(page, 'Assinar versão atual');
  await waitText(page, '2/2');
  await waitText(page, 'Assinado');

  await clickByText(page, 'Gerar cronograma');
  await waitText(page, 'Aluguel setembro/2026');
  await assertOwnerPaymentActions(page);
  await clickByText(page, 'Marcar recebido');
  await waitText(page, 'Pago');

  // Lazy operational features need to mount before the property event is replayed.
  await new Promise((resolve) => setTimeout(resolve, 3800));
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('locaio:open-property', { detail: { propertyId: 101 } })));
  await page.waitForSelector('.pw-shell', { visible: true });
  await page.waitForSelector('[data-lease-termination-trigger]', { visible: true, timeout: 10000 });
  await page.click('[data-lease-termination-trigger]');
  await page.waitForSelector('.lt-overlay', { visible: true });
  await waitText(page, 'Distrato e entrega de chaves');

  const terminationChecks = await page.evaluate(() => {
    const clickInput = (needle) => {
      const label = [...document.querySelectorAll('.lt-overlay label')].find((item) => item.textContent?.includes(needle));
      const input = label?.querySelector('input[type="checkbox"]');
      if (!input) return false;
      input.click();
      return true;
    };
    return {
      keys: clickInput('Chaves recebidas'),
      confirm: clickInput('Revisei as informações e confirmo o encerramento'),
    };
  });
  if (!terminationChecks.keys || !terminationChecks.confirm) throw new Error('Confirmações obrigatórias do distrato não foram encontradas.');

  await clickByText(page, 'Concluir e gerar distrato');
  await waitText(page, 'Distrato gerado e encerramento registrado com sucesso.');
  await waitText(page, 'Distrato documentado');
  await clickByText(page, 'Enviar para assinatura');
  await waitText(page, 'Distrato enviado para assinatura');

  if (state.unexpectedWrites.length) {
    throw new Error(`Escritas inesperadas foram bloqueadas pelo E2E: ${state.unexpectedWrites.join(' | ')}`);
  }
  if (!state.calls.some((call) => call.endsWith('/contract/generate'))) throw new Error('Fluxo não exercitou geração de contrato.');
  if (!state.calls.some((call) => call.endsWith('/charges/schedule'))) throw new Error('Fluxo não exercitou cronograma financeiro.');
  if (!state.calls.some((call) => call.endsWith('/termination/complete'))) throw new Error('Fluxo não exercitou conclusão do distrato.');
  if (state.calls.some((call) => call.endsWith('/charges/901/payment'))) throw new Error('A visão do proprietário tentou iniciar checkout de pagamento.');

  console.log('E2E crítico concluído: contrato, assinatura, cobrança, baixa e distrato — todas as escritas interceptadas.');
} finally {
  await browser.close();
}
