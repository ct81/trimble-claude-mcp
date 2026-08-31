import {
  trimbleRequest
} from './client.js';

export async function getRegions(
  sessionId
) {
  return trimbleRequest(
    sessionId,
    '/regions'
  );
}

export async function getCurrentUser(
  sessionId
) {
  return trimbleRequest(
    sessionId,
    '/users/me'
  );
}