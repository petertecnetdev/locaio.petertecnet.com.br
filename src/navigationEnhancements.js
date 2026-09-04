import { appApi } from './services/api.js';

const STORAGE = { collapsed: 'locaio.sidebar.collapsed', section: 'locaio.navigation.section' };
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const normalize = (value = '') => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const svg = (path) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${path}"/></svg>`;
const icons = {
  search: svg('M11 4a7 7 0 1 0 4.9 12l4.05 4.05 1.4-1.4-4.05-4.05A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z'),
  bell: svg('M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6v-5a7 7 0 0 0-5-6.71V3a2 2 0 1 0-4 0v1.29A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Zm-12 .83V11a5 5 0 0 1 10 0v5.83l.17.17H6.83l.17-.17Z'),
  collapse: svg('M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6 4.6-4.6Z'),
  plus: svg('M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z'),
  home: svg('M12 3 3 10v11h7v-6h4v6h7V10l-9-7Zm7 16h-3v-6H8v6H5v-8l7-5.44L19 11v8Z'),
  file: svg('M6 2h8l4 4v16H6V2Zm2 2v16h8V8h-4V4H8Zm6 .83V6h1.17L14 4.83Z'),
};

let cache = { properties: [], leases: [], dashboard: null };
let refreshTimer;

function navButtons() { return [...document.querySelectorAll('.sidebar nav button')]; }
function mobileButtons() { return [...document.querySelectorAll('.mobile-nav button')]; }
function sectionButton(section) {
  const labels = { dashboard: ['Visão geral', 'Resumo'], properties: ['Imóveis'], leases: ['Locações'] };
  return [...navButtons(), ...mobileButtons()].find((b) => labels[section]?.includes(b.textContent.trim()));
}
function go(section) {
  sectionButton(section)?.click();
  localStorage.setItem(STORAGE.section, section);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  closePanels();
}
function closePanels() { document.querySelectorAll('.nav-popover.open').forEach((el) => el.classList.remove('open')); }

async function refreshData() {
  if (!localStorage.getItem('token')) return;
  try {
    const [d, p, l] = await Promise.all([appApi.get('/leasing/dashboard'), appApi.get('/properties'), appApi.get('/leases')]);
    cache = { dashboard: d.data || {}, properties: p.data || [], leases: l.data || [] };
    updateBadges();
    renderNotifications();
  } catch { /* App already owns global API error handling. */ }
}

function pendingCounts() {
  const leases = cache.leases || [];
  const signature = leases.filter((l) => ['awaiting_signature', 'awaiting_documents'].includes(l.status)).length;
  const overdue = Number(cache.dashboard?.overdue_amount || 0) > 0 ? 1 : 0;
  return { properties: cache.properties.length, leases: signature, alerts: signature + overdue };
}
function updateBadges() {
  const counts = pendingCounts();
  navButtons().forEach((button) => {
    const label = button.textContent.trim();
    const value = label.startsWith('Imóveis') ? counts.properties : label.startsWith('Locações') ? counts.leases : 0;
    let badge = button.querySelector('.nav-count');
    if (!badge) { badge = document.createElement('i'); badge.className = 'nav-count'; button.appendChild(badge); }
    badge.textContent = value > 99 ? '99+' : String(value);
    badge.hidden = !value;
  });
  document.querySelectorAll('[data-nav-alert-count]').forEach((el) => { el.textContent = counts.alerts > 9 ? '9+' : counts.alerts; el.hidden = !counts.alerts; });
}

