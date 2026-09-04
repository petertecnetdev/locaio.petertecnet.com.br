import { appApi, errorMessage } from './services/api.js';

const STATUS_LABELS = { available: 'Disponível', occupied: 'Ocupado', maintenance: 'Manutenção', inactive: 'Inativo' };
const TYPE_LABELS = { house: 'Casa', apartment: 'Apartamento', commercial: 'Comercial', land: 'Terreno', other: 'Outro' };
const USE_LABELS = { residential: 'Residencial', commercial: 'Comercial', mixed: 'Misto' };

const state = {
  installed: false,
  scheduled: false,
  loading: false,
  needsRefresh: true,
  page: null,
  properties: [],
  query: '',
  status: 'all',
  useType: 'all',
  sort: 'newest',
  view: typeof localStorage !== 'undefined' ? (localStorage.getItem('locaio_property_view') || 'grid') : 'grid',
};

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const optionalNumber = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const propertySearchText = (property) => normalize([
  property.name, property.street, property.number, property.complement, property.neighborhood,
  property.city, property.state, property.postal_code, TYPE_LABELS[property.type], USE_LABELS[property.use_type],
].filter(Boolean).join(' '));

const findPropertiesPage = () => [...document.querySelectorAll('.pt-page')]
  .find((page) => normalize(page.querySelector('.pt-page-header h1')?.textContent) === 'imoveis') || null;

const scheduleEnhancement = () => {
  if (state.scheduled) return;
  state.scheduled = true;
  window.requestAnimationFrame(async () => {
    state.scheduled = false;
    await enhancePropertiesPage();
  });
};

const refreshProperties = async () => {
  if (state.loading || !localStorage.getItem('token')) return;
  state.loading = true;
  try {
    const { data } = await appApi.get('/properties');
    state.properties = Array.isArray(data) ? data : (data?.data || []);
    state.needsRefresh = false;
  } catch {
    // A experiência React original continua funcionando se o enriquecimento falhar.
  } finally {
    state.loading = false;
  }
};

const summaryHtml = () => {
  const total = state.properties.length;
  const available = state.properties.filter((property) => property.status === 'available').length;
  const occupied = state.properties.filter((property) => property.status === 'occupied').length;
  const attention = state.properties.filter((property) => ['maintenance', 'inactive'].includes(property.status)).length;
  const potential = state.properties.reduce((sum, property) => sum + Number(property.default_rent_amount || 0), 0);
  const occupancy = total ? Math.round((occupied / total) * 100) : 0;
  return `<section class="pm-property-summary" aria-label="Resumo da carteira de imóveis">
    <article><span class="pm-summary-icon">⌂</span><div><small>Carteira</small><strong>${total}</strong><p>${potential > 0 ? `${money(potential)} em aluguéis de referência` : 'Patrimônio cadastrado'}</p></div></article>
    <article><span class="pm-summary-icon success">✓</span><div><small>Disponíveis</small><strong>${available}</strong><p>Prontos para nova locação</p></div></article>
    <article><span class="pm-summary-icon info">●</span><div><small>Ocupados</small><strong>${occupied}</strong><p>${occupancy}% de ocupação da carteira</p></div></article>
    <article><span class="pm-summary-icon warning">!</span><div><small>Atenção</small><strong>${attention}</strong><p>Manutenção ou inativos</p></div></article>
  </section>`;
};

const controlsHtml = () => `<section class="pm-property-toolbar" aria-label="Filtros de imóveis">
  <div class="pm-property-search"><span aria-hidden="true">⌕</span><input type="search" value="${escapeHtml(state.query)}" placeholder="Buscar por imóvel, rua, bairro ou cidade" aria-label="Buscar imóveis" data-pm-search /></div>
  <div class="pm-property-filters">
    <select data-pm-status aria-label="Filtrar por status"><option value="all">Todos os status</option><option value="available">Disponíveis</option><option value="occupied">Ocupados</option><option value="maintenance">Em manutenção</option><option value="inactive">Inativos</option></select>
    <select data-pm-use aria-label="Filtrar por finalidade"><option value="all">Todas as finalidades</option><option value="residential">Residencial</option><option value="commercial">Comercial</option><option value="mixed">Misto</option></select>
    <select data-pm-sort aria-label="Ordenar imóveis"><option value="newest">Mais recentes</option><option value="name">Nome A–Z</option><option value="rent_desc">Maior aluguel</option><option value="rent_asc">Menor aluguel</option></select>
    <div class="pm-view-toggle" role="group" aria-label="Modo de visualização"><button type="button" data-pm-view="grid" aria-label="Visualização em cartões">▦</button><button type="button" data-pm-view="list" aria-label="Visualização em lista">☷</button></div>
  </div>
  <div class="pm-toolbar-footer"><span data-pm-result-count></span><button type="button" class="pm-clear-filters" data-pm-clear>Limpar filtros</button></div>
</section>`;

