import {
  trimbleRequest
} from './client.js';

export const topics = {

  getTopics(
    sessionId,
    projectId,
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
      `/projects/${encodeURIComponent(projectId)}/topics${suffix}`
    );
  },

  getTopic(
    sessionId,
    projectId,
    topicId
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/topics/${encodeURIComponent(topicId)}`
    );
  }

};