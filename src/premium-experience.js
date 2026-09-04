import { appApi } from './services/api.js';

const STORAGE = {
  collapsed: 'peter.ui.sidebar.collapsed',
  theme: 'peter.ui.theme',
  section: 'peter.ui.locaio.section',
  density: 'peter.ui.locaio.density',
};

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const icon = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
const ICONS = {
  search: icon('M10.8 3a7.8 7.8 0 1 0 4.85 13.9L20.75 22 22 20.75l-5.1-5.1A7.8 7.8 0 0 0 10.8 3Zm0 1.8a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z'),
  bell: icon('M18.5 15.4V10a6.5 6.5 0 0 0-5.1-6.35V2.5a1.4 1.4 0 0 0-2.8 0v1.15A6.5 6.5 0 0 0 5.5 10v5.4L3.7 17.2V19h16.6v-1.8l-1.8-1.8ZM7.3 17.2V10a4.7 4.7 0 1 1 9.4 0v7.2H7.3ZM9.8 20a2.2 2.2 0 0 0 4.4 0H9.8Z'),
  plus: icon('M11.1 4h1.8v7.1H20v1.8h-7.1V20h-1.8v-7.1H4v-1.8h7.1V4Z'),
  home: icon('m12 3-9 7v11h7v-6h4v6h7V10l-9-7Zm7.2 16.2h-3.4v-6H8.2v6H4.8v-8.3L12 5.3l7.2 5.6v8.3Z'),
  file: icon('M6 2h8.2L19 6.8V22H6V2Zm1.8 1.8v16.4h9.4V8h-4.4V3.8h-5Zm6.8 1.3v1.1h1.1l-1.1-1.1Z'),
  moon: icon('M19 16.9A7.6 7.6 0 0 1 9.1 7a6.8 6.8 0 1 0 9.9 9.9ZM8.6 4.8a9 9 0 1 0 11 13.1l.8-1.7-1.8.7A6 6 0 0 1 10.5 6l.7-1.8-1.8.2-.8.4Z'),
  sun: icon('M11.1 2h1.8v3h-1.8V2Zm0 17h1.8v3h-1.8v-3ZM4.3 5.6 3 4.3 4.3 3l1.3 1.3-1.3 1.3Zm15.4 15.4-1.3-1.3 1.3-1.3 1.3 1.3-1.3 1.3ZM2 11.1h3v1.8H2v-1.8Zm17 0h3v1.8h-3v-1.8ZM4.3 21 3 19.7l1.3-1.3 1.3 1.3L4.3 21Zm15.4-15.4-1.3-1.3L19.7 3 21 4.3l-1.3 1.3ZM12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm0 1.8a3.7 3.7 0 1 1 0 7.4 3.7 3.7 0 0 1 0-7.4Z'),
  collapse: icon('m15.5 5.7-1.3-1.3-7.6 7.6 7.6 7.6 1.3-1.3-6.3-6.3 6.3-6.3Z'),
};

let cache = { dashboard: null, properties: [], leases: [], actions: null };
let poller = null;
let observer = null;
let wizardDock = null;
let restoredSection = false;
let lastPageSignature = '';

const navButtons = () => [...document.querySelectorAll('.pt-sidebar nav button')];

function goToSection(label) {
  const wanted = normalize(label);
  const button = navButtons().find((item) => normalize(item.textContent).includes(wanted));
  button?.click();
  if (button) localStorage.setItem(STORAGE.section, wanted.includes('imove') ? 'imoveis' : wanted.includes('loca') ? 'locacoes' : 'visao geral');
}

function triggerPageAction(section, action) {
  goToSection(section);
  window.setTimeout(() => {
    const wanted = normalize(action);
    [...document.querySelectorAll('.pt-page-header button')].find((button) => normalize(button.textContent).includes(wanted))?.click();
  }, 120);
}

function setTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.ptTheme = next;
  localStorage.setItem(STORAGE.theme, next);
  document.querySelectorAll('[data-premium-theme]').forEach((button) => {
    button.innerHTML = next === 'dark' ? ICONS.sun : ICONS.moon;
    button.setAttribute('aria-label', next === 'dark' ? 'Usar tema claro' : 'Usar tema escuro');
    button.title = button.getAttribute('aria-label');
  });
}

function toggleTheme() { setTheme((document.documentElement.dataset.ptTheme || 'light') === 'dark' ? 'light' : 'dark'); }

function setCollapsed(collapsed) {
  document.documentElement.classList.toggle('pt-sidebar-collapsed', collapsed);
  localStorage.setItem(STORAGE.collapsed, collapsed ? '1' : '0');
  const button = document.querySelector('[data-premium-collapse]');
  if (button) {
    button.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu');
    button.title = button.getAttribute('aria-label');
  }
}

function setDensity(value) {
  const compact = value === 'compact';
  document.documentElement.classList.toggle('pt-density-compact', compact);
  localStorage.setItem(STORAGE.density, compact ? 'compact' : 'comfortable');
  document.querySelectorAll('[data-premium-density]').forEach((button) => {
    button.textContent = compact ? 'Lista confortável' : 'Lista compacta';
    button.setAttribute('aria-pressed', compact ? 'true' : 'false');
  });
}

async function loadData(silent = true) {
  if (!localStorage.getItem('token')) return;
  try {
    const [dashboard, properties, leases, actions] = await Promise.allSettled([
      appApi.get('/leasing/dashboard'), appApi.get('/properties'), appApi.get('/leases'), appApi.get('/leasing/action-center'),
    ]);
    cache = {
      dashboard: dashboard.status === 'fulfilled' ? dashboard.value.data : cache.dashboard,
      properties: properties.status === 'fulfilled' ? (properties.value.data || []) : cache.properties,
      leases: leases.status === 'fulfilled' ? (leases.value.data || []) : cache.leases,
      actions: actions.status === 'fulfilled' ? actions.value.data : cache.actions,
    };
    updateNavBadges();
    renderNotifications();
  } catch (error) {
    if (!silent) console.warn('[Locaio premium UI] refresh failed', error);
  }
}

function pendingCounts() {
  const actionCounts = cache.actions?.counts || {};
  const leasesAttention = cache.leases.filter((lease) => ['awaiting_signature', 'awaiting_documents', 'draft'].includes(lease.status)).length;
  const overdue = Number(cache.dashboard?.overdue_amount || 0) > 0 ? 1 : 0;
  const attention = Number(actionCounts.critical || 0) + Number(actionCounts.attention || 0) || leasesAttention + overdue;
  return { properties: cache.properties.length, leases: leasesAttention, attention };
}

function updateNavBadges() {
  const counts = pendingCounts();
  navButtons().forEach((button) => {
    const label = normalize(button.textContent);
    const value = label.includes('imove') ? counts.properties : label.includes('loca') ? counts.leases : 0;
    button.dataset.premiumCount = value ? String(value > 99 ? '99+' : value) : '';
  });
  document.querySelectorAll('[data-premium-alert-count]').forEach((badge) => {
    badge.textContent = counts.attention > 99 ? '99+' : String(counts.attention);
    badge.hidden = counts.attention <= 0;
  });
}

