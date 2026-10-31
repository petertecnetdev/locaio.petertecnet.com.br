import { isCurrentAuthSession } from './session401Guard.js';

/** Impede que respostas antigas de perfil financeiro atualizem outra sessão. */
export function shouldApplyPaymentProfileResult(requestId, latestRequestId, startedSession, currentSession) {
  return Number.isSafeInteger(requestId)
    && requestId === latestRequestId
    && isCurrentAuthSession(startedSession, currentSession);
}