function ensureShell() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar || sidebar.dataset.enhanced) return;
  sidebar.dataset.enhanced = 'true';
  const collapsed = localStorage.getItem(STORAGE.collapsed) === '1';
  document.documentElement.classList.toggle('sidebar-collapsed', collapsed);

  const toolbar = document.createElement('div');
  toolbar.className = 'nav-toolbar';
  toolbar.innerHTML = `<button type="button" class="nav-tool search-trigger" aria-label="Buscar no Locaio" title="Buscar (Ctrl+K)">${icons.search}<span>Buscar</span><kbd>⌘K</kbd></button><button type="button" class="nav-tool icon-only notification-trigger" aria-label="Abrir notificações" title="Notificações">${icons.bell}<i data-nav-alert-count hidden></i></button>`;
  sidebar.querySelector('.brand')?.after(toolbar);

  const quick = document.createElement('div');
  quick.className = 'quick-actions';
  quick.innerHTML = `<small>ATALHOS</small><div><button type="button" data-go="properties" title="Novo imóvel">${icons.home}<span>Imóvel</span></button><button type="button" data-go="leases" title="Nova locação">${icons.file}<span>Locação</span></button></div>`;
  sidebar.querySelector('nav')?.after(quick);

  const collapse = document.createElement('button');
  collapse.type = 'button'; collapse.className = 'sidebar-collapse'; collapse.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu'); collapse.title = collapsed ? 'Expandir menu' : 'Recolher menu'; collapse.innerHTML = `${icons.collapse}<span>${collapsed ? 'Expandir' : 'Recolher'} menu</span>`;
  sidebar.querySelector('.sidebar-bottom')?.prepend(collapse);

  toolbar.querySelector('.search-trigger').addEventListener('click', () => openSearch());
  toolbar.querySelector('.notification-trigger').addEventListener('click', (e) => { e.stopPropagation(); document.querySelector('.notification-panel')?.classList.toggle('open'); });
  quick.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  collapse.addEventListener('click', () => {
    const next = !document.documentElement.classList.contains('sidebar-collapsed');
    document.documentElement.classList.toggle('sidebar-collapsed', next); localStorage.setItem(STORAGE.collapsed, next ? '1' : '0');
    collapse.querySelector('span').textContent = next ? 'Expandir menu' : 'Recolher menu'; collapse.setAttribute('aria-label', next ? 'Expandir menu' : 'Recolher menu');
  });

  navButtons().forEach((button) => button.addEventListener('click', () => {
    const label = button.textContent;
    localStorage.setItem(STORAGE.section, label.includes('Imóveis') ? 'properties' : label.includes('Locações') ? 'leases' : 'dashboard');
    setTimeout(updateContext, 0);
  }));
  enhanceAccessibility();
}

