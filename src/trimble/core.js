import {
  trimbleRequest
} from './client.js';

function queryString(query = {}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (
      value !== undefined &&
      value !== null &&
      value !== ''
    ) {
      params.set(
        key,
        String(value)
      );
    }
  }

  const result = params.toString();

  return result
    ? `?${result}`
    : '';
}

export const core = {

  getCurrentUser(sessionId) {
    return trimbleRequest(
      sessionId,
      '/users/me'
    );
  },

  getRegions(sessionId) {
    return trimbleRequest(
      sessionId,
      '/regions'
    );
  },

  getProjects(
    sessionId,
    query = {}
  ) {
    return trimbleRequest(
      sessionId,
      `/projects${queryString(query)}`
    );
  },

  getProject(
    sessionId,
    projectId
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}`
    );
  },

  getFolders(
    sessionId,
    projectId,
    query = {}
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/folders${queryString(query)}`
    );
  },

  getFiles(
    sessionId,
    projectId,
    query = {}
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/files${queryString(query)}`
    );
  }

};