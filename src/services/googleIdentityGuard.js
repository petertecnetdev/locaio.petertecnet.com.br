const GUARD_KEY = Symbol.for('petertecnet.googleIdentityGuard');

function patchGoogleIdentity() {
  const identity = window.google?.accounts?.id;
  if (!identity?.initialize || identity.initialize[GUARD_KEY]) return false;

  const originalInitialize = identity.initialize.bind(identity);
  let activeClientId = null;
  let latestCallback = null;

  const guardedInitialize = (options = {}) => {
    const clientId = String(options?.client_id || '').trim();
    if (!clientId) return originalInitialize(options);

    if (typeof options.callback === 'function') latestCallback = options.callback;

    // O Google Identity Services mantém uma única configuração global por página.
    // Re-renderizações React podem pedir a mesma inicialização mais de uma vez;
    // nesse caso atualizamos o callback, mas não reinicializamos o SDK.
    if (activeClientId === clientId) return undefined;

    activeClientId = clientId;
    return originalInitialize({
      ...options,
      callback: (credentialResponse) => latestCallback?.(credentialResponse),
    });
  };

  Object.defineProperty(guardedInitialize, GUARD_KEY, { value: true });
  identity.initialize = guardedInitialize;
  return true;
}

export function installGoogleIdentityGuard() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  patchGoogleIdentity();

  const onResourceLoad = (event) => {
    const target = event.target;
    if (!(target instanceof HTMLScriptElement)) return;
    if (!target.src.includes('accounts.google.com/gsi/client')) return;
    patchGoogleIdentity();
  };

  // Eventos load de recursos não borbulham, mas são observáveis na fase de captura.
  // Isso permite envolver o SDK antes do onload definido pelo componente de login.
  document.addEventListener('load', onResourceLoad, true);
  return () => document.removeEventListener('load', onResourceLoad, true);
}
