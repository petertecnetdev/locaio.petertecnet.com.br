import { appApi } from './services/api.js';

const cleanupFns = [];
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
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
  }, 80);
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

function renderAttention(target, data, properties, leases) {
  const overdue = numberValue(data?.overdue_amount, data?.overdue_total);
  const available = properties.filter((property) => ['available', 'vacant'].includes(property?.status)).length;
  const awaiting = leases.filter((lease) => ['draft', 'awaiting_documents', 'awaiting_signature'].includes(lease?.status)).length;
  const expiring = leases.filter((lease) => {
    if (lease?.status !== 'active') return false;
    const days = daysUntil(lease?.ends_on);
    return days !== null && days >= 0 && days <= 30;
  });
  const alerts = [];
  if (overdue > 0) alerts.push({ tone: 'danger', icon: '!', title: 'Recebimentos em atraso', text: 'Há valores vencidos que precisam de acompanhamento.', value: money(overdue) });
  if (expiring.length) alerts.push({ tone: 'warning', icon: '↗', title: 'Contratos perto do vencimento', text: 'Renovação ou encerramento precisa ser planejado nos próximos 30 dias.', value: `${expiring.length}` });
  if (awaiting) alerts.push({ tone: 'warning', icon: '…', title: 'Contratos incompletos', text: 'Existem locações aguardando documentos, assinatura ou finalização.', value: `${awaiting}` });
  if (available) alerts.push({ tone: '', icon: '⌂', title: 'Imóveis disponíveis', text: 'Patrimônio sem contrato ativo pode representar receita ociosa.', value: `${available}` });

  const section = panel('Precisa da sua atenção', 'Prioridades da carteira reunidas em um só lugar.', alerts.length ? { text: `${alerts.length} ponto${alerts.length > 1 ? 's' : ''}`, className: alerts.some((alert) => alert.tone === 'danger') ? 'danger' : 'warning' } : { text: 'Tudo certo' });
  const list = node('div', 'dashboard-attention');
  if (!alerts.length) {
    const empty = node('div', 'dashboard-empty-attention');
    empty.append(node('b', '', 'Nenhuma pendência crítica agora.'), node('span', '', 'Continue acompanhando cobranças e vencimentos pela Visão Geral.'));
    list.append(empty);
  } else {
    alerts.forEach((alert) => {
      const item = node('div', `dashboard-alert ${alert.tone}`.trim());
      const icon = node('span', 'dashboard-alert-icon', alert.icon);
      const copy = node('div');
      copy.append(node('b', '', alert.title), node('small', '', alert.text));
      item.append(icon, copy, node('span', 'dashboard-alert-value', alert.value));
      list.append(item);
    });
  }
  section.append(list);
  target.append(section);
}

function renderFinancial(target, data, leases) {
  const active = leases.filter((lease) => lease?.status === 'active');
  const expectedFromLeases = active.reduce((sum, lease) => sum + numberValue(lease?.rent_amount), 0);
  const pending = numberValue(data?.pending_amount, data?.pending_total);
  const overdue = numberValue(data?.overdue_amount, data?.overdue_total);
  const received = numberValue(data?.received_amount, data?.paid_amount, data?.collected_amount);
  const expected = numberValue(data?.expected_amount, data?.forecast_amount, received + pending + overdue, expectedFromLeases);
  const effectiveReceived = received || Math.max(expected - pending - overdue, 0);
  const percentage = expected > 0 ? Math.min(100, Math.max(0, Math.round((effectiveReceived / expected) * 100))) : 0;

  const section = panel('Resumo financeiro', 'Leitura rápida do fluxo de recebimentos da carteira.', { text: expected ? `${percentage}% recebido` : 'Sem projeção' });
  const metrics = node('div', 'dashboard-financial');
  [['Previsto', expected], ['Recebido', effectiveReceived], ['Pendente + atraso', pending + overdue]].forEach(([label, value]) => {
    const item = node('div', 'dashboard-financial-item');
    item.append(node('small', '', label), node('strong', '', money(value)));
    metrics.append(item);
  });
  const progress = node('div', 'dashboard-progress');
  const fill = node('span'); fill.style.width = `${percentage}%`; progress.append(fill);
  const progressCopy = node('div', 'dashboard-progress-copy');
  progressCopy.append(node('span', '', expected ? 'Recebimento realizado sobre o valor previsto' : 'A projeção aparecerá conforme houver cobranças'), node('b', '', expected ? `${percentage}%` : '—'));
  section.append(metrics, progress, progressCopy);
  target.append(section);
}

function renderOccupancy(target, properties) {
  const total = properties.length;
  const groups = [
    ['Ocupados', properties.filter((item) => item?.status === 'occupied').length],
    ['Disponíveis', properties.filter((item) => ['available', 'vacant'].includes(item?.status)).length],
    ['Manutenção', properties.filter((item) => ['maintenance', 'unavailable'].includes(item?.status)).length],
    ['Outros', properties.filter((item) => !['occupied', 'available', 'vacant', 'maintenance', 'unavailable'].includes(item?.status)).length],
  ].filter(([, count]) => count > 0 || total === 0);
  const section = panel('Ocupação dos imóveis', 'Distribuição atual do patrimônio cadastrado.', { text: `${total} imóve${total === 1 ? 'l' : 'is'}` });
  const list = node('div', 'dashboard-occupancy');
  groups.forEach(([label, count]) => {
    const row = node('div', 'dashboard-bar-row');
    const bar = node('div', 'dashboard-bar');
    const fill = node('i'); fill.style.width = `${total ? Math.round((count / total) * 100) : 0}%`; bar.append(fill);
    row.append(node('span', '', label), bar, node('strong', '', `${count}`));
    list.append(row);
  });
  section.append(list);
  target.append(section);
}

