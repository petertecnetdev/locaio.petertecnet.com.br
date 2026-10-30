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

export function shouldInvalidateSessionForUnauthorized(error, currentSession) {
  if (error?.response?.status !== 401) return false;

  const request = error?.config;
  if (!request || request.__locaioSkipAuthInvalidation || /\/auth\/(?:login|register|google|email-verify)(?:[/?]|$)/.test(String(request.url || ''))) {
    return false;
  }

  return isCurrentAuthSession(request.__locaioAuthSnapshot, currentSession);
}
