const STORAGE = {
  theme: 'peter.ui.theme',
  leaseDensity: 'peter.ui.leasing.density',
};

const moneyFormat = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function parseMoney(value = '') {
  const cleaned = String(value).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function initials(value = '') {
  return String(value).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'IM';
}

function statValue(page, label) {
  const wanted = normalize(label);
  const stat = [...page.querySelectorAll('.stat')].find((item) => normalize(item.querySelector('small')?.textContent).includes(wanted));
  return stat?.querySelector('strong')?.textContent?.trim() || '';
}

function svgIcon(name) {
  const paths = {
    sun: 'M12 4V2h1v2h-1Zm0 18v-2h1v2h-1ZM4.93 5.64 3.5 4.22l.72-.72 1.42 1.43-.71.71Zm14.14 14.14-1.42-1.43.7-.7 1.43 1.42-.71.71ZM4 12H2v1h2v-1Zm18 0h-2v1h2v-1ZM4.93 19.36l-1.43 1.42-.71-.71 1.42-1.43.72.72ZM19.78 4.93l-1.43 1.42-.7-.71 1.42-1.42.71.71ZM12.5 7a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm0 1.2a4.3 4.3 0 1 1 0 8.6 4.3 4.3 0 0 1 0-8.6Z',
    moon: 'M18.7 16.7A7.5 7.5 0 0 1 9.3 7.3a6.5 6.5 0 1 0 9.4 9.4ZM8.6 5.4a9 9 0 1 0 10 12.9l.8-1.6-1.7.7A6 6 0 0 1 10.6 7l.7-1.7-1.7.1Z',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
}

function currentTheme() {
  return localStorage.getItem(STORAGE.theme) || 'light';
}

function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(STORAGE.theme, next);
  document.querySelectorAll('.theme-trigger,.mobile-theme-trigger').forEach((button) => {
    const dark = next === 'dark';
    button.innerHTML = dark ? svgIcon('sun') : svgIcon('moon');
    button.title = dark ? 'Usar tema claro' : 'Usar tema escuro';
    button.setAttribute('aria-label', button.title);
  });
}

function toggleTheme() {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}

function ensureThemeControls() {
  const toolbar = document.querySelector('.nav-toolbar');
  if (toolbar && !toolbar.querySelector('.theme-trigger')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-tool icon-only theme-trigger';
    button.addEventListener('click', toggleTheme);
    toolbar.appendChild(button);
  }

  const mobileTop = document.querySelector('.mobile-top');
  if (mobileTop && !mobileTop.querySelector('.mobile-theme-trigger')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mobile-theme-trigger';
    button.addEventListener('click', toggleTheme);
    const logout = mobileTop.querySelector('button');
    if (logout) mobileTop.insertBefore(button, logout); else mobileTop.appendChild(button);
  }
  applyTheme(currentTheme());
}

function decorateDashboard(page) {
  if (!page || page.dataset.premiumDashboard) return;
  page.dataset.premiumDashboard = 'true';
  page.classList.add('dashboard-page');

  const stats = page.querySelector('.stats');
  const grid = page.querySelector('.grid-2');
  if (!stats || !grid) return;

  const properties = Number(statValue(page, 'Imóveis').replace(/\D/g, '')) || 0;
  const activeLeases = Number(statValue(page, 'Contratos ativos').replace(/\D/g, '')) || 0;
  const pending = parseMoney(statValue(page, 'A receber'));
  const overdue = parseMoney(statValue(page, 'Em atraso'));
  const receivableBase = Math.max(0, pending + overdue);
  const overdueShare = receivableBase > 0 ? Math.min(100, (overdue / receivableBase) * 100) : 0;
  const financialHealth = Math.max(0, Math.round(100 - overdueShare));
  const pendingShare = receivableBase > 0 ? Math.max(4, Math.round((pending / receivableBase) * 100)) : 0;

  const chargeRows = [...grid.querySelectorAll('.card:first-child .list-row')].slice(0, 5).map((row) => ({
    title: row.querySelector('b')?.textContent?.trim() || 'Cobrança',
    amountText: row.querySelector('strong')?.textContent?.trim() || '',
    amount: parseMoney(row.querySelector('strong')?.textContent),
  })).filter((item) => item.amount > 0);
  const maxCharge = Math.max(1, ...chargeRows.map((item) => item.amount));

  const pulse = document.createElement('section');
  pulse.className = 'financial-pulse';
  pulse.innerHTML = `
    <article class="financial-card">
      <header><div><small>VISÃO FINANCEIRA</small><h2>Pulso dos recebimentos</h2></div><span>Dados atuais</span></header>
      <div class="receivable-row"><label>A receber</label><strong>${esc(moneyFormat.format(pending))}</strong><div class="receivable-track"><i style="width:${pendingShare}%"></i></div></div>
      <div class="receivable-row danger"><label>Em atraso</label><strong>${esc(moneyFormat.format(overdue))}</strong><div class="receivable-track"><i style="width:${Math.max(overdue > 0 ? 4 : 0, Math.round(overdueShare))}%"></i></div></div>
      ${chargeRows.length ? `<div class="mini-charge-bars">${chargeRows.map((item) => `<div class="mini-charge-row"><span>${esc(item.title)}</span><i style="--bar:${Math.max(8, Math.round((item.amount / maxCharge) * 100))}%"></i><b>${esc(item.amountText)}</b></div>`).join('')}</div>` : ''}
      <p class="financial-note">O gráfico usa somente os valores atuais retornados pela gestão de locações; não projeta histórico inexistente.</p>
    </article>
    <article class="financial-card">
      <header><div><small>SAÚDE DA CARTEIRA</small><h2>Leitura rápida</h2></div><span>${properties} imóvel(is)</span></header>
      <div class="portfolio-health">
        <div class="health-ring" style="--value:${financialHealth}"><div><strong>${financialHealth}%</strong><small>sem atraso</small></div></div>
        <div class="health-copy"><h3>${overdue > 0 ? 'Há valores que pedem atenção' : 'Recebimentos sob controle'}</h3><p>${activeLeases} contrato(s) ativo(s) e ${properties} imóvel(is) acompanhados neste painel.</p><span class="health-chip">${overdue > 0 ? 'Revisar pendências' : 'Carteira saudável'}</span></div>
      </div>
    </article>`;
  stats.after(pulse);
}

function decorateProperties(page) {
  if (!page) return;
  page.classList.add('properties-page');
  [...page.querySelectorAll('.property-card')].forEach((card) => {
    if (card.dataset.premiumProperty) return;
    card.dataset.premiumProperty = 'true';
    const name = card.querySelector('h3')?.textContent?.trim() || 'Imóvel';
    const visual = card.querySelector('.property-visual');
    if (visual) {
      visual.dataset.initials = initials(name);
      const cover = card.dataset.coverUrl || visual.dataset.coverUrl || '';
      if (cover) {
        card.dataset.cover = 'image';
        visual.style.backgroundImage = `linear-gradient(180deg,rgba(4,22,28,.03),rgba(4,22,28,.28)),url("${cover.replace(/"/g, '%22')}")`;
      } else card.dataset.cover = 'fallback';
    }
    const body = card.lastElementChild;
    if (body && !body.querySelector('.property-actions-premium')) {
      const status = card.querySelector('.badge')?.textContent?.trim() || 'Imóvel cadastrado';
      const hint = document.createElement('div');
      hint.className = 'property-actions-premium';
      hint.innerHTML = `<i class="property-health-dot"></i><span class="property-health-text">${esc(status)} · dados prontos para locação</span>`;
      const actions = body.querySelector('.modal-actions');
      if (actions) body.insertBefore(hint, actions); else body.appendChild(hint);
    }
  });
}

function leaseRows(page) {
  return [...page.querySelectorAll('.lease-table button.lease-row')];
}

function decorateLeases(page) {
  if (!page) return;
  page.classList.add('leases-page');
  const table = page.querySelector('.lease-table');
  if (!table) return;

  const rows = leaseRows(page);
  const active = rows.filter((row) => normalize(row.textContent).includes('ativo')).length;
  const attention = rows.filter((row) => /aguardando|document|pendente|atrasad/.test(normalize(row.textContent))).length;
  const total = rows.length;

  if (!page.querySelector('.lease-overview')) {
    const overview = document.createElement('section');
    overview.className = 'lease-overview';
    overview.innerHTML = `<article><small>Total acompanhado</small><strong>${total}</strong><span>locações registradas</span></article><article><small>Em vigência</small><strong>${active}</strong><span>contratos ativos</span></article><article><small>Pedem atenção</small><strong>${attention}</strong><span>documentos, assinaturas ou pendências</span></article>`;
    table.before(overview);
  }

  const head = page.querySelector('.page-head');
  if (head && !head.querySelector('.view-density-toggle')) {
    const tools = document.createElement('div');
    tools.className = 'page-context-tools';
    const density = localStorage.getItem(STORAGE.leaseDensity) || 'comfortable';
    tools.innerHTML = `<span class="context-chip"><i></i>${attention ? `${attention} ponto(s) de atenção` : 'Sem pendências visíveis'}</span><div class="view-density-toggle" aria-label="Densidade da lista"><button type="button" data-density="comfortable">Confortável</button><button type="button" data-density="compact">Compacta</button></div>`;
    const primary = head.querySelector('.primary');
    if (primary) head.insertBefore(tools, primary); else head.appendChild(tools);
    const applyDensity = (value) => {
      table.classList.toggle('is-compact', value === 'compact');
      tools.querySelectorAll('[data-density]').forEach((button) => button.classList.toggle('active', button.dataset.density === value));
      localStorage.setItem(STORAGE.leaseDensity, value);
    };
    tools.querySelectorAll('[data-density]').forEach((button) => button.addEventListener('click', () => applyDensity(button.dataset.density)));
    applyDensity(density);
  }
}

function findCardByHeading(page, title) {
  const wanted = normalize(title);
  return [...page.querySelectorAll('.card')].find((card) => normalize(card.querySelector('h2,h3')?.textContent).includes(wanted));
}

function journeyState(page) {
  const heroStatus = normalize(page.querySelector('.big-status')?.textContent || '');
  const docsCard = findCardByHeading(page, 'Documentos');
  const contractCard = findCardByHeading(page, 'Contrato');
  const chargesCard = findCardByHeading(page, 'Cobranças');
  const hasDocuments = Boolean(docsCard?.querySelector('.list-row'));
  const hasContract = Boolean(contractCard?.querySelector('.contract-text'));
  const signatureCount = contractCard?.querySelectorAll('.signatures span').length || 0;
  const charges = [...(chargesCard?.querySelectorAll('.charge') || [])];
  const allPaid = charges.length > 0 && charges.every((charge) => normalize(charge.textContent).includes('pago'));

  let current = 0;
  if (hasDocuments || heroStatus.includes('document')) current = 1;
  if (hasContract) current = 2;
  if (signatureCount || heroStatus.includes('assinatura')) current = 3;
  if (heroStatus.includes('ativo')) current = 4;
  if (heroStatus.includes('encerrado') || allPaid) current = 5;
  return { current, hasDocuments, hasContract, signatureCount, charges, allPaid };
}

function decorateChargeSummary(page) {
  const chargesCard = findCardByHeading(page, 'Cobranças');
  if (!chargesCard || chargesCard.querySelector('.charge-summary')) return;
  const charges = [...chargesCard.querySelectorAll('.charge')];
  if (!charges.length) return;
  const paid = charges.filter((charge) => normalize(charge.textContent).includes('pago'));
  const overdue = charges.filter((charge) => normalize(charge.textContent).includes('atrasad'));
  const totalAmount = charges.reduce((sum, charge) => sum + parseMoney(charge.querySelector('strong')?.textContent), 0);
  const summary = document.createElement('div');
  summary.className = 'charge-summary';
  summary.innerHTML = `<article><small>Cobranças</small><strong>${charges.length}</strong></article><article><small>Pagas</small><strong>${paid.length}</strong></article><article class="${overdue.length ? 'danger' : ''}"><small>Volume listado</small><strong>${esc(moneyFormat.format(totalAmount))}</strong></article>`;
  const list = chargesCard.querySelector('.charge-list');
  if (list) chargesCard.insertBefore(summary, list); else chargesCard.appendChild(summary);
}

function decorateTenantAvatar(page) {
  const tenantStat = [...page.querySelectorAll('.stat')].find((stat) => normalize(stat.querySelector('small')?.textContent).includes('inquilino'));
  if (!tenantStat || tenantStat.dataset.avatarReady) return;
  tenantStat.dataset.avatarReady = 'true';
  const name = tenantStat.querySelector('strong')?.textContent?.trim() || 'Inquilino';
  const icon = tenantStat.querySelector(':scope > span');
  if (icon) { icon.className = 'tenant-avatar'; icon.textContent = initials(name); }
}

function decorateLeaseDetail(page) {
  if (!page?.querySelector('.contract-hero')) return;
  page.classList.add('lease-detail-page');
  decorateTenantAvatar(page);
  decorateChargeSummary(page);
  if (page.querySelector('.lease-journey')) return;

  const state = journeyState(page);
  const labels = [
    ['Dados', 'Acordo inicial'],
    ['Documentos', 'Identificação'],
    ['Contrato', 'Minuta'],
    ['Assinaturas', 'Partes'],
    ['Vigência', 'Locação ativa'],
    ['Pagamentos', 'Acompanhamento'],
  ];
  const journey = document.createElement('section');
  journey.className = 'lease-journey';
  journey.innerHTML = `<header><div><small>JORNADA DA LOCAÇÃO</small><h2>Andamento do contrato</h2></div><span>Etapa ${Math.min(6, state.current + 1)} de 6</span></header><div class="journey-track">${labels.map(([title, sub], index) => `<div class="journey-step ${index < state.current ? 'done' : index === state.current ? 'current' : ''}"><i>${index < state.current ? '✓' : index + 1}</i><b>${title}</b><small>${sub}</small></div>`).join('')}</div>`;
  const hero = page.querySelector('.contract-hero');
  hero.after(journey);
}

function validateSection(section) {
  const fields = [...section.querySelectorAll('input,select,textarea')].filter((field) => !field.disabled);
  const invalid = fields.find((field) => !field.checkValidity());
  if (invalid) { invalid.reportValidity(); invalid.focus({ preventScroll: true }); invalid.scrollIntoView({ behavior: 'smooth', block: 'center' }); return false; }
  return true;
}

function setWizardStep(form, index) {
  const sections = [...form.querySelectorAll(':scope > .form-section')];
  const step = Math.max(0, Math.min(sections.length - 1, index));
  form.dataset.step = String(step);
  form.dataset.lastStep = step === sections.length - 1 ? 'true' : 'false';
  sections.forEach((section, idx) => section.classList.toggle('form-step-hidden', idx !== step));
  form.querySelectorAll('.form-stepper button').forEach((button, idx) => {
    button.classList.toggle('active', idx === step);
    button.classList.toggle('done', idx < step);
    button.setAttribute('aria-current', idx === step ? 'step' : 'false');
  });
  const back = form.querySelector('[data-wizard-back]');
  const next = form.querySelector('[data-wizard-next]');
  if (back) back.disabled = step === 0;
  if (next) next.hidden = step === sections.length - 1;
  sections[step]?.querySelector('input,select,textarea')?.focus({ preventScroll: true });
}

function decorateLeaseWizard(form) {
  if (!form || form.dataset.wizardReady) return;
  const sections = [...form.querySelectorAll(':scope > .form-section')];
  if (sections.length < 3) return;
  form.dataset.wizardReady = 'true';
  const labels = sections.map((section, index) => {
    const title = section.querySelector('h3')?.textContent?.trim() || `Etapa ${index + 1}`;
    const descriptions = ['Base da locação', 'Dados da pessoa', 'Valores e prazo', 'Contas e despesas', 'Regras adicionais'];
    return [title, descriptions[index] || 'Revisão'];
  });

  const stepper = document.createElement('nav');
  stepper.className = 'form-stepper';
  stepper.setAttribute('aria-label', 'Etapas da nova locação');
  stepper.innerHTML = labels.map(([title, sub], index) => `<button type="button" data-step="${index}"><i>${index + 1}</i><span><b>${esc(title)}</b><small>${esc(sub)}</small></span></button>`).join('');
  sections[0].before(stepper);

  const actions = form.querySelector('.modal-actions');
  if (actions) {
    const wizardActions = document.createElement('div');
    wizardActions.className = 'wizard-actions';
    wizardActions.innerHTML = '<button type="button" data-wizard-back>Voltar</button><button type="button" class="next" data-wizard-next>Continuar</button>';
    actions.prepend(wizardActions);
    wizardActions.querySelector('[data-wizard-back]').addEventListener('click', () => setWizardStep(form, Number(form.dataset.step || 0) - 1));
    wizardActions.querySelector('[data-wizard-next]').addEventListener('click', () => {
      const current = Number(form.dataset.step || 0);
      if (validateSection(sections[current])) setWizardStep(form, current + 1);
    });
  }
  stepper.querySelectorAll('[data-step]').forEach((button) => button.addEventListener('click', () => {
    const target = Number(button.dataset.step);
    const current = Number(form.dataset.step || 0);
    if (target <= current || validateSection(sections[current])) setWizardStep(form, target > current + 1 ? current + 1 : target);
  }));
  setWizardStep(form, 0);
}

function decorateModals() {
  document.querySelectorAll('form.modal.large').forEach(decorateLeaseWizard);
  document.querySelectorAll('form.modal:not(.large)').forEach((form) => {
    if (form.dataset.compactPremium) return;
    form.dataset.compactPremium = 'true';
    const head = form.querySelector('.modal-head');
    if (head) head.dataset.context = 'guided-form';
  });
}

function classifyPage(page) {
  const heading = normalize(page.querySelector('.page-head h1')?.textContent || '');
  if (page.querySelector('.contract-hero')) decorateLeaseDetail(page);
  else if (heading === 'imoveis') decorateProperties(page);
  else if (heading === 'locacoes') decorateLeases(page);
  else if (page.querySelector('.stats') && heading.includes('patrimonio')) decorateDashboard(page);
  else if (page.querySelector('.stats') && normalize(page.querySelector('.eyebrow')?.textContent).includes('visao geral')) decorateDashboard(page);
}

let queued = false;
function enhance() {
  queued = false;
  ensureThemeControls();
  document.querySelectorAll('.content .page').forEach(classifyPage);
  decorateModals();
}

function queueEnhance() {
  if (queued) return;
  queued = true;
  window.requestAnimationFrame(enhance);
}

function boot() {
  applyTheme(currentTheme());
  queueEnhance();
  const root = document.getElementById('root') || document.body;
  const observer = new MutationObserver(queueEnhance);
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener('authChanged', queueEnhance);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