function renderLeaseHealth(target, leases) {
  const counts = {
    active: leases.filter((item) => item?.status === 'active').length,
    draft: leases.filter((item) => ['draft', 'awaiting_documents'].includes(item?.status)).length,
    signing: leases.filter((item) => item?.status === 'awaiting_signature').length,
    ended: leases.filter((item) => ['ended', 'cancelled'].includes(item?.status)).length,
  };
  const section = panel('Saúde dos contratos', 'Status da jornada contratual sem precisar abrir cada locação.');
  const grid = node('div', 'dashboard-lease-health');
  [['Ativos', counts.active], ['Em preparação', counts.draft], ['Assinatura', counts.signing], ['Encerrados', counts.ended]].forEach(([label, value]) => {
    const item = node('div', 'dashboard-health-item');
    item.append(node('strong', '', `${value}`), node('span', '', label));
    grid.append(item);
  });
  section.append(grid);
  target.append(section);
}

function renderQuickActions(target) {
  const section = panel('Ações rápidas', 'Atalhos para as tarefas mais frequentes.');
  const grid = node('div', 'dashboard-quick-actions');
  const actions = [
    ['Novo imóvel', 'Cadastrar patrimônio', () => clickNavigation('Imóveis', 'Novo imóvel')],
    ['Nova locação', 'Criar contrato', () => clickNavigation('Locações', 'Nova locação')],
    ['Ver imóveis', 'Gerenciar patrimônio', () => clickNavigation('Imóveis')],
    ['Ver contratos', 'Acompanhar locações', () => clickNavigation('Locações')],
  ];
  actions.forEach(([title, subtitle, handler]) => {
    const button = node('button', 'dashboard-action');
    button.type = 'button';
    button.append(node('b', '', title), node('small', '', subtitle));
    button.addEventListener('click', handler);
    grid.append(button);
  });
  section.append(grid);
  target.append(section);
}

function renderOverview(page, payload) {
  if (!page || page.querySelector('[data-dashboard-ops="true"]')) return;
  const stats = page.querySelector('.stats');
  const existingGrid = page.querySelector('.grid-2');
  if (!stats || !existingGrid) return;
  const properties = Array.isArray(payload.properties) ? payload.properties : [];
  const leases = Array.isArray(payload.leases) ? payload.leases : [];
  const data = payload.dashboard || {};

  const container = node('div', 'dashboard-ops');
  container.dataset.dashboardOps = 'true';
  const firstGrid = node('div', 'dashboard-ops-grid');
  renderAttention(firstGrid, data, properties, leases);
  renderFinancial(firstGrid, data, leases);
  container.append(firstGrid);
  const secondGrid = node('div', 'dashboard-ops-grid');
  renderOccupancy(secondGrid, properties);
  renderLeaseHealth(secondGrid, leases);
  container.append(secondGrid);
  renderQuickActions(container);
  existingGrid.parentNode.insertBefore(container, existingGrid);
}

function installOperationalOverview() {
  let cache = null;
  let cacheAt = 0;
  let loading = false;
  const load = async () => {
    const page = isOverviewPage();
    if (!page || page.querySelector('[data-dashboard-ops="true"]') || !localStorage.getItem('token')) return;
    const fresh = cache && Date.now() - cacheAt < 30000;
    if (fresh) { renderOverview(page, cache); return; }
    if (loading) return;
    loading = true;
    try {
      const [dashboardResponse, propertiesResponse, leasesResponse] = await Promise.all([
        appApi.get('/leasing/dashboard'),
        appApi.get('/properties'),
        appApi.get('/leases'),
      ]);
      cache = {
        dashboard: dashboardResponse?.data || {},
        properties: propertiesResponse?.data || [],
        leases: leasesResponse?.data || [],
      };
      cacheAt = Date.now();
      renderOverview(isOverviewPage(), cache);
    } catch {
      // The base dashboard remains fully functional if enrichment data is unavailable.
    } finally {
      loading = false;
    }
  };
  const observer = new MutationObserver(load);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('authChanged', () => { cache = null; cacheAt = 0; load(); });
  load();
  cleanupFns.push(() => observer.disconnect());
}

export function installVisualEnhancements() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  const root = document.documentElement;
  const body = document.body;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  const updateScrollState = () => {
    root.dataset.scrolled = window.scrollY > 12 ? 'true' : 'false';
  };

  const updatePointer = (event) => {
    if (reducedMotion?.matches) return;
    root.style.setProperty('--pointer-x', `${event.clientX}px`);
    root.style.setProperty('--pointer-y', `${event.clientY}px`);
  };

  const updateInputMode = (event) => {
    if (event.key === 'Tab') body.dataset.inputMode = 'keyboard';
  };

  const usePointerMode = () => {
    body.dataset.inputMode = 'pointer';
  };

  updateScrollState();
  window.addEventListener('scroll', updateScrollState, { passive: true });
  window.addEventListener('pointermove', updatePointer, { passive: true });
  window.addEventListener('keydown', updateInputMode);
  window.addEventListener('pointerdown', usePointerMode, { passive: true });
  installOperationalOverview();

  cleanupFns.push(
    () => window.removeEventListener('scroll', updateScrollState),
    () => window.removeEventListener('pointermove', updatePointer),
    () => window.removeEventListener('keydown', updateInputMode),
    () => window.removeEventListener('pointerdown', usePointerMode),
  );

  return () => {
    while (cleanupFns.length) cleanupFns.pop()?.();
  };
}
