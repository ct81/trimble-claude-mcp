import crypto from 'node:crypto';

const tokens = new Map();

export function createMcpAccessToken(
  sessionId,
  resource
) {

  const token =
    crypto
      .randomBytes(48)
      .toString('hex');

  tokens.set(
    token,
    {
      sessionId,

      resource,

      createdAt:
        Date.now(),

      expiresAt:
        Date.now() +
        60 * 60 * 1000
    }
  );

  console.log(
    'Created MCP access token:',
    {
      sessionId,
      resource
    }
  );

  return token;
}


export function getMcpToken(
  token
) {

  const data =
    tokens.get(token);

  if (!data) {
    return null;
  }

  if (
    Date.now() >
    data.expiresAt
  ) {

    tokens.delete(token);

    return null;
  }

  return data;
}


export function getSessionIdFromMcpToken(
  token
) {

  const data =
    getMcpToken(token);

  if (!data) {
    return null;
  }

  return data.sessionId;
}