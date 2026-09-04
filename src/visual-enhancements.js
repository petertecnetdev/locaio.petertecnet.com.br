import { appApi } from './services/api.js';

const cleanupFns = [];
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const dateLabel = (value) => value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`)) : '—';
const numberValue = (...values) => {
  const found = values.find((value) => value !== undefined && value !== null && value !== '');
  return Number(found || 0);
};
const daysUntil = (value) => {
  if (!value) return null;
  const target = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  const today = new Date(); today.setHours(12, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
};
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

function isOverviewPage() {
  const page = document.querySelector('.content .page');
  if (!page) return null;
  const eyebrow = page.querySelector('.page-head .eyebrow');
  return eyebrow?.textContent?.trim().toLowerCase() === 'visão geral' ? page : null;
}

function clickNavigation(label, createLabel) {
  const buttons = [...document.querySelectorAll('.sidebar nav button, .mobile-nav button')];
  const target = buttons.find((button) => button.textContent.trim().toLowerCase().includes(label.toLowerCase()));
  target?.click();
  if (!createLabel) return;
  window.setTimeout(() => {
    const actions = [...document.querySelectorAll('.content .page button')];
    actions.find((button) => button.textContent.trim().toLowerCase().includes(createLabel.toLowerCase()))?.click();
  }, 100);
}

function panel(title, description, badge) {
  const section = node('section', 'dashboard-panel');
  const head = node('div', 'dashboard-panel-head');
  const copy = node('div');
  copy.append(node('h2', '', title), node('p', '', description));
  head.append(copy);
  if (badge) head.append(node('span', `dashboard-pill ${badge.className || ''}`.trim(), badge.text));
  section.append(head);
  return section;
}

function fallbackAnalytics(data, properties, leases) {
  const overdue = numberValue(data?.overdue_amount, data?.overdue_total);
  const pending = numberValue(data?.pending_amount, data?.pending_total);
  const occupied = properties.filter((p) => p?.status === 'occupied').length;
  const available = properties.filter((p) => ['available', 'vacant'].includes(p?.status)).length;
  const maintenance = properties.filter((p) => ['maintenance', 'unavailable'].includes(p?.status)).length;
  const awaitingDocuments = leases.filter((l) => ['draft', 'awaiting_documents'].includes(l?.status));
  const awaitingSignature = leases.filter((l) => l?.status === 'awaiting_signature');
  const expiring = leases.filter((l) => {
    if (l?.status !== 'active') return false;
    const days = daysUntil(l?.ends_on);
    return days !== null && days >= 0 && days <= 30;
  });
  const issues = [];
  if (overdue > 0) issues.push({ type: 'overdue', severity: 'critical', title: 'Recebimentos em atraso', amount: overdue, count: 1 });
  if (expiring.length) issues.push({ type: 'expiring_contracts', severity: 'warning', title: 'Contratos vencendo em até 30 dias', count: expiring.length });
  if (awaitingDocuments.length) issues.push({ type: 'documents', severity: 'warning', title: 'Locações aguardando documentação', count: awaitingDocuments.length });
  if (awaitingSignature.length) issues.push({ type: 'signatures', severity: 'warning', title: 'Contratos aguardando assinatura', count: awaitingSignature.length });
  if (available) issues.push({ type: 'vacancy', severity: 'info', title: 'Imóveis disponíveis', count: available });
  const score = Math.max(0, 100 - Math.min(100, (overdue > 0 ? 35 : 0) + expiring.length * 8 + awaitingDocuments.length * 5 + awaitingSignature.length * 4 + available * 3));
  const nextCharges = Array.isArray(data?.next_charges) ? data.next_charges : [];
  const cashFlow = [7, 30, 60, 90].map((days) => ({
    horizon_days: days,
    expected_amount: nextCharges.filter((c) => { const d = daysUntil(c?.due_date); return d !== null && d >= 0 && d <= days; }).reduce((sum, c) => sum + numberValue(c?.amount), 0),
  }));
  const calendar = [
    ...nextCharges.map((c) => ({ id: `charge-${c.id}`, type: 'charge', date: c.due_date, title: c.description || 'Cobrança', amount: numberValue(c.amount), severity: 'normal' })),
    ...leases.filter((l) => { const d = daysUntil(l?.ends_on); return d !== null && d >= 0 && d <= 90; }).map((l) => ({ id: `lease-${l.id}`, type: 'contract_expiration', date: l.ends_on, title: `Fim do contrato · ${l.tenant_name || l.property_name || `#${l.id}`}`, amount: null, severity: daysUntil(l.ends_on) <= 30 ? 'warning' : 'normal' })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return {
    summary: { properties: properties.length, occupied_properties: occupied, available_properties: available, maintenance_properties: maintenance, active_contracts: leases.filter((l) => l?.status === 'active').length, pending_amount: pending, overdue_amount: overdue, received_this_year: numberValue(data?.received_this_year, data?.received_amount) },
    health: { score, level: score >= 85 ? 'excellent' : score >= 65 ? 'attention' : 'critical', issues },
    cash_flow: cashFlow,
    calendar,
    series: { monthly_cash_flow: [] },
    occupancy: { total: properties.length, occupied, available, maintenance },
    documents: { pending_count: awaitingDocuments.length, leases: awaitingDocuments.map((l) => ({ lease_id: l.id, tenant_name: l.tenant_name, status: l.status })) },
    actions: issues.map((issue, index) => ({ type: issue.type, label: issue.type === 'overdue' ? 'Revisar atrasos' : issue.type === 'expiring_contracts' ? 'Revisar renovações' : issue.type === 'documents' ? 'Completar documentos' : issue.type === 'vacancy' ? 'Criar nova locação' : 'Revisar contratos', target: 'leases', priority: index + 1 })),
  };
}

function renderHealthScore(target, analytics) {
  const health = analytics?.health || {};
  const score = Number(health.score ?? 100);
  const tone = score >= 85 ? 'excellent' : score >= 65 ? 'warning' : 'danger';
  const section = panel('Saúde da carteira', 'Um indicador único para localizar risco operacional rapidamente.', { text: score >= 85 ? 'Saudável' : score >= 65 ? 'Atenção' : 'Crítico', className: tone === 'warning' ? 'warning' : tone === 'danger' ? 'danger' : '' });
  const wrap = node('div', 'dashboard-score-wrap');
  const gauge = node('div', `dashboard-score ${tone}`);
  gauge.style.setProperty('--score', `${Math.max(0, Math.min(100, score)) * 3.6}deg`);
  const center = node('div'); center.append(node('strong', '', `${score}`), node('small', '', '/ 100')); gauge.append(center);
  const copy = node('div', 'dashboard-score-copy');
  copy.append(node('b', '', score >= 85 ? 'Carteira sob controle' : score >= 65 ? 'Alguns pontos precisam de ação' : 'Prioridades críticas encontradas'));
  const issueCount = Array.isArray(health.issues) ? health.issues.length : 0;
  copy.append(node('p', '', issueCount ? `${issueCount} frente${issueCount > 1 ? 's' : ''} de atenção influencia${issueCount === 1 ? '' : 'm'} este indicador.` : 'Nenhuma pendência relevante encontrada agora.'));
  wrap.append(gauge, copy); section.append(wrap); target.append(section);
}

function renderAttention(target, analytics) {
  const issues = Array.isArray(analytics?.health?.issues) ? analytics.health.issues : [];
  const section = panel('Precisa da sua atenção', 'Prioridades da carteira reunidas em um só lugar.', issues.length ? { text: `${issues.length} ponto${issues.length > 1 ? 's' : ''}`, className: issues.some((i) => i.severity === 'critical') ? 'danger' : 'warning' } : { text: 'Tudo certo' });
  const list = node('div', 'dashboard-attention');
  if (!issues.length) {
    const empty = node('div', 'dashboard-empty-attention'); empty.append(node('b', '', 'Nenhuma pendência crítica agora.'), node('span', '', 'Continue acompanhando cobranças, contratos e documentos.')); list.append(empty);
  } else {
    issues.slice(0, 6).forEach((issue) => {
      const tone = issue.severity === 'critical' ? 'danger' : issue.severity === 'warning' ? 'warning' : '';
      const item = node('button', `dashboard-alert ${tone} clickable`.trim()); item.type = 'button';
      const icon = node('span', 'dashboard-alert-icon', tone === 'danger' ? '!' : tone === 'warning' ? '↗' : '•');
      const copy = node('div'); copy.append(node('b', '', issue.title || 'Pendência'), node('small', '', issue.amount ? `${money(issue.amount)} exige acompanhamento.` : `${issue.count || 1} item(ns) relacionado(s).`));
      item.append(icon, copy, node('span', 'dashboard-alert-value', issue.amount ? money(issue.amount) : `${issue.count || 1}`));
      item.addEventListener('click', () => clickNavigation(issue.type === 'vacancy' ? 'Imóveis' : 'Locações'));
      list.append(item);
    });
  }
  section.append(list); target.append(section);
}

function renderFinancial(target, data, leases, analytics) {
  const summary = analytics?.summary || {};
  const active = leases.filter((lease) => lease?.status === 'active');
  const expectedFromLeases = active.reduce((sum, lease) => sum + numberValue(lease?.rent_amount), 0);
  const pending = numberValue(summary.pending_amount, data?.pending_amount);
  const overdue = numberValue(summary.overdue_amount, data?.overdue_amount);
  const received = numberValue(summary.received_this_year, data?.received_this_year, data?.received_amount);
  const expected = numberValue(summary.expected_this_year, data?.expected_amount, received + pending + overdue, expectedFromLeases);
  const percentage = expected > 0 ? Math.min(100, Math.max(0, Math.round((received / expected) * 100))) : 0;
  const section = panel('Resumo financeiro', 'Previsto, recebido e valores que ainda exigem acompanhamento.', { text: expected ? `${percentage}% recebido` : 'Sem projeção' });
  const metrics = node('div', 'dashboard-financial');
  [['Previsto', expected], ['Recebido', received], ['Pendente + atraso', pending + overdue]].forEach(([label, value]) => { const item = node('div', 'dashboard-financial-item'); item.append(node('small', '', label), node('strong', '', money(value))); metrics.append(item); });
  const progress = node('div', 'dashboard-progress'); const fill = node('span'); fill.style.width = `${percentage}%`; progress.append(fill);
  const progressCopy = node('div', 'dashboard-progress-copy'); progressCopy.append(node('span', '', 'Recebimento realizado sobre o valor previsto'), node('b', '', expected ? `${percentage}%` : '—'));
  section.append(metrics, progress, progressCopy); target.append(section);
}

function renderCashProjection(target, analytics) {
  const rows = Array.isArray(analytics?.cash_flow) ? analytics.cash_flow : [];
  const section = panel('Projeção de caixa', 'Entradas previstas para apoiar decisões de curto e médio prazo.', { text: '90 dias' });
  const grid = node('div', 'dashboard-projection');
  rows.forEach((row) => {
    const item = node('div', 'dashboard-projection-item');
    item.append(node('small', '', `Próximos ${row.horizon_days} dias`), node('strong', '', money(row.net_amount ?? row.expected_amount)), node('span', '', 'entrada prevista'));
    grid.append(item);
  });
  if (!rows.length) grid.append(node('p', 'dashboard-muted', 'A projeção aparecerá conforme houver cobranças agendadas.'));
  section.append(grid); target.append(section);
}

function renderCalendar(target, analytics) {
  const events = Array.isArray(analytics?.calendar) ? analytics.calendar.slice(0, 10) : [];
  const section = panel('Calendário financeiro e contratual', 'Cobranças, vencimentos e marcos de contrato em ordem cronológica.', { text: 'Próximos 90 dias' });
  const list = node('div', 'dashboard-calendar');
  if (!events.length) list.append(node('p', 'dashboard-muted', 'Nenhum marco próximo encontrado.'));
  events.forEach((event) => {
    const row = node('button', `dashboard-calendar-row ${event.severity || ''}`.trim()); row.type = 'button';
    const when = node('span', 'dashboard-calendar-date', dateLabel(event.date));
    const copy = node('div'); copy.append(node('b', '', event.title || 'Evento'), node('small', '', event.type === 'charge' ? 'Financeiro' : 'Contrato'));
    row.append(when, copy, node('strong', '', event.amount !== null && event.amount !== undefined ? money(event.amount) : '')); row.addEventListener('click', () => clickNavigation('Locações')); list.append(row);
  });
  section.append(list); target.append(section);
}

function renderHistoricalChart(target, analytics) {
  const series = Array.isArray(analytics?.series?.monthly_cash_flow) ? analytics.series.monthly_cash_flow : [];
  const section = panel('Evolução dos recebimentos', 'Previsto x recebido nos últimos meses.', { text: series.length ? `${series.length} meses` : 'Histórico' });
  if (!series.length) {
    const empty = node('div', 'dashboard-chart-empty'); empty.append(node('b', '', 'Histórico sendo preparado'), node('span', '', 'A série mensal ficará disponível assim que o analytics genérico estiver ativo na API.')); section.append(empty); target.append(section); return;
  }
  const max = Math.max(1, ...series.flatMap((row) => [numberValue(row.expected), numberValue(row.received)]));
  const chart = node('div', 'dashboard-chart');
  series.forEach((row) => {
    const col = node('div', 'dashboard-chart-column');
    const bars = node('div', 'dashboard-chart-bars');
    const expected = node('i', 'expected'); expected.style.height = `${Math.max(3, (numberValue(row.expected) / max) * 100)}%`; expected.title = `Previsto: ${money(row.expected)}`;
    const received = node('i', 'received'); received.style.height = `${Math.max(3, (numberValue(row.received) / max) * 100)}%`; received.title = `Recebido: ${money(row.received)}`;
    bars.append(expected, received); col.append(bars, node('small', '', row.label || row.month)); chart.append(col);
  });
  const legend = node('div', 'dashboard-chart-legend'); legend.append(node('span', 'expected', 'Previsto'), node('span', 'received', 'Recebido'));
  section.append(chart, legend); target.append(section);
}

function renderOccupancy(target, properties, analytics) {
  const occupancy = analytics?.occupancy || {};
  const total = numberValue(occupancy.total, properties.length);
  const groups = [
    ['Ocupados', numberValue(occupancy.occupied, properties.filter((p) => p?.status === 'occupied').length)],
    ['Disponíveis', numberValue(occupancy.available, properties.filter((p) => ['available', 'vacant'].includes(p?.status)).length)],
    ['Manutenção', numberValue(occupancy.maintenance, properties.filter((p) => ['maintenance', 'unavailable'].includes(p?.status)).length)],
  ];
  const section = panel('Ocupação dos imóveis', 'Distribuição atual do patrimônio cadastrado.', { text: `${total} imóve${total === 1 ? 'l' : 'is'}` });
  const list = node('div', 'dashboard-occupancy');
  groups.forEach(([label, count]) => { const row = node('div', 'dashboard-bar-row'); const bar = node('div', 'dashboard-bar'); const fill = node('i'); fill.style.width = `${total ? Math.round((count / total) * 100) : 0}%`; bar.append(fill); row.append(node('span', '', label), bar, node('strong', '', `${count}`)); list.append(row); });
  section.append(list); target.append(section);
}

function renderDocuments(target, analytics) {
  const documents = analytics?.documents || {};
  const leases = Array.isArray(documents.leases) ? documents.leases : [];
  const count = numberValue(documents.pending_count, leases.length);
  const section = panel('Pendências documentais', 'Locações que ainda não estão prontas para seguir sem intervenção.', { text: count ? `${count} pendente${count === 1 ? '' : 's'}` : 'Em dia', className: count ? 'warning' : '' });
  const list = node('div', 'dashboard-document-list');
  if (!leases.length) list.append(node('p', 'dashboard-muted', 'Nenhuma locação aguardando documentação.'));
  leases.slice(0, 6).forEach((lease) => {
    const row = node('button', 'dashboard-document-row'); row.type = 'button';
    const copy = node('div'); copy.append(node('b', '', lease.tenant_name || `Locação #${lease.lease_id}`), node('small', '', lease.status === 'draft' ? 'Contrato em preparação' : 'Aguardando documentos'));
    row.append(copy, node('span', '', 'Resolver →')); row.addEventListener('click', () => clickNavigation('Locações')); list.append(row);
  });
  section.append(list); target.append(section);
}

