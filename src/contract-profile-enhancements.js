import api, { appApi } from './services/api.js';

const DRAFT_KEY = 'locaio:contract-profile:draft';
const expenseLabels = { identity: 'Documento de identidade', address: 'Comprovante de endereço', income: 'Comprovante de renda', other: 'Outro documento' };
const TEMPLATE_OPTIONS = {
  residential_reference_v1: {
    label: 'Residencial completo',
    description: 'Imóvel residencial inteiro, com vistoria, caução opcional e aditivo de segurança.',
    occupancy_type: 'whole_property',
    purpose: 'residential',
  },
  commercial_reference_v1: {
    label: 'Comercial completo',
    description: 'Imóvel comercial inteiro, com finalidade empresarial, licenças, caução e regras operacionais.',
    occupancy_type: 'whole_property',
    purpose: 'commercial',
  },
  shared_suite_reference_v1: {
    label: 'Suíte/quarto em casa compartilhada',
    description: 'Unidade privativa dentro de imóvel compartilhado, com áreas comuns e regras de convivência.',
    occupancy_type: 'shared_unit',
    purpose: 'residential',
  },
};
let latestLeaseDetail = null;
let installed = false;
let inviteProcessed = false;

const parse = (value, fallback = {}) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};
const draft = () => parse(sessionStorage.getItem(DRAFT_KEY), {});
const saveDraft = (value) => sessionStorage.setItem(DRAFT_KEY, JSON.stringify(value || {}));
const clean = (value) => String(value ?? '').trim();
const currentUser = () => parse(localStorage.getItem('user'), {});
const checked = (value) => value ? 'checked' : '';
const selected = (current, value) => current === value ? 'selected' : '';
const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function defaultContract(template = 'residential_reference_v1') {
  const preset = TEMPLATE_OPTIONS[template] || TEMPLATE_OPTIONS.residential_reference_v1;
  const shared = preset.occupancy_type === 'shared_unit';
  const commercial = preset.purpose === 'commercial';
  return {
    template,
    occupancy_type: preset.occupancy_type,
    deposit_mode: 'last_months_credit',
    renewal_notice_month: shared ? 5 : 10,
    iptu_monthly_amount: '',
    inspection_required: true,
    security_system_access: !shared,
    forum: '',
    exclusive_area: shared ? 'Suíte individual, composta por quarto e banheiro de uso exclusivo' : '',
    shared_areas: shared ? 'Cozinha, sala, garagem e área de lazer' : '',
    utilities_included: shared ? ['water', 'electricity', 'iptu', 'internet'] : [],
    daily_rate_enabled: false,
    daily_rate_amount: '',
    visitors_policy: shared ? 'Visitantes e hóspedes somente mediante autorização prévia do locador e respeito às regras de convivência.' : '',
    noise_policy: shared ? 'Festas, aglomerações e ruído excessivo são proibidos; deve ser respeitado o sossego dos demais moradores.' : '',
    pets_policy: shared ? 'Animais somente quando expressamente autorizados pelo locador.' : '',
    smoking_policy: shared ? 'É proibido fumar nas áreas internas; nas áreas externas deve ser preservada a limpeza e o bem-estar dos demais moradores.' : '',
    common_area_policy: shared ? 'Após o uso, as áreas comuns devem ser deixadas limpas, organizadas e em condições de uso.' : '',
    concurrent_tenants_allowed: shared,
    business_use_description: commercial ? 'Atividade comercial informada pelo locatário' : '',
    business_licenses_required: commercial,
    business_licenses_responsibility: commercial ? 'tenant' : '',
  };
}

function normalizeContract(input = {}) {
  const requested = clean(input.template) || 'residential_reference_v1';
  const template = TEMPLATE_OPTIONS[requested] ? requested : 'residential_reference_v1';
  return { ...defaultContract(template), ...input, template, occupancy_type: TEMPLATE_OPTIONS[template].occupancy_type };
}

