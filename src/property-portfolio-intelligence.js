import { appApi } from './services/api.js';

const state = { installed: false, loading: false, items: [], health: 'all', issue: 'all', tag: 'all', scheduled: false, lastFetch: 0 };
const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(value || 0));
const findPage = () => [...document.querySelectorAll('.pt-page')].find((p) => normalize(p.querySelector('.pt-page-header h1')?.textContent) === 'imoveis');
const propertyIdOf = (card) => Number(card.dataset.propertyId || card.querySelector('[data-pw-open]')?.dataset.pwOpen || card.querySelector('[data-pm-edit]')?.dataset.pmEdit);

const fetchPortfolio = async (force = false) => {
  if (state.loading || !localStorage.getItem('token')) return;
  if (!force && Date.now() - state.lastFetch < 15000 && state.items.length) return;
  state.loading = true;
  try {
    const { data } = await appApi.get('/assets/property/portfolio');
    state.items = data?.items || [];
    state.lastFetch = Date.now();
  } catch { /* original portfolio remains usable */ }
  finally { state.loading = false; }
};

const tags = () => [...new Set(state.items.flatMap((item) => item.tags || []))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
const summary = () => {
  const total = state.items.length;
  const avgHealth = total ? Math.round(state.items.reduce((s, i) => s + Number(i.health?.score || 0), 0) / total) : 0;
  const net = state.items.reduce((s, i) => s + Number(i.net_result_12m || 0), 0);
  const critical = state.items.filter((i) => Number(i.critical_alert_count || 0) > 0).length;
  const overdue = state.items.reduce((s, i) => s + Number(i.overdue_amount || 0), 0);
  return { total, avgHealth, net, critical, overdue };
};

const renderHost = (page) => {
  let host = page.querySelector('[data-pi-portfolio]');
  const s = summary();
  const tagOptions = tags().map((tag) => `<option value="${tag.replaceAll('"', '&quot;')}">${tag}</option>`).join('');
  const html = `<section class="pi-portfolio-panel">
    <div class="pi-portfolio-head"><div><span>Inteligência patrimonial</span><h2>Saúde e resultado da carteira</h2><p>Priorize os imóveis por retorno, risco e pendências operacionais.</p></div><button type="button" data-pi-refresh>↻ Atualizar inteligência</button></div>
    <div class="pi-portfolio-metrics"><article><small>Saúde média</small><strong>${s.avgHealth}<em>/100</em></strong></article><article><small>Resultado líquido · 12m</small><strong class="${s.net >= 0 ? 'positive' : 'negative'}">${money(s.net)}</strong></article><article><small>Críticos</small><strong>${s.critical}</strong><p>imóveis com alerta crítico</p></article><article><small>Em atraso</small><strong class="${s.overdue > 0 ? 'negative' : 'positive'}">${money(s.overdue)}</strong></article></div>
    <div class="pi-portfolio-filters"><label>Saúde<select data-pi-health><option value="all">Todas</option><option value="excellent">Excelente · 90+</option><option value="good">Boa · 75–89</option><option value="attention">Atenção · 60–74</option><option value="critical">Crítica · até 59</option></select></label><label>Situação<select data-pi-issue><option value="all">Todas</option><option value="overdue">Com inadimplência</option><option value="maintenance">Com manutenção</option><option value="alerts">Com alertas</option><option value="healthy">Sem alerta crítico</option></select></label><label>Tag<select data-pi-tag><option value="all">Todas as tags</option>${tagOptions}</select></label><span data-pi-count></span></div>
  </section>`;
  if (!host) { host = document.createElement('div'); host.dataset.piPortfolio = 'true'; const pm = page.querySelector('[data-pm-property-management]'); if (pm) pm.insertAdjacentElement('afterend', host); else page.querySelector('.pt-page-header')?.insertAdjacentElement('afterend', host); }
  host.innerHTML = html;
  host.querySelector('[data-pi-health]').value = state.health; host.querySelector('[data-pi-issue]').value = state.issue; host.querySelector('[data-pi-tag]').value = state.tag;
  host.querySelector('[data-pi-health]').addEventListener('change', (e) => { state.health = e.currentTarget.value; apply(page); });
  host.querySelector('[data-pi-issue]').addEventListener('change', (e) => { state.issue = e.currentTarget.value; apply(page); });
  host.querySelector('[data-pi-tag]').addEventListener('change', (e) => { state.tag = e.currentTarget.value; apply(page); });
  host.querySelector('[data-pi-refresh]').addEventListener('click', async () => { state.lastFetch = 0; await fetchPortfolio(true); renderHost(page); apply(page); });
};

const decorate = (card, item) => {
  if (!item) return;
  card.dataset.piHealth = item.health?.grade || '';
  let panel = card.querySelector('[data-pi-card]');
  if (!panel) { panel = document.createElement('section'); panel.dataset.piCard = 'true'; panel.className = 'pi-card-intelligence'; card.querySelector('.pt-card-actions')?.insertAdjacentElement('beforebegin', panel); }
  const alertCount = Number(item.alert_count || 0);
  panel.innerHTML = `<div class="pi-health-chip grade-${item.health?.grade || 'good'}"><strong>${item.health?.score ?? '—'}</strong><span>Saúde</span></div><div class="pi-card-stat"><small>Resultado 12m</small><b class="${Number(item.net_result_12m) >= 0 ? 'positive' : 'negative'}">${money(item.net_result_12m)}</b></div><div class="pi-card-stat"><small>Alertas</small><b>${alertCount}${Number(item.critical_alert_count) ? ` · <em>${item.critical_alert_count} crítico</em>` : ''}</b></div><div class="pi-card-tags">${(item.tags || []).slice(0, 3).map((tag) => `<span>${tag}</span>`).join('')}</div>`;
  const manage = card.querySelector('[data-pw-open]'); if (manage) manage.innerHTML = '<span aria-hidden="true">⌁</span> Inteligência & gestão';
};

const matches = (item) => {
  if (!item) return true;
  if (state.health !== 'all' && item.health?.grade !== state.health) return false;
  if (state.tag !== 'all' && !(item.tags || []).includes(state.tag)) return false;
  if (state.issue === 'overdue' && Number(item.overdue_amount || 0) <= 0) return false;
  if (state.issue === 'maintenance' && Number(item.open_maintenance || 0) <= 0) return false;
  if (state.issue === 'alerts' && Number(item.alert_count || 0) <= 0) return false;
  if (state.issue === 'healthy' && Number(item.critical_alert_count || 0) > 0) return false;
  return true;
};

const apply = (page) => {
  const map = new Map(state.items.map((i) => [Number(i.id), i])); let visible = 0;
  page.querySelectorAll('.pt-property-card').forEach((card) => { const item = map.get(propertyIdOf(card)); if (item) decorate(card, item); const show = matches(item); card.dataset.piHidden = show ? 'false' : 'true'; if (show) visible += 1; });
  const count = page.querySelector('[data-pi-count]'); if (count) count.textContent = `${visible} imóvel(is) após filtros de inteligência`;
};

const enhance = async () => {
  const page = findPage(); if (!page) return;
  await fetchPortfolio(); if (!state.items.length) return;
  renderHost(page); apply(page);
};
const schedule = () => { if (state.scheduled) return; state.scheduled = true; requestAnimationFrame(async () => { state.scheduled = false; await enhance(); }); };

export function installPropertyPortfolioIntelligence() {
  if (state.installed || typeof window === 'undefined') return; state.installed = true;
  const observer = new MutationObserver((mutations) => { if (mutations.some((m) => [...m.addedNodes].some((n) => n instanceof Element && (n.matches?.('.pt-property-card,.pt-property-grid,[data-pm-property-management]') || n.querySelector?.('.pt-property-card'))))) schedule(); });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('authChanged', () => { state.items = []; state.lastFetch = 0; schedule(); });
  schedule();
}
