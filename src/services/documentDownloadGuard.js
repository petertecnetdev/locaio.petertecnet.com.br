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

/**
 * O nome recebido no Content-Disposition não é confiável: remove diretórios,
 * caracteres de controle e nomes reservados antes de preencher `download`.
 */
export function safeDocumentFilename(disposition) {
  const header = String(disposition || '');
  const extended = header.match(/(?:^|;)\s*filename\*\s*=\s*UTF-8'[^']*'([^;]+)/i);
  let filename = '';

  if (extended) {
    const encoded = extended[1].trim().replace(/^"|"$/g, '');
    try { filename = decodeURIComponent(encoded); } catch { filename = encoded; }
  }
  if (!filename) {
    const basic = header.match(/(?:^|;)\s*filename\s*=\s*(?:"([^"]*)"|([^;]*))/i);
    filename = basic?.[1] ?? basic?.[2] ?? '';
  }

  const clean = String(filename).split(/[\\/]/).pop()
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_')
    .trim().replace(/[. ]+$/g, '').slice(0, 180);

  if (!clean || /^\.+$/.test(clean)) return 'documento';
  if (/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(clean)) return `documento-${clean}`;
  return clean;
}
