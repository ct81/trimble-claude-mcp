import {
  trimbleRequest
} from './client.js';
import { config } from '../config.js';

function getModelApiBaseUrl() {
  if (process.env.TRIMBLE_MODEL_API_BASE_URL) {
    return process.env.TRIMBLE_MODEL_API_BASE_URL;
  }

  const hostname = new URL(config.trimble.apiBaseUrl).hostname;
  const match = hostname.match(/^app(\d*)\.connect\.trimble\.com$/);

  if (!match) {
    throw new Error(
      'Unable to determine the regional Model API host. Set TRIMBLE_MODEL_API_BASE_URL.'
    );
  }

  const regionNumber = match[1] || '11';
  return `https://model-api${regionNumber}.connect.trimble.com`;
}

const MODEL_API_BASE_URL = getModelApiBaseUrl();

export const model = {

  getModel(
    sessionId,
    projectId,
    modelId
  ) {
    return trimbleRequest(
      sessionId,
      `/models/${encodeURIComponent(modelId)}`,
      { baseUrl: MODEL_API_BASE_URL }
    );
  },

  getEntities(
    sessionId,
    projectId,
    modelId,
    query = {}
  ) {
    const params = new URLSearchParams(query);

    const suffix =
      params.toString()
        ? `?${params}`
        : '';

    return trimbleRequest(
      sessionId,
      `/models/${encodeURIComponent(modelId)}/entities${suffix}`,
      { baseUrl: MODEL_API_BASE_URL }
    );
  }

};