function profileFromLease(detail) {
  const lease = detail?.lease || {};
  const metadata = lease.metadata || {};
  return {
    tenant_profile: {
      birthdate: metadata?.tenant_profile?.birthdate || '',
      birthplace: metadata?.tenant_profile?.birthplace || '',
      document_type: metadata?.tenant_profile?.document_type || 'CNH',
      document_number: metadata?.tenant_profile?.document_number || '',
      document_issuer: metadata?.tenant_profile?.document_issuer || '',
      parent_1: metadata?.tenant_profile?.parent_1 || '',
      parent_2: metadata?.tenant_profile?.parent_2 || '',
      marital_status: metadata?.tenant_profile?.marital_status || '',
      occupation: metadata?.tenant_profile?.occupation || '',
      address: metadata?.tenant_profile?.address || '',
      city: metadata?.tenant_profile?.city || '',
      state: metadata?.tenant_profile?.state || '',
      postal_code: metadata?.tenant_profile?.postal_code || '',
    },
    contract: normalizeContract(metadata?.contract || {}),
  };
}

function field(label, name, value = '', type = 'text', attrs = '') {
  return `<label>${label}<input data-profile-field="${name}" name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
}
function contractField(label, name, value = '', type = 'text', attrs = '') {
  return `<label>${label}<input data-contract-value="${name}" name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
}

function templateOptions(current) {
  return Object.entries(TEMPLATE_OPTIONS).map(([value, preset]) =>
    `<option value="${value}" ${selected(current, value)}>${preset.label}</option>`
  ).join('');
}

function templateSpecificFields(contract) {
  if (contract.template === 'shared_suite_reference_v1') {
    return `
      <div class="pt-contract-template-specific" data-template-fields="shared">
        <h4>Suíte/unidade privativa e áreas compartilhadas</h4>
        <div class="pt-contract-profile-grid">
          <label class="span-2">Área de uso exclusivo<input data-contract-value="exclusive_area" value="${esc(contract.exclusive_area)}"></label>
          <label class="span-2">Áreas compartilhadas<input data-contract-value="shared_areas" value="${esc(contract.shared_areas)}"></label>
          <label class="pt-contract-check"><input data-contract-check="concurrent_tenants_allowed" type="checkbox" ${checked(contract.concurrent_tenants_allowed)}> Permitir outros locatários no mesmo imóvel</label>
          <label class="pt-contract-check"><input data-contract-check="daily_rate_enabled" type="checkbox" ${checked(contract.daily_rate_enabled)}> Permitir diária alternativa</label>
          ${contractField('Valor da diária (R$)', 'daily_rate_amount', contract.daily_rate_amount, 'number', 'min="0" step="0.01"')}
        </div>
        <h4>Regras de convivência</h4>
        <div class="pt-contract-profile-grid">
          <label class="span-2">Visitantes e hóspedes<input data-contract-value="visitors_policy" value="${esc(contract.visitors_policy)}"></label>
          <label class="span-2">Som, festas e silêncio<input data-contract-value="noise_policy" value="${esc(contract.noise_policy)}"></label>
          <label class="span-2">Animais<input data-contract-value="pets_policy" value="${esc(contract.pets_policy)}"></label>
          <label class="span-2">Fumo<input data-contract-value="smoking_policy" value="${esc(contract.smoking_policy)}"></label>
          <label class="span-2">Limpeza das áreas comuns<input data-contract-value="common_area_policy" value="${esc(contract.common_area_policy)}"></label>
        </div>
        <p class="pt-contract-flow-hint">Água, energia, IPTU e internet podem ser marcados como incluídos na própria locação. O contrato registra automaticamente as despesas incluídas.</p>
      </div>`;
  }
  if (contract.template === 'commercial_reference_v1') {
    return `
      <div class="pt-contract-template-specific" data-template-fields="commercial">
        <h4>Finalidade comercial</h4>
        <div class="pt-contract-profile-grid">
          <label class="span-2">Atividade/uso autorizado<input data-contract-value="business_use_description" value="${esc(contract.business_use_description)}" placeholder="Ex.: loja de móveis, engenharia, restaurante, delivery"></label>
          <label class="pt-contract-check"><input data-contract-check="business_licenses_required" type="checkbox" ${checked(contract.business_licenses_required)}> Exigir licenças e regularização da atividade pelo locatário</label>
        </div>
      </div>`;
  }
  return `<div class="pt-contract-template-specific"><p class="pt-contract-flow-hint">Modelo residencial completo baseado no contrato de referência mais recente, com dados dinâmicos, vistoria, caução e aditivo opcional de segurança.</p></div>`;
}

