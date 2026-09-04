const RECOVERY_KEY = 'locaio:chunk-recovery:last-attempt';
const RECOVERY_WINDOW_MS = 60_000;

const CHUNK_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Unable to preload CSS for/i,
];

function getErrorMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return [error.name, error.message].filter(Boolean).join(': ');
}

export function isChunkLoadError(error) {
  const message = getErrorMessage(error);
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function recoverFromChunkLoadError(error) {
  if (typeof window === 'undefined' || !isChunkLoadError(error)) return false;

  const now = Date.now();
  const lastAttempt = Number(window.sessionStorage.getItem(RECOVERY_KEY) || 0);

  if (Number.isFinite(lastAttempt) && now - lastAttempt < RECOVERY_WINDOW_MS) {
    console.error('[Locaio] Falha de chunk persistiu após tentativa automática de recuperação.', error);
    return false;
  }

  window.sessionStorage.setItem(RECOVERY_KEY, String(now));
  console.warn('[Locaio] Bundle desatualizado detectado. Recarregando a aplicação com a versão atual.', error);
  window.location.reload();
  return true;
}

export function installChunkRecoveryGuard() {
  const handleRejection = (event) => {
    recoverFromChunkLoadError(event?.reason);
  };

  const handleError = (event) => {
    recoverFromChunkLoadError(event?.error || event?.message);
  };

  window.addEventListener('unhandledrejection', handleRejection);
  window.addEventListener('error', handleError);

  return () => {
    window.removeEventListener('unhandledrejection', handleRejection);
    window.removeEventListener('error', handleError);
  };
}
