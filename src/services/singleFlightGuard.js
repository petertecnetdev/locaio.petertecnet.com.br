/** Serializa ações críticas de uma instância sem descartar o resultado da primeira. */
export function createSingleFlightGuard() {
  let inFlight = false;

  return async function runSingleFlight(operation) {
    if (inFlight) return { started: false, value: null };

    inFlight = true;
    try {
      return { started: true, value: await operation() };
    } finally {
      inFlight = false;
    }
  };
}