function collectContractValues(root, fallback = {}) {
  const values = { ...fallback };
  values.template = root.querySelector('[data-template-selector]')?.value || fallback.template || 'residential_reference_v1';
  values.deposit_mode = root.querySelector('[data-contract-field="deposit_mode"]')?.value || fallback.deposit_mode || 'last_months_credit';
  root.querySelectorAll('[data-contract-value]').forEach((input) => {
    const name = input.dataset.contractValue;
    values[name] = input.type === 'number' ? (input.value === '' ? '' : Number(input.value)) : clean(input.value);
  });
  root.querySelectorAll('[data-contract-check]').forEach((input) => { values[input.dataset.contractCheck] = Boolean(input.checked); });
  values.occupancy_type = TEMPLATE_OPTIONS[values.template]?.occupancy_type || 'whole_property';
  return values;
}

function openProfileDialog({ mode = 'draft', detail = latestLeaseDetail } = {}) {
  document.querySelector('.pt-contract-profile-dialog')?.remove();
  const stored = mode === 'edit' ? profileFromLease(detail) : { ...profileFromLease(null), ...draft() };
  const tenant = stored.tenant_profile || {};
  let contract = normalizeContract(stored.contract || {});
  const lease = detail?.lease || {};

  const overlay = document.createElement('div');
  overlay.className = 'pt-contract-profile-dialog';

  const render = () => {
    overlay.innerHTML = `<div class="pt-contract-profile-panel" role="dialog" aria-modal="true" aria-label="Dados completos para o contrato">
      <header><div><span>Contrato inteligente</span><h2>Dados completos do contrato</h2><p>Escolha o modelo de ocupação. Os dados do locador vêm da conta Peter Tecnet; os do inquilino são preenchidos dinamicamente e podem ser conferidos com os documentos enviados.</p></div><button type="button" data-close aria-label="Fechar">×</button></header>
      <div class="pt-contract-profile-scroll">
        <section><h3>Modelo da locação</h3><div class="pt-contract-profile-grid">
          <label class="span-2">Tipo de contrato<select data-template-selector>${templateOptions(contract.template)}</select><small>${esc(TEMPLATE_OPTIONS[contract.template]?.description)}</small></label>
        </div></section>
        <section><h3>Qualificação do inquilino</h3><div class="pt-contract-profile-grid">
          ${field('Data de nascimento', 'birthdate', tenant.birthdate, 'date')}
          ${field('Naturalidade', 'birthplace', tenant.birthplace, 'text', 'placeholder="Ex.: Goiânia/GO"')}
          ${field('Tipo do documento', 'document_type', tenant.document_type, 'text', 'placeholder="RG ou CNH"')}
          ${field('Número do documento', 'document_number', tenant.document_number)}
          ${field('Órgão expedidor', 'document_issuer', tenant.document_issuer, 'text', 'placeholder="Ex.: DETRAN/GO"')}
          ${field('Estado civil', 'marital_status', tenant.marital_status)}
          ${field('Profissão', 'occupation', tenant.occupation)}
          ${field('Filiação 1', 'parent_1', tenant.parent_1)}
          ${field('Filiação 2', 'parent_2', tenant.parent_2)}
        </div></section>
        <section><h3>Endereço atual do inquilino</h3><div class="pt-contract-profile-grid">
          <label class="span-2">Endereço completo<input data-profile-field="address" value="${esc(tenant.address)}" placeholder="Rua, número, complemento e bairro"></label>
          ${field('Cidade', 'city', tenant.city)}
          ${field('UF', 'state', tenant.state, 'text', 'maxlength="2"')}
          ${field('CEP', 'postal_code', tenant.postal_code)}
        </div></section>
        <section><h3>Condições contratuais</h3><div class="pt-contract-profile-grid">
          <label>Tratamento da caução<select data-contract-field="deposit_mode"><option value="last_months_credit" ${selected(contract.deposit_mode, 'last_months_credit')}>Abater nos últimos aluguéis</option><option value="settlement" ${selected(contract.deposit_mode, 'settlement')}>Acerto ao final</option></select></label>
          ${contractField('Manifestar renovação até o mês', 'renewal_notice_month', contract.renewal_notice_month || 10, 'number', 'min="1" max="120"')}
          ${contractField('IPTU mensal separado (R$)', 'iptu_monthly_amount', contract.iptu_monthly_amount, 'number', 'min="0" step="0.01"')}
          ${contractField('Foro', 'forum', contract.forum, 'text', 'placeholder="Ex.: Goiânia/GO"')}
          <label class="pt-contract-check"><input data-contract-check="inspection_required" type="checkbox" ${checked(contract.inspection_required !== false)}> Vistoria inicial/final como referência</label>
          <label class="pt-contract-check"><input data-contract-check="security_system_access" type="checkbox" ${checked(contract.security_system_access)}> Prever aditivo para instalação/manutenção de sistemas de segurança</label>
        </div>
        ${templateSpecificFields(contract)}
        </section>
        ${mode === 'edit' ? `<div class="pt-profile-current"><b>Modelo atual:</b> ${esc(TEMPLATE_OPTIONS[contract.template]?.label)} · ${lease.tenant_name || 'inquilino'} · versão ${lease.contract_version || 1}. Ao gerar novamente, o pacote recebe nova versão conjunta.</div>` : ''}
      </div>
      <footer><button type="button" class="pt-button secondary" data-close>Cancelar</button><button type="button" class="pt-button primary" data-save>${mode === 'edit' ? 'Salvar dados do contrato' : 'Usar estes dados'}</button></footer>
    </div>`;

    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', close));
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); }, { once: true });

    overlay.querySelector('[data-template-selector]')?.addEventListener('change', (event) => {
      const tenantSnapshot = {};
      overlay.querySelectorAll('[data-profile-field]').forEach((input) => { tenantSnapshot[input.dataset.profileField] = clean(input.value); });
      Object.assign(tenant, tenantSnapshot);
      const currentValues = collectContractValues(overlay, contract);
      const defaults = defaultContract(event.target.value);
      contract = normalizeContract({ ...defaults, ...currentValues, template: event.target.value, occupancy_type: defaults.occupancy_type });
      render();
    });

    overlay.querySelector('[data-save]')?.addEventListener('click', async (event) => {
      const tenantProfile = {};
      overlay.querySelectorAll('[data-profile-field]').forEach((input) => { tenantProfile[input.dataset.profileField] = clean(input.value); });
      contract = normalizeContract(collectContractValues(overlay, contract));
      const payload = { tenant_profile: tenantProfile, contract };

      if (mode === 'edit' && detail?.lease?.id) {
        const button = event.currentTarget; button.disabled = true; button.textContent = 'Salvando…';
        try {
          const user = currentUser();
          const isLandlord = Number(user?.id || 0) === Number(detail.lease.landlord_user_id || 0);
          if (isLandlord) {
            const current = detail.lease.metadata || {};
            await appApi.patch(`/leases/${detail.lease.id}`, { metadata: { ...current, ...payload } });
          } else {
            await appApi.patch(`/leases/${detail.lease.id}/tenant/profile`, { tenant_profile: payload.tenant_profile });
          }
          close();
          window.location.reload();
        } catch (error) {
          button.disabled = false; button.textContent = 'Salvar dados do contrato';
          alert(error?.response?.data?.message || 'Não foi possível salvar os dados do contrato.');
        }
      } else {
        saveDraft(payload);
        const trigger = document.querySelector('[data-contract-profile-trigger="new"]');
        if (trigger) { trigger.dataset.completed = 'true'; trigger.innerHTML = `✓ ${TEMPLATE_OPTIONS[contract.template]?.label || 'Dados do contrato'}`; }
        close();
      }
    });
  };

  document.body.appendChild(overlay);
  render();
}

