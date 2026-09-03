import { APP_SLUG } from './api.js';

export function installAuthenticatedDownloads() {
  const handler = async (event) => {
    const anchor = event.target.closest?.('a[href]');
    if (!anchor) return;
    let url;
    try { url = new URL(anchor.href, window.location.origin); } catch { return; }
    if (!url.pathname.includes(`/v1/apps/${APP_SLUG}/leases/`) || !url.pathname.includes('/documents/')) return;
    event.preventDefault();
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const response = await fetch(url.toString(), { headers: { Accept: '*/*', Authorization: `Bearer ${token}`, 'X-Peter-App': APP_SLUG } });
      if (!response.ok) throw new Error('Falha ao baixar documento.');
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
      const filename = decodeURIComponent((match?.[1] || 'documento').replace(/\"/g, ''));
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = objectUrl; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) { window.dispatchEvent(new CustomEvent('locaio:download-error', { detail: error.message })); }
  };
  document.addEventListener('click', handler);
  return () => document.removeEventListener('click', handler);
}
