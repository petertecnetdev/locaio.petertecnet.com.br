import api, { appApi } from './services/api.js';

let installed = false;
let latestDetail = null;
let latestReadiness = null;
let inviteAttempted = false;
let readinessLoading = false;

const parse = (value, fallback = {}) => { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } };
const user = () => parse(localStorage.getItem('user'), {});
const esc = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const stageLabels = {
  draft: 'Rascunho', awaiting_tenant_registration: 'Cadastro do inquilino', awaiting_documents: 'Documentos',
  documents_under_review: 'Conferência dos dados', ready_for_contract: 'Pronto para contrato',
  awaiting_landlord_signature: 'Assinatura do locador', awaiting_tenant_signature: 'Assinatura do inquilino',
  awaiting_signature: 'Assinaturas', awaiting_initial_payment: 'Pagamento inicial', ready_to_activate: 'Pronto para ativar', active: 'Locação ativa',
};

async function acceptInvitationFromUrl() {
  if (inviteAttempted || !localStorage.getItem('token')) return;
  const params = new URLSearchParams(window.location.search);
  const leaseId = params.get('lease');
  const invite = params.get('invite');
  if (!leaseId || !invite) return;
  inviteAttempted = true;
  try {
    await appApi.post(`/leases/${leaseId}/tenant/invite/accept`, { token: invite });
    params.delete('invite'); params.delete('email'); params.delete('lease');
    const suffix = params.toString();
    history.replaceState({}, '', `${window.location.pathname}${suffix ? `?${suffix}` : ''}`);
    window.dispatchEvent(new CustomEvent('locaio-invitation-accepted', { detail: { leaseId: Number(leaseId) } }));
    window.location.reload();
  } catch (error) {
    const message = error?.response?.data?.message;
    if (message && !document.querySelector('[data-invite-error]')) {
      const el = document.createElement('div'); el.dataset.inviteError = 'true'; el.className = 'pt-onboarding-banner error'; el.textContent = message; document.body.prepend(el);
    }
  }
}

function currentRole(detail) {
  const current = user();
  return Number(current?.id || 0) === Number(detail?.lease?.landlord_user_id || 0) ? 'landlord' : 'tenant';
}

async function loadReadiness() {
  const id = latestDetail?.lease?.id;
  if (!id || readinessLoading) return;
  readinessLoading = true;
  try { latestReadiness = (await appApi.get(`/leases/${id}/readiness`)).data; }
  catch { latestReadiness = null; }
  finally { readinessLoading = false; queueMicrotask(enhanceDetail); }
}

function signaturesComplete(detail) {
  const signatures = detail?.signatures || [];
  const parties = new Set(signatures.filter((s) => Number(s.contract_version) === Number(detail?.lease?.contract_version)).map((s) => s.party));
  return parties.has('landlord') && parties.has('tenant');
}

function renderPipeline(detail) {
  const stage = detail?.lease?.metadata?.workflow?.stage || detail?.lease?.status || 'draft';
  const stages = ['awaiting_tenant_registration','awaiting_documents','documents_under_review','ready_for_contract','awaiting_signature','awaiting_initial_payment','active'];
  const aliases = { awaiting_landlord_signature: 'awaiting_signature', awaiting_tenant_signature: 'awaiting_signature', ready_to_activate: 'awaiting_initial_payment' };
  const normalized = aliases[stage] || stage;
  const currentIndex = Math.max(0, stages.indexOf(normalized));
  return `<div class="pt-onboarding-pipeline">${stages.map((key, index) => `<div class="${index < currentIndex ? 'done' : index === currentIndex ? 'current' : ''}"><span>${index < currentIndex ? '✓' : index + 1}</span><small>${esc(stageLabels[key])}</small></div>`).join('')}</div>`;
}

function buildChecklist(readiness) {
  if (!readiness) return '<p>Carregando conferência…</p>';
  return `<div class="pt-readiness-list">${readiness.items.map((item) => `<div class="${item.complete ? 'ok' : 'missing'}"><span>${item.complete ? '✓' : '!'}</span><b>${esc(item.label)}</b></div>`).join('')}</div>`;
}

