/**
 * Um HTTP 401 só pode encerrar a sessão que iniciou a requisição.
 * Respostas atrasadas de logins, contas ou contextos anteriores não invalidam
 * uma sessão mais recente. A API continua sendo a autoridade de autorização.
 */
export function isCurrentAuthSession(started, current) {
  return Boolean(
    started?.token
    && current?.token
    && started.token === current.token
    && started.epoch === current.epoch
    && (started.role || null) === (current.role || null)
  );
}

/**
 * Resolve a sessão que pode autorizar o envio. Um snapshot explícito nunca
 * pode ser substituído silenciosamente pelas credenciais de outra conta.
 * Chamadas públicas anônimas continuam válidas enquanto o contexto não muda.
 */
export function resolveRequestAuthSession(expectedSession, currentSession) {
  if (expectedSession === undefined) return currentSession;
  if (!expectedSession || !currentSession) return null;

  if (expectedSession.token || currentSession.token) {
    return isCurrentAuthSession(expectedSession, currentSession) ? expectedSession : null;
  }

  return expectedSession.epoch === currentSession.epoch
    && (expectedSession.role || null) === (currentSession.role || null)
    ? expectedSession
    : null;
}

/** Só aplica respostas da última leitura iniciada na mesma sessão autenticada. */
export function shouldApplyLatestSessionResponse(requestId, latestRequestId, startedSession, currentSession) {
  return Number.isSafeInteger(requestId)
    && requestId > 0
    && requestId === latestRequestId
    && isCurrentAuthSession(startedSession, currentSession);
}

export function shouldInvalidateSessionForUnauthorized(error, currentSession) {
  if (error?.response?.status !== 401) return false;

  const request = error?.config;
  if (!request || request.__locaioSkipAuthInvalidation || /\/auth\/(?:login|register|google|email-verify)(?:[/?]|$)/.test(String(request.url || ''))) {
    return false;
  }

  return isCurrentAuthSession(request.__locaioAuthSnapshot, currentSession);
}


/** Identifica eventos localStorage que alteram a identidade ou o contexto da sessão. */
export function isAuthSessionStorageEvent(event, authStorageKeys, contextStorageKey, storageArea = null) {
  if (!event || typeof event !== 'object') return false;
  if (storageArea && event.storageArea && event.storageArea !== storageArea) return false;
  if (event.key === null) return true;
  return authStorageKeys.includes(event.key) || event.key === contextStorageKey;
}
