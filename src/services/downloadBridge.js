import { API_BASE_URL, APP_SLUG, getCurrentAuthSession, isAuthSessionCurrent } from './api.js';
import { isTrustedDocumentDownloadUrl, safeDocumentFilename } from './documentDownloadGuard.js';

export function installAuthenticatedDownloads() {
  const activeDownloads = new Set();
  const abortDownloads = () => {
    for (const controller of activeDownloads) controller.abort();
    activeDownloads.clear();
  };

  const handler = async (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const anchor = event.target?.closest?.('a[href]');
    if (!anchor) return;
    let url;
    try { url = new URL(anchor.href, window.location.origin); } catch { return; }
    if (!isTrustedDocumentDownloadUrl(url.toString(), API_BASE_URL, APP_SLUG, window.location.origin)) return;

    const session = getCurrentAuthSession();
    if (!session.token) return;
    event.preventDefault();
    const controller = new AbortController();
    activeDownloads.add(controller);

    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: '*/*', Authorization: `Bearer ${session.token}`, 'X-Peter-App': APP_SLUG },
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Falha ao baixar documento.');
      if (!isAuthSessionCurrent(session)) return;

      const blob = await response.blob();
      // Uma resposta da sessão anterior nunca deve iniciar download na conta atual.
      if (!isAuthSessionCurrent(session)) return;

      const filename = safeDocumentFilename(response.headers.get('content-disposition'));
      const objectUrl = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
    } catch (error) {
      if (error?.name !== 'AbortError' && isAuthSessionCurrent(session)) {
        window.dispatchEvent(new CustomEvent('locaio:download-error', { detail: error.message }));
      }
    } finally {
      activeDownloads.delete(controller);
    }
  };

  document.addEventListener('click', handler);
  window.addEventListener('authChanged', abortDownloads);
  window.addEventListener('peterContextChanged', abortDownloads);
  return () => {
    document.removeEventListener('click', handler);
    window.removeEventListener('authChanged', abortDownloads);
    window.removeEventListener('peterContextChanged', abortDownloads);
    abortDownloads();
  };
}
