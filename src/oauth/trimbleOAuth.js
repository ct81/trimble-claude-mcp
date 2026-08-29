import crypto from 'node:crypto';
import { config } from '../config.js';

export function authorizationUrlForMcp(transactionId) {

  if (
    !config.trimble.clientId ||
    !config.trimble.authorizationEndpoint
  ) {
    throw new Error(
      'Trimble OAuth configuration is incomplete'
    );
  }

  /*
   * Generate a real Trimble OAuth state.
   */
  const trimbleState =
    crypto.randomBytes(24).toString('hex');

  /*
   * Store the Trimble state.
   *
   * Instead of only storing a timestamp,
   * associate it with the MCP transaction.
   */
  states.set(
    trimbleState,
    {
      createdAt: Date.now(),
      type: 'mcp',
      transactionId
    }
  );

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

  return url.toString();
}