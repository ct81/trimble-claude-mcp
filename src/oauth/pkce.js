import crypto from 'crypto';

export function verifyPkce(
  codeVerifier,
  codeChallenge
) {

  if (
    !codeVerifier ||
    !codeChallenge
  ) {
    return false;
  }

  const hash =
    crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest();

  const calculated =
    hash.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

  return calculated === codeChallenge;
}