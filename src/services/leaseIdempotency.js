const SUPPORTED_OPERATIONS = new Set(['schedule', 'payment', 'mark-paid', 'contract-send']);

function requiredId(value, label) {
  const normalized = String(value ?? '').trim();
  if (!/^\d{1,20}$/.test(normalized)) {
    throw new TypeError(`${label} inválido para gerar a chave de idempotência.`);
  }
  return normalized;
}

function stableValue(value) {
  if (value === null || value === undefined) return null;
  return String(value).trim();
}

/**
 * Produz uma chave estável por operação financeira e estado contratual.
 * O backend escopa a chave por aplicação e usuário e valida o fingerprint
 * completo da requisição antes de reproduzir uma resposta anterior.
 */
export async function createLeaseIdempotencyKey(operation, lease, options = {}) {
  const action = String(operation ?? '').trim().toLowerCase();
  if (!SUPPORTED_OPERATIONS.has(action)) {
    throw new TypeError('Operação financeira não suportada para idempotência.');
  }

  const leaseId = requiredId(lease?.id, 'Identificador da locação');
  const payload = {
    application: 'locaio',
    operation: action,
    lease_id: leaseId,
  };

  if (action === 'schedule') {
    payload.contract = {
      version: stableValue(lease?.contract_version),
      starts_on: stableValue(lease?.starts_on),
      ends_on: stableValue(lease?.ends_on),
      rent_amount: stableValue(lease?.rent_amount),
      due_day: stableValue(lease?.due_day),
      deposit_amount: stableValue(lease?.deposit_amount),
      deposit_months: stableValue(lease?.deposit_months),
    };
  } else if (action === 'contract-send') {
    const version = requiredId(options.version ?? lease?.contract_version, 'Versão do contrato');
    const documentId = stableValue(options.documentId);
    if (documentId && !/^[A-Za-z0-9._:-]{1,80}$/.test(documentId)) {
      throw new TypeError('Identificador do documento inválido para gerar a chave de idempotência.');
    }
    payload.contract = { version, document_id: documentId };
  } else {
    const chargeId = requiredId(options.charge?.id, 'Identificador da cobrança');
    const method = String(options.method ?? '').trim().toLowerCase();
    const allowedMethods = action === 'payment'
      ? new Set(['pix', 'boleto', 'card'])
      : new Set(['pix', 'boleto', 'card', 'cash', 'transfer', 'other']);
    if (!allowedMethods.has(method)) {
      throw new TypeError('Método financeiro inválido para gerar a chave de idempotência.');
    }
    payload.charge = {
      id: chargeId,
      amount: stableValue(options.charge?.amount),
      method,
    };
  }

  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle?.digest || typeof TextEncoder === 'undefined') {
    throw new Error('Este navegador não oferece criptografia segura para proteger a operação financeira.');
  }

  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);

  return `locaio-${action}-${leaseId}-${fingerprint}`;
}