function createDock() {
  if (document.querySelector('.pt-premium-dock')) return;
  const dock = document.createElement('aside');
  dock.className = 'pt-premium-dock';
  dock.setAttribute('aria-label', 'Atalhos da Locaio');
  dock.innerHTML = `
    <button type="button" class="premium-wide" data-premium-search>${ICONS.search}<span>Buscar</span><kbd>⌘K</kbd></button>
    <button type="button" data-premium-alerts>${ICONS.bell}<span class="sr-only">Notificações</span><b data-premium-alert-count hidden></b></button>
    <button type="button" data-premium-theme>${ICONS.moon}<span class="sr-only">Alternar tema</span></button>
    <div class="premium-divider"></div>
    <button type="button" data-premium-property>${ICONS.home}<span class="sr-only">Novo imóvel</span></button>
    <button type="button" data-premium-lease>${ICONS.file}<span class="sr-only">Nova locação</span></button>
    <button type="button" data-premium-collapse>${ICONS.collapse}<span class="sr-only">Recolher menu</span></button>`;
  document.body.appendChild(dock);
  dock.querySelector('[data-premium-search]').addEventListener('click', openSearch);
  dock.querySelector('[data-premium-alerts]').addEventListener('click', toggleNotifications);
  dock.querySelector('[data-premium-theme]').addEventListener('click', toggleTheme);
  dock.querySelector('[data-premium-property]').addEventListener('click', () => triggerPageAction('Imóveis', 'Novo imóvel'));
  dock.querySelector('[data-premium-lease]').addEventListener('click', () => triggerPageAction('Locações', 'Nova locação'));
  dock.querySelector('[data-premium-collapse]').addEventListener('click', () => setCollapsed(!document.documentElement.classList.contains('pt-sidebar-collapsed')));
  setTheme(localStorage.getItem(STORAGE.theme) || 'light');
  setCollapsed(localStorage.getItem(STORAGE.collapsed) === '1');
  setDensity(localStorage.getItem(STORAGE.density) || 'comfortable');
}

function createSearch() {
  if (document.querySelector('.pt-premium-search')) return;
  const overlay = document.createElement('div');
  overlay.className = 'pt-premium-search';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Busca global');
  overlay.innerHTML = `<section><header>${ICONS.search}<input type="search" aria-label="Buscar no Locaio" placeholder="Buscar imóvel, endereço, inquilino ou contrato…" autocomplete="off"><button type="button" data-search-close>Esc</button></header><main data-search-results><div class="premium-search-empty"><b>Busca global</b><span>Encontre patrimônio e locações sem navegar por várias telas.</span></div></main><footer><span>↑↓ navegar</span><span>Enter abrir</span><span>Ctrl/⌘ K buscar</span></footer></section>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) closeSearch(); });
  overlay.querySelector('[data-search-close]').addEventListener('click', closeSearch);
  overlay.querySelector('input').addEventListener('input', (event) => renderSearch(event.target.value));
  overlay.querySelector('input').addEventListener('keydown', handleSearchKeys);
}

function openSearch() {
  createSearch();
  closeNotifications();
  const overlay = document.querySelector('.pt-premium-search');
  overlay.classList.add('open');
  const input = overlay.querySelector('input');
  input.value = '';
  renderSearch('');
  window.setTimeout(() => input.focus(), 0);
}
function closeSearch() { document.querySelector('.pt-premium-search')?.classList.remove('open'); }

function searchRows(query) {
  const q = normalize(query);
  if (!q) return [];
  const properties = cache.properties.filter((property) => normalize([property.name, property.street, property.neighborhood, property.city, property.state].join(' ')).includes(q)).slice(0, 6).map((property) => ({
    kind: 'property', title: property.name || `Imóvel #${property.id}`, subtitle: [property.street, property.city, property.state].filter(Boolean).join(' · '), id: property.id,
  }));
  const leases = cache.leases.filter((lease) => normalize([lease.property_name, lease.tenant_name, lease.status, lease.public_id, lease.tenant_email].join(' ')).includes(q)).slice(0, 7).map((lease) => ({
    kind: 'lease', title: lease.property_name || `Locação #${lease.id}`, subtitle: `${lease.tenant_name || 'Inquilino'} · ${lease.status || 'contrato'}`, id: lease.id,
  }));
  return [...properties, ...leases].slice(0, 10);
}