const bindToolbar = (host) => {
  const search = host.querySelector('[data-pm-search]');
  const status = host.querySelector('[data-pm-status]');
  const useType = host.querySelector('[data-pm-use]');
  const sort = host.querySelector('[data-pm-sort]');
  if (status) status.value = state.status;
  if (useType) useType.value = state.useType;
  if (sort) sort.value = state.sort;
  search?.addEventListener('input', (event) => { state.query = event.currentTarget.value; applyFiltersAndDecorations(); });
  status?.addEventListener('change', (event) => { state.status = event.currentTarget.value; applyFiltersAndDecorations(); });
  useType?.addEventListener('change', (event) => { state.useType = event.currentTarget.value; applyFiltersAndDecorations(); });
  sort?.addEventListener('change', (event) => { state.sort = event.currentTarget.value; applyFiltersAndDecorations(); });
  host.querySelector('[data-pm-clear]')?.addEventListener('click', () => {
    state.query = ''; state.status = 'all'; state.useType = 'all'; state.sort = 'newest';
    host.remove(); renderManagementHost(); applyFiltersAndDecorations();
  });
  host.querySelectorAll('[data-pm-view]').forEach((button) => button.addEventListener('click', () => {
    state.view = button.dataset.pmView;
    localStorage.setItem('locaio_property_view', state.view);
    applyFiltersAndDecorations();
  }));
};

const renderManagementHost = () => {
  if (!state.page) return;
  let host = state.page.querySelector('[data-pm-property-management]');
  if (host) return;
  host = document.createElement('div');
  host.dataset.pmPropertyManagement = 'true';
  host.innerHTML = `${summaryHtml()}${controlsHtml()}`;
  const header = state.page.querySelector('.pt-page-header');
  if (header) header.insertAdjacentElement('afterend', host); else state.page.prepend(host);
  bindToolbar(host);
};

const propertyFeatureHtml = (property) => {
  const features = [];
  if (property.area_m2) features.push(`<span><b>${escapeHtml(property.area_m2)} m²</b><small>Área</small></span>`);
  if (property.bedrooms !== null && property.bedrooms !== undefined && property.bedrooms !== '') features.push(`<span><b>${escapeHtml(property.bedrooms)}</b><small>Quartos</small></span>`);
  if (property.bathrooms !== null && property.bathrooms !== undefined && property.bathrooms !== '') features.push(`<span><b>${escapeHtml(property.bathrooms)}</b><small>Banheiros</small></span>`);
  if (property.parking_spaces !== null && property.parking_spaces !== undefined && property.parking_spaces !== '') features.push(`<span><b>${escapeHtml(property.parking_spaces)}</b><small>Vagas</small></span>`);
  if (!features.length) features.push(`<span class="pm-feature-empty"><b>${TYPE_LABELS[property.type] || 'Imóvel'}</b><small>Cadastre área e características na edição</small></span>`);
  return features.join('');
};

const propertyAddress = (property) => [
  property.street && `${property.street}${property.number ? `, ${property.number}` : ''}`,
  property.neighborhood,
  property.city && property.state ? `${property.city}/${property.state}` : property.city,
].filter(Boolean).join(' · ');

