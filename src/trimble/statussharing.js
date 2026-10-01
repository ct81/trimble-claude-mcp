import {
  trimbleRequest
} from './client.js';
import { refreshIfNeeded } from '../oauth/oauth.js';
import { getSession, updateSession } from '../session-store.js';

const STATUS_SHARING_BASE_URL =
  process.env.TRIMBLE_STATUSSHARING_URL ||
  'https://asia.tcstatus.tekla.com';

function queryString(query = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      params.set(key, String(value));
    }
  }

  const result = params.toString();

  return result ? `?${result}` : '';
}

function statusSharingRequest(sessionId, path, options = {}, projectId) {
  return statusSharingRequestWithToken(sessionId, path, options, projectId);
}

function normalizeStatusQuery(query = {}) {
  const normalized = { ...query };

  if (normalized.objectId === undefined && normalized.modelId !== undefined) {
    normalized.objectId = normalized.modelId;
  }

  delete normalized.modelId;
  return normalized;
}

function getTokenFromResponse(response) {
  const token = typeof response === 'string'
    ? response
    : response?.access_token ||
      response?.accessToken ||
      response?.service_token ||
      response?.serviceToken ||
      response?.token ||
      response?.data?.access_token ||
      response?.data?.accessToken ||
      response?.data?.token;

  return typeof token === 'string'
    ? token.replace(/^Bearer\s+/i, '').trim()
    : '';
}

function cacheServiceToken(sessionId, token, options = {}) {
  const session = getSession(sessionId);
  const projectId = options.projectId;
  const scope = projectId || '*';
  const record = {
    token,
    options: {
      ...(projectId ? { projectId } : {}),
      ...(options.admin !== undefined ? { admin: options.admin } : {})
    }
  };
  const statusSharing = session?.statusSharing || {};

  updateSession(sessionId, {
    statusSharing: {
      ...statusSharing,
      tokens: {
        ...(statusSharing.tokens || {}),
        [scope]: record
      },
      latest: record
    }
  });

  return record;
}

function getCachedServiceToken(session, projectId) {
  const statusSharing = session?.statusSharing;
  if (!statusSharing) return null;

  return (projectId && statusSharing.tokens?.[projectId]) ||
    statusSharing.tokens?.['*'] ||
    statusSharing.latest ||
    null;
}

async function exchangeStatusSharingToken(sessionId, options = {}) {
  const response = await trimbleRequest(
    sessionId,
    `/statusapi/1.0/auth/token${queryString(options)}`,
    {
      method: 'POST',
      baseUrl: STATUS_SHARING_BASE_URL
    }
  );
  const token = getTokenFromResponse(response);

  if (!token) {
    throw new Error('Status Sharing token exchange returned no service token');
  }

  return {
    response,
    tokenRecord: cacheServiceToken(sessionId, token, options)
  };
}

async function statusSharingRequestWithToken(
  sessionId,
  path,
  options = {},
  projectId
) {
  const session = await refreshIfNeeded(sessionId);
  let tokenRecord = getCachedServiceToken(session, projectId);

  if (!tokenRecord) {
    const exchanged = await exchangeStatusSharingToken(
      sessionId,
      projectId ? { projectId } : {}
    );
    tokenRecord = exchanged.tokenRecord;
  }

  const sendRequest = (record) => trimbleRequest(sessionId, path, {
    ...options,
    baseUrl: STATUS_SHARING_BASE_URL,
    headers: {
      ...(options.headers || {}),
      authorization: `Bearer ${record.token}`
    }
  });

  try {
    return await sendRequest(tokenRecord);
  } catch (error) {
    if (!String(error.message).includes('Trimble API 401:')) {
      throw error;
    }

    const exchanged = await exchangeStatusSharingToken(sessionId, tokenRecord.options);
    tokenRecord = exchanged.tokenRecord;
    return sendRequest(tokenRecord);
  }
}

function projectPath(projectId, suffix = '') {
  return `/statusapi/1.0/projects/${encodeURIComponent(projectId)}${suffix}`;
}

function statusActionPath(projectId, statusActionId, suffix = '') {
  return `${projectPath(projectId, '/statusactions')}/${encodeURIComponent(statusActionId)}${suffix}`;
}

