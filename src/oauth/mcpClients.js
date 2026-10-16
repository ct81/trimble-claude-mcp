import crypto from 'crypto';

const clients = new Map();

const defaultBaseUrl =
  process.env.PUBLIC_BASE_URL ||
  `http://localhost:${process.env.PORT || 3000}`;

export function registerClient(data) {

  const clientId =
    crypto.randomBytes(24).toString('hex');

  const tokenEndpointAuthMethod =
    data.token_endpoint_auth_method ||
    'none';

  const client = {
    clientId,

    clientSecret:
      tokenEndpointAuthMethod === 'none'
        ? undefined
        : crypto.randomBytes(32).toString('hex'),

    clientName:
      data.client_name ||
      'MCP Client',

    redirectUris:
      data.redirect_uris || [],

    logoUri:
      data.logo_uri ||
      `${defaultBaseUrl}/trimble-mcp-icon.svg`,

    grantTypes:
      data.grant_types || [
        'authorization_code'
      ],

    responseTypes:
      data.response_types || [
        'code'
      ],

    tokenEndpointAuthMethod,

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

// Optional pre-registered client (e.g. Trimble Agent Studio) that survives
// restarts, since dynamically registered clients are held in memory only.
// MCP_CLIENT_REDIRECT_URIS is comma-separated.
function getPreconfiguredClient(clientId) {
  if (
    !process.env.MCP_CLIENT_ID ||
    clientId !== process.env.MCP_CLIENT_ID
  ) {
    return undefined;
  }

  return {
    clientId,
    clientSecret:
      process.env.MCP_CLIENT_SECRET || undefined,
    clientName: 'Preconfigured MCP Client',
    redirectUris:
      (process.env.MCP_CLIENT_REDIRECT_URIS || '')
        .split(',')
        .map(uri => uri.trim())
        .filter(Boolean),
    tokenEndpointAuthMethod:
      process.env.MCP_CLIENT_SECRET
        ? 'client_secret_post'
        : 'none'
  };
}

export function getClient(clientId) {
  return clients.get(clientId) ||
    getPreconfiguredClient(clientId);
}

export function verifyClientSecret(client, secret) {
  if (!client.clientSecret) {
    return true;
  }

  if (!secret) {
    return false;
  }

  const a = Buffer.from(String(secret));
  const b = Buffer.from(client.clientSecret);

  return (
    a.length === b.length &&
    crypto.timingSafeEqual(a, b)
  );
}