const decorateCard = (card, property) => {
  card.dataset.propertyId = String(property.id);
  card.dataset.propertyStatus = property.status || 'available';
  card.dataset.propertyUse = property.use_type || '';
  const status = card.querySelector('.pt-status');
  const statusText = STATUS_LABELS[property.status] || property.status || 'Disponível';
  if (status && status.textContent !== statusText) status.textContent = statusText;

  const address = card.querySelector('.pt-property-body > div:first-child p');
  const addressHtml = `<span aria-hidden="true">⌖</span>${escapeHtml(propertyAddress(property) || 'Endereço não informado')}`;
  if (address && address.innerHTML !== addressHtml) address.innerHTML = addressHtml;

  const details = card.querySelector('.pt-property-details');
  if (details) {
    const use = details.querySelector('span');
    const rent = details.querySelector('b');
    const useText = `${TYPE_LABELS[property.type] || 'Imóvel'} · ${USE_LABELS[property.use_type] || 'Uso não definido'}`;
    const rentText = property.default_rent_amount ? money(property.default_rent_amount) : 'Valor a definir';
    if (use && use.textContent !== useText) use.textContent = useText;
    if (rent && rent.textContent !== rentText) rent.textContent = rentText;
  }

  let features = card.querySelector('.pm-property-features');
  if (!features) {
    features = document.createElement('div');
    features.className = 'pm-property-features';
    card.querySelector('.pt-card-actions')?.insertAdjacentElement('beforebegin', features);
  }
  const featureHtml = propertyFeatureHtml(property);
  if (features.innerHTML !== featureHtml) features.innerHTML = featureHtml;

  const actions = card.querySelector('.pt-card-actions');
  if (actions && !actions.querySelector('[data-pm-edit]')) {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'pt-button secondary pm-edit-property';
    edit.dataset.pmEdit = String(property.id);
    edit.innerHTML = '<span aria-hidden="true">✎</span> Editar';
    edit.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); openPropertyModal(property); });
    actions.insertBefore(edit, actions.firstChild);
  }

  const leaseButton = [...(actions?.querySelectorAll('button') || [])].find((button) => normalize(button.textContent).includes('criar locacao'));
  if (leaseButton) {
    const canLease = property.status === 'available';
    leaseButton.disabled = !canLease;
    leaseButton.classList.toggle('pm-disabled-lease', !canLease);
    leaseButton.title = canLease ? 'Criar uma nova locação para este imóvel' : `O imóvel está como ${STATUS_LABELS[property.status] || property.status}. Altere o status antes de criar uma locação.`;
  }
};

const sortedProperties = (properties) => [...properties].sort((a, b) => {
  if (state.sort === 'name') return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
  if (state.sort === 'rent_desc') return Number(b.default_rent_amount || 0) - Number(a.default_rent_amount || 0);
  if (state.sort === 'rent_asc') return Number(a.default_rent_amount || 0) - Number(b.default_rent_amount || 0);
  return Number(b.id || 0) - Number(a.id || 0);
});

const applyFiltersAndDecorations = () => {
  if (!state.page) return;
  const grid = state.page.querySelector('.pt-property-grid');
  const resultCount = state.page.querySelector('[data-pm-result-count]');
  if (!grid) {
    if (resultCount) resultCount.textContent = `${state.properties.length} imóvel(is)`;
    return;
  }

  const cards = [...grid.querySelectorAll('.pt-property-card')];
  const byId = new Map();
  cards.forEach((card, index) => {
    const property = state.properties.find((item) => String(item.id) === String(card.dataset.propertyId)) || state.properties[index];
    if (!property) return;
    decorateCard(card, property);
    byId.set(String(property.id), card);
  });

  const filtered = sortedProperties(state.properties).filter((property) => {
    if (state.query && !propertySearchText(property).includes(normalize(state.query))) return false;
    if (state.status !== 'all' && property.status !== state.status) return false;
    if (state.useType !== 'all' && property.use_type !== state.useType) return false;
    return true;
  });
  const visibleIds = new Set(filtered.map((property) => String(property.id)));
  state.properties.forEach((property) => {
    const card = byId.get(String(property.id));
    if (card) card.hidden = !visibleIds.has(String(property.id));
  });

  const desiredCards = filtered.map((property) => byId.get(String(property.id))).filter(Boolean);
  desiredCards.forEach((card, index) => {
    const currentVisible = [...grid.querySelectorAll('.pt-property-card:not([hidden])')];
    if (currentVisible[index] !== card) grid.insertBefore(card, currentVisible[index] || grid.querySelector('.pm-filter-empty') || null);
  });

  grid.classList.toggle('pm-list-view', state.view === 'list');
  state.page.querySelectorAll('[data-pm-view]').forEach((button) => button.classList.toggle('active', button.dataset.pmView === state.view));

  let empty = grid.querySelector('.pm-filter-empty');
  if (!filtered.length && state.properties.length) {
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'pm-filter-empty';
      empty.innerHTML = '<span>⌕</span><strong>Nenhum imóvel encontrado</strong><p>Ajuste os filtros ou limpe a busca para visualizar sua carteira.</p>';
      grid.appendChild(empty);
    }
    empty.hidden = false;
  } else if (empty) empty.hidden = true;
  if (resultCount) resultCount.textContent = `${filtered.length} de ${state.properties.length} imóvel(is)`;
};

