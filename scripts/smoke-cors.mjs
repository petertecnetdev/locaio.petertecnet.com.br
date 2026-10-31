const ALLOWED_METHODS = 'GET, POST, PATCH, PUT, DELETE, OPTIONS';
const ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'X-Peter-App',
  'X-Frontend-Page',
  'X-Peter-Context-Role',
  'X-Peter-Ecosystem-SDK',
].join(', ');

function normalizedOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new TypeError('Origem inválida para o mock CORS.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin === 'null') {
    throw new TypeError('A origem do mock CORS precisa usar HTTP ou HTTPS.');
  }
  return parsed.origin;
}

export function buildSmokeCorsHeaders(origin) {
  return {
    'access-control-allow-origin': normalizedOrigin(origin),
    'access-control-allow-headers': ALLOWED_HEADERS,
    'access-control-allow-methods': ALLOWED_METHODS,
    'access-control-max-age': '600',
    'content-type': 'application/json; charset=utf-8',
    vary: 'Origin',
  };
}

export function buildSmokePreflightResponse(origin) {
  return {
    status: 204,
    headers: buildSmokeCorsHeaders(origin),
    body: '',
  };
}
