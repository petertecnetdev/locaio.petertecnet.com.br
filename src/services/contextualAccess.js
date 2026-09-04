const RESOURCE_TYPES = new Set(['agreement', 'lease', 'real_estate_lease']);
const RELATIONSHIP_PERMISSIONS = {
  landlord: ['agreements.view', 'agreements.manage', 'agreements.sign', 'payments.view', 'payments.manage'],
  tenant: ['agreements.view', 'agreements.sign', 'payments.view'],
  guarantor: ['agreements.view', 'agreements.sign'],
  representative: ['agreements.view', 'agreements.manage', 'agreements.sign'],
};

let accessSnapshot = { roles: [], memberships: [], relationships: [], relationship_summary: {} };
let currentApplicationSlug = 'locaio';
let runtimeApi = null;
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
      relationship_summary: contextualAccess.relationship_summary || {},
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

  if (types.includes('landlord')) return 'landlord';
  if (types.includes('tenant')) return 'tenant';
  if (types.includes('guarantor')) return 'guarantor';
  if (types.includes('representative')) return 'representative';
  return types[0] || null;
}

export function hasContextualPermission(snapshot, permission, options = {}) {
  const { applicationId = null, establishmentId = null, resourceUuid = null, resourceType = null, resourceId = null } = options;

  return asArray(snapshot?.roles).some((assignment) => {
    if (!asArray(assignment?.permissions).includes(permission)) return false;
    if (applicationId && assignment?.application?.id && !sameId(assignment.application.id, applicationId)) return false;
    if (establishmentId && assignment?.establishment?.id && !sameId(assignment.establishment.id, establishmentId)) return false;
    if (resourceUuid && assignment?.resource?.uuid && normalizeType(assignment.resource.uuid) !== normalizeType(resourceUuid)) return false;
    if (resourceType && assignment?.resource_type && normalizeType(assignment.resource_type) !== normalizeType(resourceType)) return false;
    if (resourceId && assignment?.resource_id && !sameId(assignment.resource_id, resourceId)) return false;
    return true;
  });
}

export function currentAccessSnapshot() {
  return accessSnapshot;
}

function rememberContext(context) {
  currentApplicationSlug = context?.application?.slug || currentApplicationSlug;
  accessSnapshot = context?.contextual_access || accessSnapshot;
  window.__PETER_CONTEXTUAL_ACCESS__ = accessSnapshot;
  if (window.PeterTecnetAccess) {
    window.PeterTecnetAccess.configure({ appSlug: currentApplicationSlug });
    window.PeterTecnetAccess.setSnapshot(accessSnapshot);
  }
  window.dispatchEvent(new CustomEvent('peterContextualAccessChanged', { detail: accessSnapshot }));
}

function mergeRelationships(relationships) {
  const incoming = asArray(relationships);
  if (!incoming.length) return;
  const incomingIds = new Set(incoming.map(item => String(item.id)));
  accessSnapshot = {
    ...accessSnapshot,
    relationships: [...asArray(accessSnapshot.relationships).filter(item => !incomingIds.has(String(item.id))), ...incoming],
  };
  window.__PETER_CONTEXTUAL_ACCESS__ = accessSnapshot;
  window.PeterTecnetAccess?.setSnapshot(accessSnapshot);
}

async function ensureLeaseRelationships(leaseId) {
  if (!runtimeApi || !leaseId) return leaseRelationships(accessSnapshot, leaseId);
  const existing = leaseRelationships(accessSnapshot, leaseId);
  if (existing.length) return existing;

  try {
    const response = await runtimeApi.get(`/v1/apps/${currentApplicationSlug}/me/relationships`, {
      params: { resource_id: leaseId, per_page: 20 },
    });
    const relationships = asArray(response?.data?.data).filter(item => RESOURCE_TYPES.has(normalizeType(item?.resource_type)));
    mergeRelationships(relationships);
    return relationships;
  } catch {
    return existing;
  }
}

function leaseIdFromUrl(url) {
  const match = String(url || '').match(/\/leases\/(\d+)(?:\/|$)/);
  return match ? Number(match[1]) : null;
}

