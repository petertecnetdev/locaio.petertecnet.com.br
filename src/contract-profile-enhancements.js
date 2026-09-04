import api, { appApi } from './services/api.js';

const DRAFT_KEY = 'locaio:contract-profile:draft';
const expenseLabels = { identity: 'Documento de identidade', address: 'Comprovante de endereço', income: 'Comprovante de renda', other: 'Outro documento' };
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
    contract: {
      template: metadata?.contract?.template || 'residential_reference_v1',
      deposit_mode: metadata?.contract?.deposit_mode || 'last_months_credit',
      renewal_notice_month: metadata?.contract?.renewal_notice_month || 10,
      iptu_monthly_amount: metadata?.contract?.iptu_monthly_amount || '',
      inspection_required: metadata?.contract?.inspection_required !== false,
      security_system_access: metadata?.contract?.security_system_access === true,
      forum: metadata?.contract?.forum || '',
    },
  };
}

function field(label, name, value = '', type = 'text', attrs = '') {
  return `<label>${label}<input data-profile-field="${name}" name="${name}" type="${type}" value="${String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;')}" ${attrs}></label>`;
}

function openProfileDialog({ mode = 'draft', detail = latestLeaseDetail } = {}) {
  document.querySelector('.pt-contract-profile-dialog')?.remove();
  const values = mode === 'edit' ? profileFromLease(detail) : { ...profileFromLease(null), ...draft() };
  const tenant = values.tenant_profile || {};
  const contract = values.contract || {};
  const lease = detail?.lease || {};

  const overlay = document.createElement('div');
  overlay.className = 'pt-contract-profile-dialog';
  overlay.innerHTML = `<div class="pt-contract-profile-panel" role="dialog" aria-modal="true" aria-label="Dados completos para o contrato">
    <header><div><span>Contrato inteligente</span><h2>Dados completos do contrato</h2><p>Os dados do locador vêm da conta Peter Tecnet. Os dados do inquilino podem ser preenchidos pelo próprio inquilino e conferidos com os documentos enviados.</p></div><button type="button" data-close aria-label="Fechar">×</button></header>
    <div class="pt-contract-profile-scroll">
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
        <label class="span-2">Endereço completo<input data-profile-field="address" value="${String(tenant.address || '').replaceAll('"', '&quot;')}" placeholder="Rua, número, complemento e bairro"></label>
        ${field('Cidade', 'city', tenant.city)}
        ${field('UF', 'state', tenant.state, 'text', 'maxlength="2"')}
        ${field('CEP', 'postal_code', tenant.postal_code)}
      </div></section>
      <section><h3>Regras do modelo-base</h3><div class="pt-contract-profile-grid">
        <label>Tratamento da caução<select data-contract-field="deposit_mode"><option value="last_months_credit" ${contract.deposit_mode === 'last_months_credit' ? 'selected' : ''}>Abater nos últimos aluguéis</option><option value="settlement" ${contract.deposit_mode === 'settlement' ? 'selected' : ''}>Acerto ao final</option></select></label>
        ${field('Manifestar renovação até o mês', 'renewal_notice_month', contract.renewal_notice_month || 10, 'number', 'min="1" max="120" data-contract-input')}
        ${field('IPTU mensal separado (R$)', 'iptu_monthly_amount', contract.iptu_monthly_amount, 'number', 'min="0" step="0.01" data-contract-input')}
        ${field('Foro', 'forum', contract.forum, 'text', 'placeholder="Ex.: Goiânia/GO" data-contract-input')}
        <label class="pt-contract-check"><input data-contract-check="inspection_required" type="checkbox" ${contract.inspection_required !== false ? 'checked' : ''}> Vistoria inicial/final como referência</label>
        <label class="pt-contract-check"><input data-contract-check="security_system_access" type="checkbox" ${contract.security_system_access ? 'checked' : ''}> Prever acesso para manutenção de sistemas de segurança</label>
      </div></section>
      ${mode === 'edit' ? `<div class="pt-profile-current"><b>Pacote atual:</b> ${lease.tenant_name || 'inquilino'} · versão ${lease.contract_version || 1}. Ao gerar novamente, os 3 documentos recebem uma nova versão conjunta.</div>` : ''}
    </div>
    <footer><button type="button" class="pt-button secondary" data-close>Cancelar</button><button type="button" class="pt-button primary" data-save>${mode === 'edit' ? 'Salvar dados do contrato' : 'Usar estes dados'}</button></footer>
  </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', close));
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  overlay.querySelector('[data-save]')?.addEventListener('click', async (event) => {
    const tenantProfile = {};
    overlay.querySelectorAll('[data-profile-field]').forEach((input) => { tenantProfile[input.dataset.profileField] = clean(input.value); });
    const renewalInput = overlay.querySelector('[name="renewal_notice_month"]');
    const iptuInput = overlay.querySelector('[name="iptu_monthly_amount"]');
    const forumInput = overlay.querySelector('[name="forum"]');
    const payload = {
      tenant_profile: tenantProfile,
      contract: {
        template: 'residential_reference_v1',
        deposit_mode: overlay.querySelector('[data-contract-field="deposit_mode"]')?.value || 'last_months_credit',
        renewal_notice_month: Number(renewalInput?.value || 10),
        iptu_monthly_amount: Number(iptuInput?.value || 0),
        inspection_required: Boolean(overlay.querySelector('[data-contract-check="inspection_required"]')?.checked),
        security_system_access: Boolean(overlay.querySelector('[data-contract-check="security_system_access"]')?.checked),
        forum: clean(forumInput?.value),
      },
    };

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
      if (trigger) { trigger.dataset.completed = 'true'; trigger.innerHTML = '✓ Dados completos do inquilino'; }
      close();
    }
  });
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
  if (Object.keys(draft()?.tenant_profile || {}).some((key) => draft().tenant_profile[key])) {
    button.dataset.completed = 'true'; button.innerHTML = '✓ Dados completos do inquilino';
  } else {
    button.innerHTML = '+ Completar dados do inquilino';
  }
  button.addEventListener('click', () => openProfileDialog({ mode: 'draft' }));
  tenantSection.appendChild(button);

  if (!tenantSection.querySelector('[data-invite-hint]')) {
    const hint = document.createElement('small');
    hint.dataset.inviteHint = 'true';
    hint.className = 'pt-contract-flow-hint';
    hint.textContent = 'Ao criar a locação, a Locaio enviará automaticamente um convite para o e-mail informado.';
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
  if (packageInfo?.document_count === 3 && !hero.querySelector('[data-package-info]')) {
    const badge = document.createElement('div');
    badge.dataset.packageInfo = 'true';
    badge.className = 'pt-contract-package-info';
    badge.innerHTML = `<b>Pacote contratual</b><span>3 documentos · versão ${packageInfo.version || latestLeaseDetail.lease.contract_version || 1}</span>`;
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
