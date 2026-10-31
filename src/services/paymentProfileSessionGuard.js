import { shouldApplyLatestSessionResponse } from './session401Guard.js';

/** Impede que respostas antigas de perfil financeiro atualizem outra sessão. */
export function shouldApplyPaymentProfileResult(requestId, latestRequestId, startedSession, currentSession) {
  return shouldApplyLatestSessionResponse(requestId, latestRequestId, startedSession, currentSession);
}