function renderSearch(query) {
  const results = document.querySelector('[data-search-results]');
  if (!results) return;
  const rows = searchRows(query);
  if (!normalize(query)) {
    results.innerHTML = `<div class="premium-search-empty"><b>Busca global</b><span>Pesquise por nome do imóvel, endereço, inquilino, e-mail, status ou identificador do contrato.</span></div>`;
    return;
  }
  if (!rows.length) {
    results.innerHTML = `<div class="premium-search-empty"><b>Nenhum resultado</b><span>Tente um nome, endereço ou dado diferente.</span></div>`;
    return;
  }
  results.innerHTML = rows.map((row, index) => `<button type="button" data-search-row="${index}" data-kind="${row.kind}" data-id="${row.id}"><i>${row.kind === 'property' ? ICONS.home : ICONS.file}</i><span><b>${escapeHtml(row.title)}</b><small>${escapeHtml(row.subtitle)}</small></span><em>›</em></button>`).join('');
  results.querySelectorAll('[data-search-row]').forEach((button) => button.addEventListener('click', () => activateSearchResult(rows[Number(button.dataset.searchRow)])));
  results.querySelector('[data-search-row="0"]')?.classList.add('selected');
}

function handleSearchKeys(event) {
  const buttons = [...document.querySelectorAll('[data-search-row]')];
  if (!buttons.length) return;
  let index = buttons.findIndex((button) => button.classList.contains('selected'));
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    index = event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
    buttons.forEach((button) => button.classList.remove('selected'));
    buttons[index].classList.add('selected');
    buttons[index].scrollIntoView({ block: 'nearest' });
  }
  if (event.key === 'Enter') { event.preventDefault(); buttons[Math.max(0, index)]?.click(); }
}

function activateSearchResult(row) {
  closeSearch();
  if (!row) return;
  if (row.kind === 'property') {
    goToSection('Imóveis');
    window.setTimeout(() => {
      [...document.querySelectorAll('.pt-property-card')].find((card) => normalize(card.textContent).includes(normalize(row.title)))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 160);
    return;
  }
  goToSection('Locações');
  window.setTimeout(() => {
    const lease = cache.leases.find((item) => String(item.id) === String(row.id));
    const target = [...document.querySelectorAll('.pt-lease-row')].find((button) => normalize(button.textContent).includes(normalize(lease?.tenant_name || row.title)) && normalize(button.textContent).includes(normalize(lease?.property_name || '')));
    target?.click();
  }, 160);
}

function createNotifications() {
  if (document.querySelector('.pt-premium-notifications')) return;
  const panel = document.createElement('aside');
  panel.className = 'pt-premium-notifications';
  panel.setAttribute('aria-label', 'Central de atenção');
  document.body.appendChild(panel);
}

function renderNotifications() {
  createNotifications();
  const panel = document.querySelector('.pt-premium-notifications');
  const items = Array.isArray(cache.actions?.items) ? cache.actions.items.slice(0, 9) : [];
  const overdue = Number(cache.dashboard?.overdue_amount || 0);
  const fallback = [];
  if (overdue > 0) fallback.push({ title: 'Recebimentos em atraso', description: `${money.format(overdue)} exigem acompanhamento.`, priority: 'critical' });
  cache.leases.filter((lease) => ['awaiting_signature', 'awaiting_documents'].includes(lease.status)).slice(0, 6).forEach((lease) => fallback.push({ title: lease.status === 'awaiting_signature' ? 'Assinatura pendente' : 'Documentação pendente', description: `${lease.property_name || 'Contrato'} · ${lease.tenant_name || 'Inquilino'}`, priority: 'attention', lease_id: lease.id }));
  const rows = items.length ? items : fallback;
  panel.innerHTML = `<header><div><small>CENTRAL DE ATENÇÃO</small><h2>Notificações</h2><p>O que merece uma decisão agora.</p></div><button type="button" data-notifications-close>×</button></header><main>${rows.length ? rows.map((item, index) => `<button type="button" data-notification="${index}" data-lease="${item.lease_id || ''}"><i class="${item.priority || 'attention'}"></i><span><b>${escapeHtml(item.title || 'Pendência')}</b><small>${escapeHtml(item.description || '')}</small></span><em>›</em></button>`).join('') : '<div class="premium-all-clear"><i>✓</i><b>Tudo sob controle</b><span>Nenhuma pendência importante agora.</span></div>'}</main><footer><button type="button" data-open-operation>Ver Central de Operação</button></footer>`;
  panel.querySelector('[data-notifications-close]')?.addEventListener('click', closeNotifications);
  panel.querySelectorAll('[data-notification]').forEach((button) => button.addEventListener('click', () => {
    const leaseId = button.dataset.lease;
    closeNotifications();
    if (leaseId) activateSearchResult({ kind: 'lease', id: leaseId, title: '', subtitle: '' }); else goToSection('Locações');
  }));
  panel.querySelector('[data-open-operation]')?.addEventListener('click', () => { closeNotifications(); document.querySelector('.ops-launcher')?.click(); });
}

function toggleNotifications() {
  createNotifications();
  closeSearch();
  document.querySelector('.pt-premium-notifications')?.classList.toggle('open');
}
function closeNotifications() { document.querySelector('.pt-premium-notifications')?.classList.remove('open'); }

function pageSignature() {
  const title = document.querySelector('.pt-contract-hero h1')?.textContent?.trim() || document.querySelector('.pt-page-header h1')?.textContent?.trim() || '';
  const eyebrow = document.querySelector('.pt-page-header .pt-eyebrow')?.textContent?.trim() || (document.querySelector('.pt-contract-hero') ? 'Locações' : '');
  return `${eyebrow}|${title}`;
}

function updateContextBar() {
  const signature = pageSignature();
  if (!signature || signature === lastPageSignature) return;
  lastPageSignature = signature;
  let bar = document.querySelector('.pt-premium-context');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'pt-premium-context';
    document.body.appendChild(bar);
  }
  const [eyebrow, title] = signature.split('|');
  const leases = normalize(title).includes('loca') || normalize(eyebrow).includes('contrat') || document.querySelector('.pt-contract-hero');
  bar.innerHTML = `<div><button type="button" data-context-home>Locaio</button><span>›</span><b>${escapeHtml(eyebrow || 'Visão geral')}</b>${title && normalize(title) !== normalize(eyebrow) ? `<span>›</span><strong>${escapeHtml(title)}</strong>` : ''}</div>${leases ? `<button type="button" data-premium-density aria-pressed="${document.documentElement.classList.contains('pt-density-compact')}" class="premium-density">${document.documentElement.classList.contains('pt-density-compact') ? 'Lista confortável' : 'Lista compacta'}</button>` : ''}`;
  bar.querySelector('[data-context-home]')?.addEventListener('click', () => goToSection('Visão geral'));
  bar.querySelector('[data-premium-density]')?.addEventListener('click', () => setDensity(document.documentElement.classList.contains('pt-density-compact') ? 'comfortable' : 'compact'));
}

