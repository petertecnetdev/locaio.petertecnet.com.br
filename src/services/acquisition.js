const KEY = 'locaio_acquisition';
export function captureAcquisition() {
  const params = new URLSearchParams(window.location.search);
  const current = JSON.parse(localStorage.getItem(KEY) || '{}');
  const next = {
    ...current,
    source: params.get('utm_source') || params.get('origem') || current.source || (document.referrer ? 'referral' : 'direct'),
    medium: params.get('utm_medium') || current.medium || 'organic',
    campaign: params.get('utm_campaign') || current.campaign || null,
    intent: params.get('intencao') || current.intent || null,
    landing_path: current.landing_path || window.location.pathname,
    first_seen_at: current.first_seen_at || new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
  };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
export function getAcquisition() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
