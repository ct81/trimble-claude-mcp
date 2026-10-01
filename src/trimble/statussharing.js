import {
  trimbleRequest
} from './client.js';

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

function statusSharingRequest(sessionId, path, options = {}) {
  return trimbleRequest(sessionId, path, {
    ...options,
    baseUrl: STATUS_SHARING_BASE_URL
  });
}

function projectPath(projectId, suffix = '') {
  return `/statusapi/1.0/projects/${encodeURIComponent(projectId)}${suffix}`;
}

function statusActionPath(projectId, statusActionId, suffix = '') {
  return `${projectPath(projectId, '/statusactions')}/${encodeURIComponent(statusActionId)}${suffix}`;
}

export const statusSharing = {

  exchangeToken(sessionId, options = {}) {
    return statusSharingRequest(
      sessionId,
      `/statusapi/1.0/auth/token${queryString(options)}`,
      { method: 'POST' }
    );
  },

  isEnabled(sessionId, projectId) {
    return statusSharingRequest(
      sessionId,
      `/statusapi/1.0/auth/enabled/${encodeURIComponent(projectId)}`
    );
  },

  getStatuses(sessionId, projectId, query = {}) {
    return statusSharingRequest(
      sessionId,
      `${projectPath(projectId, '/status')}${queryString(query)}`
    );
  },

  getStatusesPage(sessionId, projectId, query = {}) {
    return statusSharingRequest(
      sessionId,
      `${projectPath(projectId, '/status/page')}${queryString(query)}`
    );
  },

  getCustomStatusValues(sessionId, projectId, statusActionId) {
    return statusSharingRequest(
      sessionId,
      statusActionPath(projectId, statusActionId, '/customstatusvalues')
    );
  },

  addCustomStatusValues(sessionId, projectId, statusActionId, values) {
    return statusSharingRequest(
      sessionId,
      statusActionPath(projectId, statusActionId, '/customstatusvalues'),
      {
        method: 'POST',
        body: values
      }
    );
  },

  getCustomStatusValue(sessionId, projectId, statusActionId, code) {
    return statusSharingRequest(
      sessionId,
      statusActionPath(
        projectId,
        statusActionId,
        `/customstatusvalues/${encodeURIComponent(code)}`
      )
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
      }
    );
  },

  getStatusActionGroupAccess(sessionId, projectId, statusActionId) {
    return statusSharingRequest(
      sessionId,
      statusActionPath(projectId, statusActionId, '/groupaccess')
    );
  },

  updateStatusActionGroupAccess(sessionId, projectId, statusActionId, access) {
    return statusSharingRequest(
      sessionId,
      statusActionPath(projectId, statusActionId, '/groupaccess'),
      {
        method: 'PUT',
        body: access
      }
    );
  },

  getLicense(sessionId, projectId) {
    return statusSharingRequest(
      sessionId,
      `/statusapi/1.0/license/${encodeURIComponent(projectId)}`
    );
  },

  getProjects(sessionId) {
    return statusSharingRequest(
      sessionId,
      '/statusapi/1.0/projects'
    );
  },

  getProject(sessionId, projectId) {
    return statusSharingRequest(
      sessionId,
      `/statusapi/1.0/projects/${encodeURIComponent(projectId)}`
    );
  },

  getGroups(sessionId, projectId) {
    return statusSharingRequest(
      sessionId,
      projectPath(projectId, '/groups')
    );
  },

  getStatusActions(sessionId, projectId) {
    return statusSharingRequest(
      sessionId,
      projectPath(projectId, '/statusactions')
    );
  },

  createStatusAction(sessionId, projectId, statusAction) {
    return statusSharingRequest(
      sessionId,
      projectPath(projectId, '/statusactions'),
      {
        method: 'POST',
        body: statusAction
      }
    );
  },

  getStatusAction(sessionId, projectId, statusActionId) {
    return statusSharingRequest(
      sessionId,
      statusActionPath(projectId, statusActionId)
    );
  },

  updateStatusAction(sessionId, projectId, statusActionId, statusAction) {
    return statusSharingRequest(
      sessionId,
      statusActionPath(projectId, statusActionId),
      {
        method: 'PUT',
        body: statusAction
      }
    );
  },

  deleteStatusAction(sessionId, projectId, statusActionId) {
    return statusSharingRequest(
      sessionId,
      statusActionPath(projectId, statusActionId),
      { method: 'DELETE' }
    );
  },

  getStatusEvents(sessionId, projectId, query = {}) {
    return statusSharingRequest(
      sessionId,
      `${projectPath(projectId, '/statusevents')}${queryString(query)}`
    );
  },

  createStatusEvents(sessionId, projectId, events) {
    return statusSharingRequest(
      sessionId,
      projectPath(projectId, '/statusevents'),
      {
        method: 'POST',
        body: events
      }
    );
  },

  getStatusEventsPage(sessionId, projectId, query = {}) {
    return statusSharingRequest(
      sessionId,
      `${projectPath(projectId, '/statusevents/page')}${queryString(query)}`
    );
  },

  getStatusEvent(sessionId, projectId, eventId) {
    return statusSharingRequest(
      sessionId,
      `${projectPath(projectId, '/statusevents')}/${encodeURIComponent(eventId)}`
    );
  }

};