function restoreSection() {
  if (restoredSection || !document.querySelector('.pt-sidebar nav')) return;
  restoredSection = true;
  const saved = localStorage.getItem(STORAGE.section);
  if (!saved || saved === 'visao geral') return;
  goToSection(saved === 'imoveis' ? 'Imóveis' : saved === 'locacoes' ? 'Locações' : 'Visão geral');
}

function decorateIdentityFallbacks() {
  const account = document.querySelector('.pt-account');
  const accountIcon = account?.querySelector(':scope > span');
  const accountName = account?.querySelector('b')?.textContent?.trim();
  if (accountIcon && accountName) {
    accountIcon.dataset.initials = initials(accountName);
    accountIcon.classList.add('pt-identity-fallback');
  }
  document.querySelectorAll('.pt-metric').forEach((metric) => {
    if (!normalize(metric.querySelector('small')?.textContent).includes('inquilino')) return;
    const name = metric.querySelector('strong')?.textContent?.trim();
    const target = metric.querySelector('.pt-metric-icon');
    if (target && name) { target.dataset.initials = initials(name); target.classList.add('pt-identity-fallback'); }
  });
  document.querySelectorAll('.pt-property-card').forEach((card) => {
    const name = card.querySelector('h3')?.textContent?.trim() || 'Imóvel';
    const cover = card.querySelector('.pt-property-cover');
    if (!cover) return;
    cover.dataset.initials = initials(name);
    const raw = cover.style.backgroundImage;
    const match = raw?.match(/url\(["']?([^"')]+)["']?\)/i);
    if (match?.[1] && !cover.dataset.coverChecked) {
      cover.dataset.coverChecked = '1';
      const image = new Image();
      image.onerror = () => cover.classList.add('is-broken-cover');
      image.src = match[1];
    }
  });
}

