import {
  trimbleRequest
} from './client.js';

export const regions = {

  getRegions(sessionId) {
    return trimbleRequest(
      sessionId,
      '/regions'
    );
  }

};