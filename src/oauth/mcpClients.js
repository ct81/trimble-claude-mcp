import crypto from 'crypto';

const clients = new Map();

export function registerClient(data) {

  const clientId =
    crypto.randomBytes(24).toString('hex');

  const client = {
    clientId,

    clientName:
      data.client_name ||
      'MCP Client',

    redirectUris:
      data.redirect_uris || [],

    grantTypes:
      data.grant_types || [
        'authorization_code'
      ],

    responseTypes:
      data.response_types || [
        'code'
      ],

    tokenEndpointAuthMethod:
      data.token_endpoint_auth_method ||
      'none',

    applicationType:
      data.application_type ||
      'web',

    createdAt:
      Date.now()
  };

  clients.set(
    clientId,
    client
  );

  return client;
}

export function getClient(clientId) {
  return clients.get(clientId);
}