function ensureOverlays() {
  if (!document.querySelector('.global-search')) {
    const modal = document.createElement('div'); modal.className = 'global-search'; modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Busca global');
    modal.innerHTML = `<div class="global-search-card"><div class="search-input">${icons.search}<input type="search" placeholder="Buscar imóvel, inquilino ou contrato…" aria-label="Buscar" autocomplete="off"><button type="button" aria-label="Fechar">Esc</button></div><div class="search-results"><div class="search-hint">Digite para pesquisar em imóveis e locações.</div></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeSearch(); });
    modal.querySelector('.search-input button').addEventListener('click', closeSearch);
    modal.querySelector('input').addEventListener('input', (e) => renderSearch(e.target.value));
  }
  if (!document.querySelector('.notification-panel')) {
    const panel = document.createElement('aside'); panel.className = 'nav-popover notification-panel'; panel.setAttribute('aria-label', 'Central de notificações'); document.body.appendChild(panel);
  }
}
function openSearch() { ensureOverlays(); closePanels(); const modal = document.querySelector('.global-search'); modal.classList.add('open'); const input = modal.querySelector('input'); input.value = ''; renderSearch(''); setTimeout(() => input.focus(), 0); }
function closeSearch() { document.querySelector('.global-search')?.classList.remove('open'); }
function renderSearch(query) {
  const target = document.querySelector('.search-results'); if (!target) return;
  const q = normalize(query.trim());
  if (!q) { target.innerHTML = `<div class="search-hint"><b>Busca global</b><span>Pesquise por imóvel, endereço, inquilino ou status do contrato.</span></div>`; return; }
  const properties = cache.properties.filter((p) => normalize([p.name, p.street, p.city, p.state, p.neighborhood].join(' ')).includes(q)).slice(0, 5);
  const leases = cache.leases.filter((l) => normalize([l.property_name, l.tenant_name, l.status, l.public_id].join(' ')).includes(q)).slice(0, 6);
  const rows = [...properties.map((p) => ({ type: 'properties', icon: icons.home, title: p.name, sub: [p.street, p.city, p.state].filter(Boolean).join(' · ') })), ...leases.map((l) => ({ type: 'leases', icon: icons.file, title: l.property_name || 'Locação', sub: `${l.tenant_name || 'Inquilino'} · ${l.status || 'contrato'}` }))];
  target.innerHTML = rows.length ? rows.map((r) => `<button type="button" data-result="${r.type}">${r.icon}<span><b>${esc(r.title)}</b><small>${esc(r.sub)}</small></span><em>›</em></button>`).join('') : `<div class="search-hint"><b>Nenhum resultado</b><span>Tente outro nome, endereço ou inquilino.</span></div>`;
  target.querySelectorAll('[data-result]').forEach((b) => b.addEventListener('click', () => { closeSearch(); go(b.dataset.result); }));
}
function renderNotifications() {
  ensureOverlays(); const panel = document.querySelector('.notification-panel'); if (!panel) return;
  const pending = (cache.leases || []).filter((l) => ['awaiting_signature', 'awaiting_documents'].includes(l.status)).slice(0, 5);
  const overdue = Number(cache.dashboard?.overdue_amount || 0);
  const items = [];
  if (overdue > 0) items.push({ kind: 'leases', title: 'Recebimentos em atraso', text: `Há ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(overdue)} em atraso.` });
  pending.forEach((l) => items.push({ kind: 'leases', title: l.status === 'awaiting_signature' ? 'Assinatura pendente' : 'Documentação pendente', text: `${l.property_name || 'Contrato'} · ${l.tenant_name || 'Inquilino'}` }));
  panel.innerHTML = `<header><div><small>CENTRAL DE ATENÇÃO</small><h3>Notificações</h3></div><button type="button" aria-label="Fechar">×</button></header><div class="notification-list">${items.length ? items.map((x) => `<button type="button" data-notification="${x.kind}"><i></i><span><b>${esc(x.title)}</b><small>${esc(x.text)}</small></span></button>`).join('') : '<div class="all-clear"><b>Tudo sob controle</b><span>Nenhuma pendência importante agora.</span></div>'}</div>`;
  panel.querySelector('header button')?.addEventListener('click', closePanels); panel.querySelectorAll('[data-notification]').forEach((b) => b.addEventListener('click', () => go(b.dataset.notification)));
}
function updateContext() {
  const content = document.querySelector('.content'); if (!content) return;
  let crumb = content.querySelector('.app-breadcrumb');
  if (!crumb) { crumb = document.createElement('div'); crumb.className = 'app-breadcrumb'; content.prepend(crumb); }
  const active = navButtons().find((b) => b.classList.contains('active'))?.textContent.trim().replace(/\d+$/, '').trim() || 'Visão geral';
  const detail = document.querySelector('.contract-hero h1')?.textContent?.trim();
  crumb.innerHTML = `<button type="button" data-home>Locaio</button><span>›</span><b>${esc(active)}</b>${detail ? `<span>›</span><strong>${esc(detail)}</strong>` : ''}`;
  crumb.querySelector('[data-home]')?.addEventListener('click', () => go('dashboard'));
  enhanceAccessibility();
}
function enhanceAccessibility() {
  navButtons().forEach((b) => { const active = b.classList.contains('active'); if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); const label = b.querySelector('span')?.textContent; if (label) b.title = label; });
}
function restoreSection() {
  const saved = localStorage.getItem(STORAGE.section); if (!saved || saved === 'dashboard') return;
  const button = sectionButton(saved); if (button && !button.classList.contains('active')) button.click();
}
function boot() {
  ensureOverlays(); ensureShell(); updateContext(); restoreSection(); refreshData();
  const observer = new MutationObserver(() => { ensureShell(); updateContext(); });
  observer.observe(document.getElementById('root') || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); } if (e.key === 'Escape') { closeSearch(); closePanels(); } });
  document.addEventListener('click', (e) => { if (!e.target.closest('.notification-panel,.notification-trigger')) closePanels(); });
  refreshTimer = window.setInterval(refreshData, 60000);
  window.addEventListener('beforeunload', () => window.clearInterval(refreshTimer), { once: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0), { once: true }); else setTimeout(boot, 0);