export const statusSharing = {

  exchangeToken(sessionId, options = {}) {
    return exchangeStatusSharingToken(sessionId, options)
      .then(({ response }) => response);
  },

  isEnabled(sessionId, projectId) {
    return trimbleRequest(
      sessionId,
      `/statusapi/1.0/auth/enabled/${encodeURIComponent(projectId)}`,
      { baseUrl: STATUS_SHARING_BASE_URL }
    );
  },

  getStatuses(sessionId, projectId, query = {}) {
    return statusSharingRequest(
      sessionId,
      `${projectPath(projectId, '/status')}${queryString(normalizeStatusQuery(query))}`,
      {},
      projectId
    );
  },

  getStatusesPage(sessionId, projectId, query = {}) {
    return statusSharingRequest(
      sessionId,
      `${projectPath(projectId, '/status/page')}${queryString(normalizeStatusQuery(query))}`,
      {},
      projectId
    );
  },

  getCustomStatusValues(sessionId, projectId, statusActionId) {
    return statusSharingRequest(
      sessionId,
      statusActionPath(projectId, statusActionId, '/customstatusvalues'),
      {},
      projectId
    );
  },

  addCustomStatusValues(sessionId, projectId, statusActionId, values) {
    return statusSharingRequest(
      sessionId,
      statusActionPath(projectId, statusActionId, '/customstatusvalues'),
      {
        method: 'POST',
        body: values
      },
      projectId
    );
  },

  getCustomStatusValue(sessionId, projectId, statusActionId, code) {
    return statusSharingRequest(
      sessionId,
      statusActionPath(
        projectId,
        statusActionId,
        `/customstatusvalues/${encodeURIComponent(code)}`
      ),
      {},
      projectId
    );
  },

  updateCustomStatusValue(sessionId, projectId, statusActionId, code, value) {
    return statusSharingRequest(
      sessionId,
      statusActionPath(
        projectId,
        statusActionId,
        `/customstatusvalues/${encodeURIComponent(code)}`
      ),
      {
        method: 'PUT',
        body: value
      },
      projectId
    );
  },

  getStatusActionGroupAccess(sessionId, projectId, statusActionId) {
    return statusSharingRequest(
      sessionId,
      statusActionPath(projectId, statusActionId, '/groupaccess'),
      {},
      projectId
    );
  },

  updateStatusActionGroupAccess(sessionId, projectId, statusActionId, access) {
    return statusSharingRequest(
      sessionId,
      statusActionPath(projectId, statusActionId, '/groupaccess'),
      {
        method: 'PUT',
        body: access
      },
      projectId
    );
  },

  getLicense(sessionId, projectId) {
    return statusSharingRequest(
      sessionId,
      `/statusapi/1.0/license/${encodeURIComponent(projectId)}`,
      {},
      projectId
    );
  },

  getProjects(sessionId) {
    return statusSharingRequest(
      sessionId,
      '/statusapi/1.0/projects',
      {}
    );
  },

  getProject(sessionId, projectId) {
    return statusSharingRequest(
      sessionId,
      `/statusapi/1.0/projects/${encodeURIComponent(projectId)}`,
      {},
      projectId
    );
  },

  getGroups(sessionId, projectId) {
    return statusSharingRequest(
      sessionId,
      projectPath(projectId, '/groups'),
      {},
      projectId
    );
  },

  getStatusActions(sessionId, projectId) {
    return statusSharingRequest(
      sessionId,
      projectPath(projectId, '/statusactions'),
      {},
      projectId
    );
  },

  createStatusAction(sessionId, projectId, statusAction) {
    return statusSharingRequest(
      sessionId,
      projectPath(projectId, '/statusactions'),
      {
        method: 'POST',
        body: statusAction
      },
      projectId
    );
  },

  getStatusAction(sessionId, projectId, statusActionId) {
    return statusSharingRequest(
      sessionId,
      statusActionPath(projectId, statusActionId),
      {},
      projectId
    );
  },

  updateStatusAction(sessionId, projectId, statusActionId, statusAction) {
    return statusSharingRequest(
      sessionId,
      statusActionPath(projectId, statusActionId),
      {
        method: 'PUT',
        body: statusAction
      },
      projectId
    );
  },

  deleteStatusAction(sessionId, projectId, statusActionId) {
    return statusSharingRequest(
      sessionId,
      statusActionPath(projectId, statusActionId),
      { method: 'DELETE' },
      projectId
    );
  },

  getStatusEvents(sessionId, projectId, query = {}) {
    return statusSharingRequest(
      sessionId,
      `${projectPath(projectId, '/statusevents')}${queryString(normalizeStatusQuery(query))}`,
      {},
      projectId
    );
  },

  createStatusEvents(sessionId, projectId, events) {
    return statusSharingRequest(
      sessionId,
      projectPath(projectId, '/statusevents'),
      {
        method: 'POST',
        body: events
      },
      projectId
    );
  },

  getStatusEventsPage(sessionId, projectId, query = {}) {
    return statusSharingRequest(
      sessionId,
      `${projectPath(projectId, '/statusevents/page')}${queryString(normalizeStatusQuery(query))}`,
      {},
      projectId
    );
  },

  getStatusEvent(sessionId, projectId, eventId) {
    return statusSharingRequest(
      sessionId,
      `${projectPath(projectId, '/statusevents')}/${encodeURIComponent(eventId)}`,
      {},
      projectId
    );
  }

};