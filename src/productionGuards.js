import { appApi } from './services/api.js';

const getFilename = (response, fallback) => {
  const disposition = String(response?.headers?.['content-disposition'] || '');
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quoted = disposition.match(/filename="([^"]+)"/i)?.[1];
  try { return decodeURIComponent(encoded || quoted || fallback); } catch { return quoted || fallback; }
};

const downloadPrivateDocument = async (anchor, leaseId, documentId) => {
  const fallback = anchor.querySelector('b')?.textContent?.trim() || `documento-${documentId}`;
  anchor.setAttribute('aria-busy', 'true');
  try {
    const response = await appApi.get(`/leases/${leaseId}/documents/${documentId}`, { responseType: 'blob' });
    const blobUrl = URL.createObjectURL(response.data);
    const temporary = document.createElement('a');
    temporary.href = blobUrl;
    temporary.download = getFilename(response, fallback);
    temporary.style.display = 'none';
    document.body.appendChild(temporary);
    temporary.click();
    temporary.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } finally {
    anchor.removeAttribute('aria-busy');
  }
};

const removeInvalidCashDepositOption = (root = document) => {
  root.querySelectorAll('select').forEach((select) => {
    const illegal = select.querySelector('option[value="4"]');
    const label = select.closest('label')?.textContent || '';
    if (illegal && /caução/i.test(label)) illegal.remove();
  });
};

export function installProductionGuards() {
  removeInvalidCashDepositOption();

  const observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node instanceof Element) removeInvalidCashDepositOption(node);
    }));
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('click', async (event) => {
    const anchor = event.target.closest('a[href*="/v1/apps/locaio/leases/"][href*="/documents/"]');
    if (!anchor) return;
    const match = anchor.href.match(/\/v1\/apps\/locaio\/leases\/(\d+)\/documents\/(\d+)(?:\?.*)?$/);
    if (!match) return;

    event.preventDefault();
    try {
      await downloadPrivateDocument(anchor, match[1], match[2]);
    } catch (error) {
      console.error('[Locaio] Private document download failed', error);
      window.dispatchEvent(new CustomEvent('locaioDownloadError', { detail: error }));
    }
  });

  return () => observer.disconnect();
}
