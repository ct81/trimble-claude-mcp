import crypto from 'node:crypto';

import {
  config
} from '../config.js';

import {
  createSession,
  getSession,
  updateSession
} from '../session-store.js';

import {
  getSessionIdFromMcpToken
} from './mcpTokens.js';

import {
  getOAuthState,
  deleteOAuthState
} from './oauthState.js';

export function authorizationUrlForMcp(
  transactionId
) {

  if (
    !config.trimble.clientId ||
    !config.trimble.authorizationEndpoint
  ) {

    throw new Error(
      'Trimble OAuth configuration is incomplete'
    );
  }

  const trimbleState =
    createOAuthState({
      type: 'mcp',
      transactionId
    });

  const url =
    new URL(
      config.trimble.authorizationEndpoint
    );

  url.searchParams.set(
    'client_id',
    config.trimble.clientId
  );

  url.searchParams.set(
    'redirect_uri',
    config.trimble.redirectUri
  );

  url.searchParams.set(
    'response_type',
    'code'
  );

  url.searchParams.set(
    'scope',
    config.trimble.scope
  );

  url.searchParams.set(
    'state',
    trimbleState
  );

  console.log(
    'Trimble OAuth URL generated'
  );

  return url.toString();
}