function enhanceInvitationEntry() {
  if (inviteProcessed) return;
  const params = new URLSearchParams(window.location.search);
  const invite = params.get('invite');
  const email = params.get('email');
  if (!invite || !email) return;
  const card = document.querySelector('.auth-card');
  if (!card) return;

  const emailInput = card.querySelector('input[type="email"]');
  if (!emailInput) {
    const registerButton = [...card.querySelectorAll('button')].find((button) => button.textContent?.includes('Ainda não tenho conta'));
    registerButton?.click();
    return;
  }

  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  nativeSetter?.call(emailInput, email);
  emailInput.dispatchEvent(new Event('input', { bubbles: true }));
  emailInput.dispatchEvent(new Event('change', { bubbles: true }));
  emailInput.readOnly = true;

  if (!card.querySelector('[data-invite-message]')) {
    const message = document.createElement('div');
    message.dataset.inviteMessage = 'true';
    message.className = 'inline-alert';
    message.textContent = 'Você foi convidado para uma locação. Crie sua conta com este e-mail para enviar seus documentos, revisar o contrato, assinar e acompanhar os pagamentos.';
    card.insertBefore(message, card.querySelector('button.pt-button'));
  }
  inviteProcessed = true;
}

function enhanceNewLeaseModal() {
  const modal = [...document.querySelectorAll('.pt-form')].find((form) => form.textContent?.includes('Imóvel e finalidade') && form.textContent?.includes('Inquilino'));
  if (!modal || modal.querySelector('[data-contract-profile-trigger="new"]')) return;
  const tenantSection = [...modal.querySelectorAll('.pt-form-section')].find((section) => section.textContent?.includes('Inquilino'));
  if (!tenantSection) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pt-contract-profile-trigger';
  button.dataset.contractProfileTrigger = 'new';
  const saved = draft();
  if (Object.keys(saved?.tenant_profile || {}).some((key) => saved.tenant_profile[key])) {
    button.dataset.completed = 'true';
    button.innerHTML = `✓ ${TEMPLATE_OPTIONS[saved?.contract?.template]?.label || 'Dados completos do inquilino'}`;
  } else {
    button.innerHTML = '+ Escolher modelo e completar contrato';
  }
  button.addEventListener('click', () => openProfileDialog({ mode: 'draft' }));
  tenantSection.appendChild(button);

  if (!tenantSection.querySelector('[data-invite-hint]')) {
    const hint = document.createElement('small');
    hint.dataset.inviteHint = 'true';
    hint.className = 'pt-contract-flow-hint';
    hint.textContent = 'Escolha residencial, comercial ou suíte compartilhada. Ao criar a locação, a Locaio enviará automaticamente um convite ao e-mail informado.';
    tenantSection.appendChild(hint);
  }
}