function renderContextActions(target, analytics) {
  const section = panel('Próximas ações', 'Atalhos contextuais definidos pelo estado atual da carteira.');
  const grid = node('div', 'dashboard-quick-actions');
  const dynamic = Array.isArray(analytics?.actions) ? analytics.actions : [];
  const actions = dynamic.length ? dynamic.slice(0, 4).map((action) => [action.label, action.type === 'collect' ? 'Cobranças pendentes' : action.type === 'renew' ? 'Contratos próximos do fim' : action.type === 'documents' ? 'Completar locações' : 'Oportunidade operacional', () => clickNavigation(action.target === 'properties' ? 'Imóveis' : 'Locações', action.type === 'lease' ? 'Nova locação' : null)]) : [
    ['Novo imóvel', 'Cadastrar patrimônio', () => clickNavigation('Imóveis', 'Novo imóvel')],
    ['Nova locação', 'Criar contrato', () => clickNavigation('Locações', 'Nova locação')],
    ['Ver imóveis', 'Gerenciar patrimônio', () => clickNavigation('Imóveis')],
    ['Ver contratos', 'Acompanhar locações', () => clickNavigation('Locações')],
  ];
  actions.forEach(([title, subtitle, handler]) => { const button = node('button', 'dashboard-action'); button.type = 'button'; button.append(node('b', '', title), node('small', '', subtitle)); button.addEventListener('click', handler); grid.append(button); });
  section.append(grid); target.append(section);
}

