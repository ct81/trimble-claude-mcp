import crypto from 'node:crypto';

const authorizationCodes = new Map();

export function createAuthorizationCode({
  sessionId,
  clientId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  resource
}) {

  const code =
    crypto
      .randomBytes(48)
      .toString('hex');

  authorizationCodes.set(
    code,
    {
      sessionId,

      clientId,

      redirectUri,

      codeChallenge,

      codeChallengeMethod,

      resource,

      createdAt:
        Date.now(),

      expiresAt:
        Date.now() +
        5 * 60 * 1000
    }
  );

  console.log(
    'Created MCP authorization code'
  );

  console.log({
    clientId,
    redirectUri,
    resource,
    hasCodeChallenge:
      !!codeChallenge
  });

  return code;
}


export function consumeAuthorizationCode(
  code
) {

  const data =
    authorizationCodes.get(code);

  if (!data) {
    return null;
  }

  authorizationCodes.delete(code);

  if (
    Date.now() >
    data.expiresAt
  ) {
    return null;
  }

  return data;
}