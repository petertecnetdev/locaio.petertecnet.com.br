/**
 * Um HTTP 401 só pode encerrar a sessão que iniciou a requisição.
 * Respostas atrasadas de logins, contas ou contextos anteriores não invalidam
 * uma sessão mais recente. A API continua sendo a autoridade de autorização.
 */
export function shouldInvalidateSessionForUnauthorized(error, currentSession) {
  if (error?.response?.status !== 401) return false;

  const request = error?.config;
  if (!request || /\/auth\/(?:login|register|google|email-verify)(?:[/?]|$)/.test(String(request.url || ''))) {
    return false;
  }

  const started = request.__locaioAuthSnapshot;
  return Boolean(
    currentSession?.token
    && started?.token === currentSession.token
    && started?.epoch === currentSession.epoch
    && started?.role === (currentSession.role || null)
  );
}