function initials(value = '') { return String(value).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'PT'; }

function enhanceStepper() {
  const stepper = document.querySelector('.pt-stepper');
  const page = stepper?.closest('.pt-page');
  if (!stepper || !page) return;
  if (stepper.dataset.premiumSteps === '9' && stepper.children.length === 9) return;
  const status = normalize(page.querySelector('.pt-contract-hero .pt-status')?.textContent || '');
  const metrics = [...page.querySelectorAll('.pt-metric')];
  const depositText = metrics.find((metric) => normalize(metric.querySelector('small')?.textContent).includes('caucao'))?.querySelector('strong')?.textContent || '';
  const noDeposit = normalize(depositText).includes('sem caucao');
  const documents = page.querySelectorAll('.pt-card .pt-list-row[href]').length > 0;
  const contract = Boolean(page.querySelector('.pt-contract-text'));
  const signatures = page.querySelectorAll('.pt-signatures span').length;
  const charges = page.querySelectorAll('.pt-charge').length;
  const active = status.includes('ativo');
  const ended = status.includes('encerrado');
  const current = ended ? 8 : active ? (charges ? 6 : 5) : signatures ? 4 : contract ? 3 : documents ? 2 : 1;
  const stages = [
    ['Dados', 'Acordo'], ['Documentos', 'Identificação'], ['Contrato', 'Minuta'], ['Assinaturas', 'Partes'],
    ['Garantia', noDeposit ? 'Sem caução' : 'Caução'], ['Vigência', 'Ativa'], ['Pagamentos', 'Recebimentos'], ['Reajuste', 'Atualização'], ['Encerramento', 'Conclusão'],
  ];
  stepper.dataset.premiumSteps = '9';
  stepper.innerHTML = stages.map(([label, sub], index) => {
    const skipped = index === 4 && noDeposit && (contract || active || ended);
    const done = index === 0 || (index === 1 && documents) || (index === 2 && contract) || (index === 3 && signatures > 0) || ((index === 4 || index === 5) && (active || ended)) || (index === 6 && ended) || (index === 8 && ended);
    const state = skipped ? 'skipped' : done && index !== current ? 'done' : index === current ? 'current' : '';
    const marker = skipped ? '—' : done && index !== current ? '✓' : index + 1;
    return `<div class="${state}"><span>${marker}</span><small>${escapeHtml(label)}</small><em>${escapeHtml(sub)}</em></div>`;
  }).join('');
}

function findLeaseWizardForm() {
  return [...document.querySelectorAll('.pt-modal.large .pt-form')].find((form) => form.querySelectorAll(':scope > .pt-form-section').length >= 5) || null;
}

function removeWizardDock() {
  wizardDock?.remove();
  wizardDock = null;
}

function validateWizardStep(form, step) {
  const section = form.querySelectorAll(':scope > .pt-form-section')[step];
  if (!section) return true;
  const fields = [...section.querySelectorAll('input,select,textarea')].filter((field) => !field.disabled);
  const invalid = fields.find((field) => !field.checkValidity());
  if (!invalid) return true;
  invalid.reportValidity();
  invalid.focus({ preventScroll: true });
  invalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return false;
}

function setWizardStep(form, next) {
  const sections = form.querySelectorAll(':scope > .pt-form-section');
  const step = Math.max(0, Math.min(sections.length - 1, Number(next)));
  form.dataset.wizardStep = String(step);
  if (!wizardDock) return;
  wizardDock.querySelectorAll('[data-wizard-step]').forEach((button) => {
    const index = Number(button.dataset.wizardStep);
    button.classList.toggle('active', index === step);
    button.classList.toggle('done', index < step);
    button.setAttribute('aria-current', index === step ? 'step' : 'false');
  });
  const back = wizardDock.querySelector('[data-wizard-back]');
  const nextButton = wizardDock.querySelector('[data-wizard-next]');
  back.disabled = step === 0;
  nextButton.hidden = step === sections.length - 1;
  const first = sections[step]?.querySelector('input,select,textarea');
  window.setTimeout(() => first?.focus({ preventScroll: true }), 0);
}