function renderOverview(page, payload) {
  if (!page || page.querySelector('[data-dashboard-ops="true"]')) return;
  const existingGrid = page.querySelector('.grid-2');
  if (!page.querySelector('.stats') || !existingGrid) return;
  const properties = Array.isArray(payload.properties) ? payload.properties : [];
  const leases = Array.isArray(payload.leases) ? payload.leases : [];
  const data = payload.dashboard || {};
  const analytics = payload.analytics || fallbackAnalytics(data, properties, leases);
  const container = node('div', 'dashboard-ops'); container.dataset.dashboardOps = 'true';
  const heroGrid = node('div', 'dashboard-ops-grid'); renderHealthScore(heroGrid, analytics); renderAttention(heroGrid, analytics); container.append(heroGrid);
  const financeGrid = node('div', 'dashboard-ops-grid'); renderFinancial(financeGrid, data, leases, analytics); renderCashProjection(financeGrid, analytics); container.append(financeGrid);
  const planningGrid = node('div', 'dashboard-ops-grid'); renderCalendar(planningGrid, analytics); renderHistoricalChart(planningGrid, analytics); container.append(planningGrid);
  const operationsGrid = node('div', 'dashboard-ops-grid'); renderOccupancy(operationsGrid, properties, analytics); renderDocuments(operationsGrid, analytics); container.append(operationsGrid);
  renderContextActions(container, analytics);
  existingGrid.parentNode.insertBefore(container, existingGrid);
}

