import {
  trimbleRequest
} from './client.js';

export const modelFeature = {

  getGroups(
    sessionId,
    projectId
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/groups`
    );
  },

  getGroup(
    sessionId,
    projectId,
    groupId
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/groups/${encodeURIComponent(groupId)}`
    );
  }

};