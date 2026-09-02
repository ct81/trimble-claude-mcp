import crypto from 'node:crypto';

// src/oauth/oauthState.js

const oauthStates = new Map();

const STATE_TTL = 10 * 60 * 1000; // 10 minutes

export function createOAuthState(state, data = {}) {
  if (!state) {
    throw new Error('OAuth state is required');
  }

  const value =
    typeof data === 'object' && data !== null
      ? {
          ...data,
          createdAt: data.createdAt || Date.now()
        }
      : {
          createdAt: Date.now(),
          value: data
        };

  oauthStates.set(state, value);

  console.log(
    '[OAuth State] CREATED:',
    state
  );

  console.log(
    '[OAuth State] COUNT:',
    oauthStates.size
  );

  return state;
}

export function getOAuthState(state) {
  if (!state) {
    return null;
  }

  const data = oauthStates.get(state);

  if (!data) {
    console.log(
      '[OAuth State] NOT FOUND:',
      state
    );

    console.log(
      '[OAuth State] CURRENT COUNT:',
      oauthStates.size
    );

    return null;
  }

  const createdAt =
    data.createdAt || 0;

  if (
    !createdAt ||
    Date.now() - createdAt > STATE_TTL
  ) {
    oauthStates.delete(state);

    console.log(
      '[OAuth State] EXPIRED:',
      state
    );

    return null;
  }

  console.log(
    '[OAuth State] FOUND:',
    state
  );

  return data;
}

export function deleteOAuthState(state) {
  if (!state) {
    return;
  }

  oauthStates.delete(state);

  console.log(
    '[OAuth State] DELETED:',
    state
  );

  console.log(
    '[OAuth State] COUNT:',
    oauthStates.size
  );
}

export function hasOAuthState(state) {
  return oauthStates.has(state);
}
