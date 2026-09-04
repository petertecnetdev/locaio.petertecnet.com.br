const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const state = { installed: false, scheduled: false };

const openWorkspace = (propertyId, tab = 'overview') => {
  const id = Number(propertyId);
  if (!id) return;
  window.dispatchEvent(new CustomEvent('locaio:open-property', { detail: { propertyId: id, tab } }));
};

const enhanceCards = () => {
  document.querySelectorAll('.pt-property-card[data-property-id]').forEach((card) => {
    const propertyId = Number(card.dataset.propertyId);
    if (!propertyId) return;

    const body = card.querySelector('.pt-property-body');
    const heading = body?.querySelector('h3');
    if (heading && !heading.dataset.pwBound) {
      heading.dataset.pwBound = 'true';
      heading.tabIndex = 0;
      heading.setAttribute('role', 'button');
      heading.setAttribute('title', 'Abrir gestão completa do imóvel');
      heading.addEventListener('click', () => openWorkspace(propertyId));
      heading.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openWorkspace(propertyId); }
      });
    }

    const actions = card.querySelector('.pt-card-actions');
    if (actions && !actions.querySelector('[data-pw-open]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pt-button primary pw-card-open';
      button.dataset.pwOpen = String(propertyId);
      button.innerHTML = '<span aria-hidden="true">⌂</span> Gerenciar';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openWorkspace(propertyId);
      });
      actions.insertBefore(button, actions.firstChild);
    }

    if (!card.dataset.pwBound) {
      card.dataset.pwBound = 'true';
      card.addEventListener('dblclick', (event) => {
        if (event.target.closest('button,a,input,select,textarea')) return;
        openWorkspace(propertyId);
      });
    }
  });
};

const schedule = () => {
  if (state.scheduled) return;
  state.scheduled = true;
  window.requestAnimationFrame(() => {
    state.scheduled = false;
    enhanceCards();
  });
};

export function installPropertyWorkspaceBridge() {
  if (state.installed || typeof window === 'undefined') return;
  state.installed = true;
  document.addEventListener('click', (event) => {
    const direct = event.target.closest('[data-property-workspace]');
    if (!direct) return;
    const id = direct.dataset.propertyWorkspace;
    if (id) openWorkspace(id, direct.dataset.propertyWorkspaceTab || 'overview');
  });
  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => [...mutation.addedNodes].some((node) => {
      if (!(node instanceof Element)) return false;
      if (node.matches?.('.pt-property-card,.pt-property-grid,[data-pm-property-management]')) return true;
      return Boolean(node.querySelector?.('.pt-property-card,.pt-property-grid'));
    }));
    if (relevant) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  schedule();
}

export { openWorkspace };