function openAgreementDialog(detail) {
  document.querySelector('.pt-onboarding-dialog')?.remove();
  const agreement = detail?.lease?.metadata?.workflow?.initial_payment || {};
  const overlay = document.createElement('div'); overlay.className = 'pt-onboarding-dialog';
  overlay.innerHTML = `<form class="pt-onboarding-panel"><header><div><small>Condições financeiras</small><h2>Valores iniciais da locação</h2><p>Estas regras alimentam o contrato e as cobranças. O sistema não presumirá valores diferentes do que estiver salvo aqui.</p></div><button type="button" data-close>×</button></header><section>
    <label class="pt-check-row"><input type="checkbox" name="deposit" ${agreement.collect_deposit !== false ? 'checked' : ''}> Cobrar caução acordada (${esc(detail.lease.deposit_amount || 0)})</label>
    <label class="pt-check-row"><input type="checkbox" name="firstRent" ${agreement.collect_first_rent !== false ? 'checked' : ''}> Cobrar primeiro aluguel (${esc(detail.lease.rent_amount || 0)})</label>
    <div class="pt-additional-charge"><h3>Valor adicional opcional</h3><div><input name="description" placeholder="Ex.: taxa de chave / ajuste inicial"><input name="amount" type="number" step="0.01" min="0" placeholder="R$"></div></div>
  </section><footer><button type="button" class="pt-button secondary" data-close>Cancelar</button><button class="pt-button primary">Salvar acordo</button></footer></form>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove(); overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  overlay.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault(); const button = overlay.querySelector('button.pt-button.primary'); button.disabled = true; button.textContent = 'Salvando…';
    const description = overlay.querySelector('[name="description"]').value.trim(); const amount = Number(overlay.querySelector('[name="amount"]').value || 0);
    try {
      await appApi.put(`/leases/${detail.lease.id}/initial-payment-agreement`, {
        collect_deposit: overlay.querySelector('[name="deposit"]').checked,
        collect_first_rent: overlay.querySelector('[name="firstRent"]').checked,
        additional_charges: description && amount > 0 ? [{ description, amount }] : [],
      });
      close(); window.location.reload();
    } catch (error) { button.disabled = false; button.textContent = 'Salvar acordo'; alert(error?.response?.data?.message || 'Não foi possível salvar o acordo.'); }
  });
}

function openExtractionDialog(leaseId, documentId, extraction) {
  document.querySelector('.pt-onboarding-dialog')?.remove();
  const values = extraction?.data || {};
  const fields = [
    ['full_name','Nome completo'],['tax_id','CPF/CNPJ'],['birthdate','Nascimento'],['birthplace','Naturalidade'],
    ['document_type','Tipo de documento'],['document_number','Número'],['document_issuer','Órgão expedidor'],
    ['marital_status','Estado civil'],['occupation','Profissão'],['address','Endereço'],['city','Cidade'],['state','UF'],['postal_code','CEP'],
  ];
  const overlay = document.createElement('div'); overlay.className = 'pt-onboarding-dialog';
  overlay.innerHTML = `<form class="pt-onboarding-panel wide"><header><div><small>Extração automática</small><h2>Confirme os dados do documento</h2><p>A IA apenas sugere os dados. Revise e corrija antes de confirmar; nada é aplicado ao contrato sem este aceite.</p></div><button type="button" data-close>×</button></header><section><div class="pt-extraction-grid">${fields.map(([key,label]) => `<label>${label}<input name="${key}" value="${esc(values[key] || '')}"></label>`).join('')}</div>${values.warnings?.length ? `<div class="pt-extraction-warning">${values.warnings.map((w) => `<div>• ${esc(w)}</div>`).join('')}</div>` : ''}<small>Confiança informada pela extração: ${Math.round(Number(values.confidence || 0) * 100)}%</small></section><footer><button type="button" class="pt-button secondary" data-close>Revisar depois</button><button class="pt-button primary">Confirmar dados</button></footer></form>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove(); overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  overlay.querySelector('form').addEventListener('submit', async (event) => {
    event.preventDefault(); const data = {}; fields.forEach(([key]) => { const value = overlay.querySelector(`[name="${key}"]`).value.trim(); if (value) data[key] = value; });
    const button = overlay.querySelector('button.pt-button.primary'); button.disabled = true; button.textContent = 'Confirmando…';
    try { await appApi.post(`/leases/${leaseId}/documents/${documentId}/confirm-extraction`, { accepted: true, data }); close(); window.location.reload(); }
    catch (error) { button.disabled = false; button.textContent = 'Confirmar dados'; alert(error?.response?.data?.message || 'Não foi possível confirmar os dados.'); }
  });
}