function operationFromUrl(url) {
  const value = String(url || '');
  if (/\/contract\/generate$/.test(value)) return { relationship: 'landlord', permission: 'agreements.manage' };
  if (/\/contract\/send$/.test(value)) return { relationship: 'landlord', permission: 'agreements.manage' };
  if (/\/charges\/schedule$/.test(value)) return { relationship: 'landlord', permission: 'payments.manage' };
  if (/\/charges\/\d+\/paid$/.test(value)) return { relationship: 'landlord', permission: 'payments.manage' };
  if (/\/contract\/sign$/.test(value)) return { relationship: 'contract_party', permission: 'agreements.sign' };
  return null;
}

function contextualGuardError(message, config) {
  const error = new Error(message);
  error.name = 'ContextualAccessError';
  error.config = config;
  error.response = { status: 403, data: { message }, config };
  return error;
}

async function authorizeRegisteredResource(config, relationships, permission) {
  const resource = relationships.map(item => item?.resource).find(item => item?.uuid);
  if (!resource?.uuid || !runtimeApi) return config;

  const response = await runtimeApi.post(`/v1/apps/${currentApplicationSlug}/resources/${resource.uuid}/authorize`, { permission });
  if (!response?.data?.allowed) throw contextualGuardError('A API negou esta ação para o seu vínculo atual.', config);

  config.headers = {
    ...(config.headers || {}),
    'X-Peter-Resource': resource.uuid,
    'X-Peter-Permission': permission,
  };
  return config;
}

async function assertContextualMutation(config) {
  const leaseId = leaseIdFromUrl(config?.url);
  const operation = operationFromUrl(config?.url);
  if (!leaseId || !operation) return config;

  const explicitRelationships = await ensureLeaseRelationships(leaseId);
  if (!explicitRelationships.length) return config; // compatibility only until legacy contracts are registered.

  const relationship = resolveLeaseRelationship(accessSnapshot, leaseId);
  if (operation.relationship === 'landlord' && relationship !== 'landlord') {
    throw contextualGuardError('Esta ação exige vínculo de locador neste contrato.', config);
  }
  if (operation.relationship === 'contract_party' && !['landlord', 'tenant', 'guarantor', 'representative'].includes(relationship)) {
    throw contextualGuardError('Seu vínculo com este contrato não permite esta assinatura.', config);
  }

  await authorizeRegisteredResource(config, explicitRelationships, operation.permission);

  if (operation.relationship === 'contract_party' && config?.data) {
    try {
      const body = typeof config.data === 'string' ? JSON.parse(config.data) : { ...config.data };
      body.party = relationship;
      config.data = body;
    } catch {
      // O backend continua sendo a autoridade sobre o corpo enviado.
    }
  }

  return config;
}

function viewerPermissions(leaseId, relationship, resourceUuid) {
  const rolePermissions = asArray(accessSnapshot.roles)
    .filter(role => {
      if (resourceUuid && role?.resource?.uuid) return normalizeType(role.resource.uuid) === normalizeType(resourceUuid);
      if (role?.resource_id) return sameId(role.resource_id, leaseId);
      return !role?.resource_id && !role?.resource?.uuid;
    })
    .flatMap(role => asArray(role.permissions));
  return [...new Set([...rolePermissions, ...(RELATIONSHIP_PERMISSIONS[relationship] || [])])];
}

async function enhanceLeaseResponse(response) {
  const lease = response?.data?.lease;
  if (!lease?.id) return response;

  const relationships = await ensureLeaseRelationships(lease.id);
  if (!relationships.length) return response;

  const relationship = resolveLeaseRelationship(accessSnapshot, lease.id);
  const resource = relationships.map(item => item?.resource).find(item => item?.uuid) || null;
  response.data.lease = {
    ...lease,
    contextual_relationship: relationship,
    contextual_relationships: relationships,
    viewer_relationship: relationship,
    viewer_resource_uuid: resource?.uuid || null,
    viewer_permissions: viewerPermissions(lease.id, relationship, resource?.uuid),
  };

  return response;
}

export function installContextualAccessRuntime(api) {
  if (installed || !api?.interceptors) return;
  installed = true;
  runtimeApi = api;

  api.interceptors.request.use(assertContextualMutation);
  api.interceptors.response.use(async (response) => {
    const url = String(response?.config?.url || '');

    if (/\/v1\/apps\/[^/]+\/me(?:\?|$)/.test(url) && !/\/me\/relationships/.test(url)) {
      const normalized = normalizeAccountContext(response.data);
      rememberContext(normalized);
      response.data = normalized;
      return response;
    }

    if (/\/leases\/\d+(?:\?|$)/.test(url)) return enhanceLeaseResponse(response);
    return response;
  });
}