const input = (label, name, value = '', options = {}) => {
  const attrs = [
    options.required ? 'required' : '', options.type ? `type="${options.type}"` : '',
    options.min !== undefined ? `min="${options.min}"` : '', options.max !== undefined ? `max="${options.max}"` : '',
    options.step ? `step="${options.step}"` : '', options.maxLength ? `maxlength="${options.maxLength}"` : '',
    options.placeholder ? `placeholder="${escapeHtml(options.placeholder)}"` : '',
  ].filter(Boolean).join(' ');
  return `<label>${escapeHtml(label)}<input name="${name}" value="${escapeHtml(value)}" ${attrs}></label>`;
};
const select = (label, name, value, options) => `<label>${escapeHtml(label)}<select name="${name}">${options.map(([key, text]) => `<option value="${escapeHtml(key)}" ${String(value) === String(key) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select></label>`;

const showNotice = (message) => {
  document.querySelector('.pm-property-notice')?.remove();
  const notice = document.createElement('div');
  notice.className = 'pm-property-notice';
  notice.setAttribute('role', 'status');
  notice.textContent = message;
  document.body.appendChild(notice);
  window.setTimeout(() => notice.remove(), 4000);
};

const openPropertyModal = (property = null) => {
  document.querySelector('.pm-property-modal-backdrop')?.remove();
  const editing = Boolean(property?.id);
  const current = property || { status: 'available', type: 'house', use_type: 'residential', default_due_day: 10 };
  const backdrop = document.createElement('div');
  backdrop.className = 'pm-property-modal-backdrop';
  backdrop.innerHTML = `<section class="pm-property-modal" role="dialog" aria-modal="true" aria-labelledby="pm-property-modal-title">
    <header><div><span>Patrimônio</span><h2 id="pm-property-modal-title">${editing ? 'Editar imóvel' : 'Cadastrar imóvel'}</h2><p>${editing ? 'Atualize cadastro, disponibilidade e valores de referência.' : 'Cadastre o imóvel com informações suficientes para contratos e gestão.'}</p></div><button type="button" class="pm-modal-close" aria-label="Fechar" data-pm-close>×</button></header>
    <form class="pm-property-form"><div class="pm-form-error" data-pm-form-error hidden></div>
      <section><h3>Identificação e uso</h3><div class="pm-form-grid three">
        ${input('Nome do imóvel', 'name', current.name, { required: true, placeholder: 'Ex.: Casa Centro' })}
        ${select('Tipo', 'type', current.type || 'house', Object.entries(TYPE_LABELS))}
        ${select('Finalidade', 'use_type', current.use_type || 'residential', Object.entries(USE_LABELS))}
        ${select('Status', 'status', current.status || 'available', Object.entries(STATUS_LABELS))}
        ${input('Aluguel de referência', 'default_rent_amount', current.default_rent_amount, { type: 'number', min: 0, step: '0.01' })}
        ${input('Dia de vencimento', 'default_due_day', current.default_due_day || 10, { type: 'number', min: 1, max: 31 })}
      </div></section>
      <section><h3>Endereço</h3><div class="pm-form-grid three">
        ${input('CEP', 'postal_code', current.postal_code, { maxLength: 12 })}
        <label class="span-2">Rua / Avenida<input name="street" value="${escapeHtml(current.street)}" required></label>
        ${input('Número', 'number', current.number)}${input('Complemento', 'complement', current.complement)}${input('Bairro', 'neighborhood', current.neighborhood)}
        ${input('Cidade', 'city', current.city, { required: true })}${input('UF', 'state', current.state, { required: true, maxLength: 2 })}
      </div></section>
      <section><h3>Características</h3><p>Esses dados ajudam na identificação do imóvel, contratos, vistorias e análises da carteira.</p><div class="pm-form-grid four">
        ${input('Área (m²)', 'area_m2', current.area_m2, { type: 'number', min: 0, step: '0.01' })}
        ${input('Quartos', 'bedrooms', current.bedrooms, { type: 'number', min: 0, max: 100 })}
        ${input('Banheiros', 'bathrooms', current.bathrooms, { type: 'number', min: 0, max: 100 })}
        ${input('Vagas', 'parking_spaces', current.parking_spaces, { type: 'number', min: 0, max: 100 })}
      </div></section>
      <footer><button type="button" class="pt-button secondary" data-pm-close>Cancelar</button><button type="submit" class="pt-button primary" data-pm-submit>${editing ? 'Salvar alterações' : 'Cadastrar imóvel'}</button></footer>
    </form></section>`;

  document.body.appendChild(backdrop);
  document.body.classList.add('pm-modal-open');
  const close = () => { backdrop.remove(); document.body.classList.remove('pm-modal-open'); };
  backdrop.querySelectorAll('[data-pm-close]').forEach((button) => button.addEventListener('click', close));
  backdrop.addEventListener('click', (event) => { if (event.target === backdrop) close(); });
  const onEscape = (event) => {
    if (event.key === 'Escape' && document.body.contains(backdrop)) { close(); document.removeEventListener('keydown', onEscape); }
  };
  document.addEventListener('keydown', onEscape);

  const form = backdrop.querySelector('form');
  form.querySelector('[name="name"]')?.focus();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submit = form.querySelector('[data-pm-submit]');
    const errorBox = form.querySelector('[data-pm-form-error]');
    const data = Object.fromEntries(new FormData(form).entries());
    const payload = {
      name: data.name.trim(), type: data.type, use_type: data.use_type, status: data.status,
      postal_code: data.postal_code.trim() || null, street: data.street.trim(), number: data.number.trim() || null,
      complement: data.complement.trim() || null, neighborhood: data.neighborhood.trim() || null, city: data.city.trim(),
      state: data.state.trim().toUpperCase(), bedrooms: optionalNumber(data.bedrooms), bathrooms: optionalNumber(data.bathrooms),
      parking_spaces: optionalNumber(data.parking_spaces), area_m2: optionalNumber(data.area_m2),
      default_rent_amount: optionalNumber(data.default_rent_amount), default_due_day: optionalNumber(data.default_due_day) || 10,
    };
    submit.disabled = true;
    submit.textContent = editing ? 'Salvando…' : 'Cadastrando…';
    errorBox.hidden = true;
    try {
      if (editing) await appApi.patch(`/properties/${property.id}`, payload); else await appApi.post('/properties', payload);
      close();
      showNotice(editing ? 'Imóvel atualizado com sucesso.' : 'Imóvel cadastrado com sucesso.');
      window.setTimeout(() => window.location.reload(), 450);
    } catch (error) {
      errorBox.textContent = errorMessage(error, 'Não foi possível salvar o imóvel.');
      errorBox.hidden = false;
      submit.disabled = false;
      submit.textContent = editing ? 'Salvar alterações' : 'Cadastrar imóvel';
    }
  });
};

const interceptCreateButtons = (event) => {
  const page = findPropertiesPage();
  if (!page || !(event.target instanceof Element)) return;
  const button = event.target.closest('button');
  if (!button || !page.contains(button) || button.closest('.pm-property-modal')) return;
  const text = normalize(button.textContent);
  if (!['novo imovel', 'cadastrar imovel'].includes(text)) return;
  event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.(); openPropertyModal();
};

const mutationNeedsEnhancement = (mutations) => mutations.some((mutation) => [...mutation.addedNodes].some((node) => {
  if (!(node instanceof Element)) return false;
  if (node.matches('[data-pm-property-management], .pm-property-features, .pm-filter-empty, .pm-edit-property')) return false;
  if (node.closest?.('[data-pm-property-management]')) return false;
  if (node.matches('.pt-page, .pt-property-grid, .pt-property-card:not([data-property-id])')) return true;
  return Boolean(node.querySelector?.('.pt-page, .pt-property-grid, .pt-property-card:not([data-property-id])'));
}));

async function enhancePropertiesPage() {
  const page = findPropertiesPage();
  if (!page) { state.page = null; return; }
  const pageChanged = state.page !== page;
  state.page = page;
  if (pageChanged) state.needsRefresh = true;
  if (state.needsRefresh || !state.properties.length) await refreshProperties();
  renderManagementHost();
  applyFiltersAndDecorations();
}

export function installPropertyManagementEnhancements() {
  if (state.installed || typeof document === 'undefined') return;
  state.installed = true;
  document.addEventListener('click', interceptCreateButtons, true);
  const observer = new MutationObserver((mutations) => {
    if (!mutationNeedsEnhancement(mutations)) return;
    state.needsRefresh = true;
    scheduleEnhancement();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('authChanged', () => { state.properties = []; state.needsRefresh = true; scheduleEnhancement(); });
  scheduleEnhancement();
}