async function extractUploadedDocument(response) {
  const url = String(response?.config?.url || '');
  const match = url.match(/\/leases\/(\d+)\/documents$/);
  const document = response?.data;
  if (!match || !document?.id || !['identity','address','income'].includes(document.category)) return;
  try {
    const extraction = (await appApi.post(`/leases/${match[1]}/documents/${document.id}/extract`)).data;
    openExtractionDialog(Number(match[1]), document.id, extraction);
  } catch (error) {
    const message = error?.response?.data?.message;
    if (message && !message.includes('OPENAI_API_KEY')) alert(message);
  }
}

function enhanceDetail() {
  const detail = latestDetail; const lease = detail?.lease; if (!lease) return;
  const hero = document.querySelector('.pt-contract-hero'); const root = hero?.parentElement || document.querySelector('.pt-page'); if (!root) return;
  document.querySelectorAll('[data-workflow-actions] button').forEach((button) => { if (button.textContent?.includes('Solicitar valores acordados') && lease.status === 'active') button.remove(); });

  let card = root.querySelector('[data-onboarding-center]');
  if (!card) { card = document.createElement('article'); card.className = 'pt-card pt-onboarding-center'; card.dataset.onboardingCenter = 'true'; hero?.insertAdjacentElement('afterend', card); }
  const role = currentRole(detail); const stage = lease.metadata?.workflow?.stage || lease.status;
  card.innerHTML = `<header><div><span class="pt-eyebrow">Fechamento digital</span><h2>${role === 'tenant' ? 'Sua jornada de locação' : 'Processo da locação'}</h2><p>${esc(stageLabels[stage] || stage || 'Em andamento')}</p></div></header>${renderPipeline(detail)}<div class="pt-onboarding-grid"><section><h3>Checklist obrigatório</h3>${buildChecklist(latestReadiness)}</section><section><h3>Próxima ação</h3><div class="pt-onboarding-actions" data-smart-actions></div></section></div>`;
  const actions = card.querySelector('[data-smart-actions]');

  if (role === 'landlord') {
    const agreement = document.createElement('button'); agreement.className = 'pt-button secondary'; agreement.textContent = 'Configurar valores iniciais'; agreement.onclick = () => openAgreementDialog(detail); actions.appendChild(agreement);
    if (signaturesComplete(detail)) {
      const pay = document.createElement('button'); pay.className = 'pt-button primary'; pay.textContent = 'Solicitar valores acordados'; pay.onclick = async () => { pay.disabled = true; try { await appApi.post(`/leases/${lease.id}/payments/request`, { registration_url: window.location.origin }); window.location.reload(); } catch (e) { pay.disabled = false; alert(e?.response?.data?.message || 'Não foi possível gerar as cobranças.'); } }; actions.appendChild(pay);
    }
    if (['awaiting_initial_payment','ready_to_activate'].includes(stage) || signaturesComplete(detail)) {
      const activate = document.createElement('button'); activate.className = 'pt-button secondary'; activate.textContent = 'Verificar e ativar locação'; activate.onclick = async () => { activate.disabled = true; try { await appApi.post(`/leases/${lease.id}/activate`); window.location.reload(); } catch (e) { activate.disabled = false; alert(e?.response?.data?.message || 'A locação ainda não está pronta para ativação.'); } }; actions.appendChild(activate);
    }
  } else {
    const profile = document.createElement('button'); profile.className = 'pt-button secondary'; profile.textContent = 'Revisar meus dados'; profile.onclick = () => document.querySelector('[data-contract-profile-trigger="edit"]')?.click(); actions.appendChild(profile);
  }
}

export function installLeaseOnboardingEnhancements() {
  if (installed) return; installed = true;
  api.interceptors.response.use((response) => {
    const url = String(response?.config?.url || ''); const method = String(response?.config?.method || '').toLowerCase();
    if (method === 'get' && /\/v1\/apps\/[^/]+\/leases\/\d+$/.test(url) && response?.data?.lease) { latestDetail = response.data; latestReadiness = null; queueMicrotask(loadReadiness); }
    if (method === 'post' && /\/leases\/\d+\/documents$/.test(url)) queueMicrotask(() => extractUploadedDocument(response));
    queueMicrotask(() => { acceptInvitationFromUrl(); enhanceDetail(); });
    return response;
  });
  const observer = new MutationObserver(() => { acceptInvitationFromUrl(); enhanceDetail(); }); observer.observe(document.body, { childList: true, subtree: true });
  acceptInvitationFromUrl();
}