function installOperationalOverview() {
  let cache = null; let cacheAt = 0; let loading = false;
  const load = async () => {
    const page = isOverviewPage();
    if (!page || page.querySelector('[data-dashboard-ops="true"]') || !localStorage.getItem('token')) return;
    if (cache && Date.now() - cacheAt < 30000) { renderOverview(page, cache); return; }
    if (loading) return;
    loading = true;
    try {
      const [dashboardResponse, propertiesResponse, leasesResponse, analyticsResponse] = await Promise.all([
        appApi.get('/leasing/dashboard'), appApi.get('/properties'), appApi.get('/leases'), appApi.get('/analytics/portfolio').catch(() => ({ data: null })),
      ]);
      cache = { dashboard: dashboardResponse?.data || {}, properties: propertiesResponse?.data || [], leases: leasesResponse?.data || [], analytics: analyticsResponse?.data || null };
      cacheAt = Date.now(); renderOverview(isOverviewPage(), cache);
    } catch {
      // Base dashboard remains functional when enrichment resources are unavailable.
    } finally { loading = false; }
  };
  const observer = new MutationObserver(load); observer.observe(document.body, { childList: true, subtree: true });
  const authHandler = () => { cache = null; cacheAt = 0; load(); };
  window.addEventListener('authChanged', authHandler); load();
  cleanupFns.push(() => observer.disconnect(), () => window.removeEventListener('authChanged', authHandler));
}

export function installVisualEnhancements() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const root = document.documentElement; const body = document.body; const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const updateScrollState = () => { root.dataset.scrolled = window.scrollY > 12 ? 'true' : 'false'; };
  const updatePointer = (event) => { if (!reducedMotion?.matches) { root.style.setProperty('--pointer-x', `${event.clientX}px`); root.style.setProperty('--pointer-y', `${event.clientY}px`); } };
  const updateInputMode = (event) => { if (event.key === 'Tab') body.dataset.inputMode = 'keyboard'; };
  const usePointerMode = () => { body.dataset.inputMode = 'pointer'; };
  updateScrollState(); window.addEventListener('scroll', updateScrollState, { passive: true }); window.addEventListener('pointermove', updatePointer, { passive: true }); window.addEventListener('keydown', updateInputMode); window.addEventListener('pointerdown', usePointerMode, { passive: true }); installOperationalOverview();
  cleanupFns.push(() => window.removeEventListener('scroll', updateScrollState), () => window.removeEventListener('pointermove', updatePointer), () => window.removeEventListener('keydown', updateInputMode), () => window.removeEventListener('pointerdown', usePointerMode));
  return () => { while (cleanupFns.length) cleanupFns.pop()?.(); };
}
