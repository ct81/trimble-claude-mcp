import {
  trimbleRequest
} from './client.js';

export const model = {

  getModel(
    sessionId,
    projectId,
    modelId
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}`
    );
  },

  getEntities(
    sessionId,
    projectId,
    modelId,
    query = {}
  ) {
    const params =
      new URLSearchParams(query);

    const suffix =
      params.toString()
        ? `?${params}`
        : '';

    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/models/${encodeURIComponent(modelId)}/entities${suffix}`
    );
  }

};