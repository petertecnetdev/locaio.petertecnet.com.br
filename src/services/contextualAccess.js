const RESOURCE_TYPES = new Set(['agreement', 'lease', 'real_estate_lease']);

let accessSnapshot = { roles: [], memberships: [], relationships: [] };
let currentUser = null;
let installed = false;

const asArray = (value) => Array.isArray(value) ? value : [];
const normalizeType = (value) => String(value || '').trim().toLowerCase();
const sameId = (left, right) => String(left ?? '') === String(right ?? '');

export function normalizeAccountContext(payload) {
  const source = payload?.data?.user ? payload.data : payload;
  const contextualAccess = source?.contextual_access || source?.access || {};

  return {
    ...source,
    user: source?.user || null,
    contextual_access: {
      roles: asArray(contextualAccess.roles),
      memberships: asArray(contextualAccess.memberships),
      relationships: asArray(contextualAccess.relationships),
    },
  };
}

export function relationshipsForResource(snapshot, resourceType, resourceId) {
  const normalizedResourceType = normalizeType(resourceType);
  return asArray(snapshot?.relationships).filter((relationship) => (
    normalizeType(relationship?.resource_type) === normalizedResourceType
    && sameId(relationship?.resource_id, resourceId)
  ));
}

export function leaseRelationships(snapshot, leaseId) {
  return asArray(snapshot?.relationships).filter((relationship) => (
    RESOURCE_TYPES.has(normalizeType(relationship?.resource_type))
    && sameId(relationship?.resource_id, leaseId)
  ));
}

export function resolveLeaseRelationship(snapshot, leaseId) {
  const relationships = leaseRelationships(snapshot, leaseId);
  const types = relationships.map((relationship) => normalizeType(relationship?.type || relationship?.relationship_type));

  if (types.includes('landlord') || types.includes('lessor') || types.includes('owner')) return 'landlord';
  if (types.includes('tenant') || types.includes('lessee')) return 'tenant';
  if (types.includes('guarantor')) return 'guarantor';
  if (types.includes('manager') || types.includes('representative')) return 'representative';
  return types[0] || null;
}

export function hasContextualPermission(snapshot, permission, options = {}) {
  const { applicationId = null, establishmentId = null, resourceType = null, resourceId = null } = options;

  return asArray(snapshot?.roles).some((assignment) => {
    if (!asArray(assignment?.permissions).includes(permission)) return false;
    if (applicationId && assignment?.application?.id && !sameId(assignment.application.id, applicationId)) return false;
    if (establishmentId && assignment?.establishment?.id && !sameId(assignment.establishment.id, establishmentId)) return false;
    if (resourceType && assignment?.resource_type && normalizeType(assignment.resource_type) !== normalizeType(resourceType)) return false;
    if (resourceId && assignment?.resource_id && !sameId(assignment.resource_id, resourceId)) return false;
    return true;
  });
}

export function currentAccessSnapshot() {
  return accessSnapshot;
}

function rememberContext(context) {
  currentUser = context?.user || currentUser;
  accessSnapshot = context?.contextual_access || accessSnapshot;
  window.__PETER_CONTEXTUAL_ACCESS__ = accessSnapshot;
  window.dispatchEvent(new CustomEvent('peterContextualAccessChanged', { detail: accessSnapshot }));
}

function leaseIdFromUrl(url) {
  const match = String(url || '').match(/\/leases\/(\d+)(?:\/|$)/);
  return match ? Number(match[1]) : null;
}

function operationFromUrl(url) {
  const value = String(url || '');
  if (/\/contract\/generate$/.test(value)) return 'landlord';
  if (/\/contract\/send$/.test(value)) return 'landlord';
  if (/\/charges\/schedule$/.test(value)) return 'landlord';
  if (/\/charges\/\d+\/paid$/.test(value)) return 'landlord';
  if (/\/contract\/sign$/.test(value)) return 'contract_party';
  return null;
}

function contextualGuardError(message, config) {
  const error = new Error(message);
  error.name = 'ContextualAccessError';
  error.config = config;
  error.response = {
    status: 403,
    data: { message },
    config,
  };
  return error;
}

function assertContextualMutation(config) {
  const leaseId = leaseIdFromUrl(config?.url);
  const operation = operationFromUrl(config?.url);
  if (!leaseId || !operation) return config;

  const explicitRelationships = leaseRelationships(accessSnapshot, leaseId);
  if (!explicitRelationships.length) return config; // migration compatibility: backend remains authoritative.

  const relationship = resolveLeaseRelationship(accessSnapshot, leaseId);
  if (operation === 'landlord' && relationship !== 'landlord') {
    throw contextualGuardError('Esta ação exige vínculo de locador neste contrato.', config);
  }
  if (operation === 'contract_party' && !['landlord', 'tenant'].includes(relationship)) {
    throw contextualGuardError('Seu vínculo com este contrato não permite assinar como locador ou locatário.', config);
  }

  if (operation === 'contract_party' && config?.data) {
    try {
      const body = typeof config.data === 'string' ? JSON.parse(config.data) : { ...config.data };
      body.party = relationship;
      config.data = body;
    } catch {
      // Keep original body; the backend still validates the signer relationship.
    }
  }

  return config;
}

function enhanceLeaseResponse(response) {
  const lease = response?.data?.lease;
  if (!lease?.id) return response;

  const relationships = leaseRelationships(accessSnapshot, lease.id);
  if (!relationships.length) return response;

  const relationship = resolveLeaseRelationship(accessSnapshot, lease.id);
  response.data.lease = {
    ...lease,
    contextual_relationship: relationship,
    contextual_relationships: relationships,
  };

  // AppV2 still has a legacy owner boolean. During migration we feed it from
  // the explicit resource relationship instead of allowing a global profile
  // to determine contract powers.
  if (relationship === 'landlord' && currentUser?.id) {
    response.data.lease.landlord_user_id = currentUser.id;
  }

  return response;
}

export function installContextualAccessRuntime(api) {
  if (installed || !api?.interceptors) return;
  installed = true;

  api.interceptors.request.use(assertContextualMutation);
  api.interceptors.response.use((response) => {
    const url = String(response?.config?.url || '');

    if (/\/v1\/apps\/[^/]+\/me(?:\?|$)/.test(url)) {
      const normalized = normalizeAccountContext(response.data);
      rememberContext(normalized);
      response.data = normalized;
      return response;
    }

    if (/\/leases\/\d+(?:\?|$)/.test(url)) return enhanceLeaseResponse(response);
    return response;
  });
}
