import crypto from 'crypto';

const authorizationCodes =
  new Map();

export function createAuthorizationCode(data) {

  const code =
    crypto.randomBytes(32).toString('hex');

  authorizationCodes.set(
    code,
    {
      ...data,
      createdAt: Date.now()
    }
  );

  return code;
}

export function consumeAuthorizationCode(code) {

  const data =
    authorizationCodes.get(code);

  if (!data) {
    return null;
  }

  /*
   * Authorization codes are single-use.
   */
  authorizationCodes.delete(code);

  return data;
}