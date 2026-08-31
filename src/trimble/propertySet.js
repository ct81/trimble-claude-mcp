import {
  trimbleRequest
} from './client.js';

export const propertySet = {

  getLibraries(
    sessionId,
    projectId
  ) {
    return trimbleRequest(
      sessionId,
      `/projects/${encodeURIComponent(projectId)}/property-set-libraries`
    );
  }

};