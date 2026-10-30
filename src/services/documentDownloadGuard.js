/**
 * Nunca enviar o bearer token a links de terceiros, mesmo que o caminho imite
 * um documento de locação. Aceita apenas a origem e o prefixo da API ativa.
 */
export function isTrustedDocumentDownloadUrl(href, apiBaseUrl, appSlug, origin) {
  try {
    const target = new URL(href, origin);
    const api = new URL(apiBaseUrl, origin);
    if (!/^https?:$/.test(target.protocol) || target.origin !== api.origin) return false;

    const prefix = `${api.pathname.replace(/\/+$/, '')}/v1/apps/${encodeURIComponent(appSlug)}/leases/`;
    return target.pathname.startsWith(prefix)
      && target.pathname.slice(prefix.length).includes('/documents/');
  } catch {
    return false;
  }
}