function enhanceLeaseDetail() {
  const hero = document.querySelector('.pt-contract-hero');
  if (!hero || !latestLeaseDetail?.lease?.id) return;
  if (!hero.querySelector('[data-contract-profile-trigger="edit"]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pt-button secondary pt-contract-edit-profile';
    button.dataset.contractProfileTrigger = 'edit';
    button.textContent = 'Editar dados do contrato';
    button.addEventListener('click', () => openProfileDialog({ mode: 'edit', detail: latestLeaseDetail }));
    hero.lastElementChild?.appendChild(button);
  }

  const packageInfo = latestLeaseDetail?.lease?.metadata?.contract_package;
  if (packageInfo?.document_count && !hero.querySelector('[data-package-info]')) {
    const badge = document.createElement('div');
    badge.dataset.packageInfo = 'true';
    badge.className = 'pt-contract-package-info';
    const template = normalizeContract(latestLeaseDetail?.lease?.metadata?.contract || {}).template;
    badge.innerHTML = `<b>${esc(TEMPLATE_OPTIONS[template]?.label || 'Pacote contratual')}</b><span>${packageInfo.document_count} documento(s) · versão ${packageInfo.version || latestLeaseDetail.lease.contract_version || 1}</span>`;
    hero.appendChild(badge);
  }

  const user = currentUser();
  const isLandlord = Number(user?.id || 0) === Number(latestLeaseDetail.lease.landlord_user_id || 0);
  if (isLandlord && !hero.querySelector('[data-workflow-actions]')) {
    const actions = document.createElement('div');
    actions.dataset.workflowActions = 'true';
    actions.className = 'pt-contract-workflow-actions';

    const invite = document.createElement('button');
    invite.type = 'button'; invite.className = 'pt-button secondary'; invite.textContent = 'Reenviar convite ao inquilino';
    invite.addEventListener('click', async () => {
      invite.disabled = true; const previous = invite.textContent; invite.textContent = 'Enviando…';
      try { await appApi.post(`/leases/${latestLeaseDetail.lease.id}/tenant/invite`, { registration_url: window.location.origin }); invite.textContent = 'Convite enviado'; }
      catch (error) { invite.textContent = previous; alert(error?.response?.data?.message || 'Não foi possível enviar o convite.'); }
      finally { invite.disabled = false; }
    });
    actions.appendChild(invite);

    if (latestLeaseDetail.lease.status === 'active') {
      const payment = document.createElement('button');
      payment.type = 'button'; payment.className = 'pt-button primary'; payment.textContent = 'Solicitar valores acordados';
      payment.addEventListener('click', async () => {
        payment.disabled = true; const previous = payment.textContent; payment.textContent = 'Preparando cobrança…';
        try {
          await appApi.post(`/leases/${latestLeaseDetail.lease.id}/payments/request`, { registration_url: window.location.origin, collect_deposit: true, collect_first_rent: true });
          payment.textContent = 'Cobrança enviada';
          setTimeout(() => window.location.reload(), 600);
        } catch (error) {
          payment.textContent = previous; alert(error?.response?.data?.message || 'Não foi possível solicitar o pagamento.');
        } finally { payment.disabled = false; }
      });
      actions.appendChild(payment);
    }
    hero.lastElementChild?.appendChild(actions);
  }
}

function enhanceDocumentCategory() {
  const documentsCard = [...document.querySelectorAll('.pt-card')].find((card) => card.querySelector('h2')?.textContent === 'Documentos');
  if (!documentsCard || documentsCard.querySelector('[data-document-category]')) return;
  const header = documentsCard.querySelector('header');
  const uploadLabel = header?.querySelector('label.pt-button');
  if (!header || !uploadLabel) return;
  const select = document.createElement('select');
  select.dataset.documentCategory = 'identity';
  select.className = 'pt-document-category';
  Object.entries(expenseLabels).forEach(([value, label]) => {
    const option = document.createElement('option'); option.value = value; option.textContent = label; select.appendChild(option);
  });
  uploadLabel.parentElement?.insertBefore(select, uploadLabel);
}

export function installContractProfileEnhancements() {
  if (installed) return;
  installed = true;

  api.interceptors.request.use((config) => {
    const url = String(config.url || '');
    const method = String(config.method || '').toLowerCase();
    if (method === 'post' && /\/v1\/apps\/[^/]+\/leases$/.test(url) && config.data && !(config.data instanceof FormData)) {
      const extra = draft();
      config.data = { ...config.data, metadata: { ...(config.data.metadata || {}), ...extra } };
      const template = extra?.contract?.template;
      const preset = TEMPLATE_OPTIONS[template];
      if (preset?.purpose && !config.data.purpose) config.data.purpose = preset.purpose;
    }
    if (method === 'post' && /\/leases\/\d+\/documents$/.test(url) && config.data instanceof FormData) {
      const category = document.querySelector('[data-document-category]')?.value;
      if (category) config.data.set('category', category);
    }
    return config;
  });

  api.interceptors.response.use(async (response) => {
    const url = String(response?.config?.url || '');
    const method = String(response?.config?.method || '').toLowerCase();
    if (method === 'get' && /\/v1\/apps\/[^/]+\/leases\/\d+$/.test(url) && response?.data?.lease) latestLeaseDetail = response.data;
    if (method === 'post' && /\/v1\/apps\/[^/]+\/leases$/.test(url)) {
      sessionStorage.removeItem(DRAFT_KEY);
      const leaseId = response?.data?.lease?.id || response?.data?.id;
      if (leaseId) {
        try {
          await appApi.post(`/leases/${leaseId}/tenant/invite`, { registration_url: window.location.origin });
          response.data.tenant_invitation_sent = true;
        } catch (error) {
          response.data.tenant_invitation_error = error?.response?.data?.message || 'Não foi possível enviar o convite ao inquilino.';
        }
      }
    }
    queueMicrotask(() => { enhanceInvitationEntry(); enhanceLeaseDetail(); enhanceDocumentCategory(); });
    return response;
  });

  const observer = new MutationObserver(() => {
    enhanceInvitationEntry();
    enhanceNewLeaseModal();
    enhanceLeaseDetail();
    enhanceDocumentCategory();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  enhanceInvitationEntry(); enhanceNewLeaseModal(); enhanceLeaseDetail(); enhanceDocumentCategory();
}