function ensureWizard() {
  const form = findLeaseWizardForm();
  if (!form) { removeWizardDock(); return; }
  form.classList.add('pt-premium-wizard');
  if (!form.dataset.wizardStep) form.dataset.wizardStep = '0';
  if (wizardDock?.isConnected) return;
  const labels = ['Imóvel', 'Inquilino', 'Condições', 'Despesas', 'Cláusulas'];
  wizardDock = document.createElement('aside');
  wizardDock.className = 'pt-wizard-dock';
  wizardDock.setAttribute('aria-label', 'Etapas da nova locação');
  wizardDock.innerHTML = `<nav>${labels.map((label, index) => `<button type="button" data-wizard-step="${index}"><i>${index + 1}</i><span>${label}</span></button>`).join('')}</nav><div><button type="button" data-wizard-back>Voltar</button><button type="button" data-wizard-next>Continuar</button></div>`;
  document.body.appendChild(wizardDock);
  wizardDock.querySelector('[data-wizard-back]').addEventListener('click', () => setWizardStep(form, Number(form.dataset.wizardStep || 0) - 1));
  wizardDock.querySelector('[data-wizard-next]').addEventListener('click', () => {
    const current = Number(form.dataset.wizardStep || 0);
    if (validateWizardStep(form, current)) setWizardStep(form, current + 1);
  });
  wizardDock.querySelectorAll('[data-wizard-step]').forEach((button) => button.addEventListener('click', () => {
    const current = Number(form.dataset.wizardStep || 0);
    const target = Number(button.dataset.wizardStep);
    if (target <= current || (target === current + 1 && validateWizardStep(form, current))) setWizardStep(form, target);
  }));
  setWizardStep(form, Number(form.dataset.wizardStep || 0));
}

function bindNavigationPersistence() {
  navButtons().forEach((button) => {
    if (button.dataset.premiumPersistence) return;
    button.dataset.premiumPersistence = '1';
    button.addEventListener('click', () => {
      const label = normalize(button.textContent);
      localStorage.setItem(STORAGE.section, label.includes('imove') ? 'imoveis' : label.includes('loca') ? 'locacoes' : 'visao geral');
      window.setTimeout(updateContextBar, 40);
    });
  });
}

function enhance() {
  if (document.querySelector('.pt-sidebar')) createDock();
  createSearch();
  createNotifications();
  bindNavigationPersistence();
  restoreSection();
  updateContextBar();
  decorateIdentityFallbacks();
  enhanceStepper();
  ensureWizard();
  updateNavBadges();
}

function onKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); return; }
  if (event.key === 'Escape') { closeSearch(); closeNotifications(); }
}

function onDocumentClick(event) {
  if (!event.target.closest('.pt-premium-notifications,[data-premium-alerts]')) closeNotifications();
}

export function installPremiumExperience() {
  setTheme(localStorage.getItem(STORAGE.theme) || 'light');
  setCollapsed(localStorage.getItem(STORAGE.collapsed) === '1');
  setDensity(localStorage.getItem(STORAGE.density) || 'comfortable');
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('click', onDocumentClick);
  observer = new MutationObserver(() => window.requestAnimationFrame(enhance));
  observer.observe(document.getElementById('root') || document.body, { childList: true, subtree: true });
  window.addEventListener('authChanged', () => { restoredSection = false; loadData(); window.requestAnimationFrame(enhance); });
  enhance();
  loadData();
  poller = window.setInterval(() => loadData(true), 60000);
  return () => {
    observer?.disconnect();
    window.clearInterval(poller);
    document.removeEventListener('keydown', onKeydown);
    document.removeEventListener('click', onDocumentClick);
    removeWizardDock();
  };
}
