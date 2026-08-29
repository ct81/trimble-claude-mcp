import crypto from 'node:crypto';

const transactions = new Map();

export function createOAuthTransaction({
  clientId,
  redirectUri,
  state,
  codeChallenge,
  codeChallengeMethod,
  resource
}) {

  const transactionId =
    crypto
      .randomBytes(32)
      .toString('hex');

  transactions.set(
    transactionId,
    {
      transactionId,

      clientId,

      redirectUri,

      state,

      codeChallenge,

      codeChallengeMethod,

      resource,

      createdAt:
        Date.now(),

      expiresAt:
        Date.now() +
        10 * 60 * 1000
    }
  );

  console.log(
    'Created MCP OAuth transaction:',
    {
      transactionId,
      clientId,
      redirectUri,
      resource
    }
  );

  return transactionId;
}


export function getOAuthTransaction(
  transactionId
) {

  const transaction =
    transactions.get(transactionId);

  if (!transaction) {
    return null;
  }

  if (
    Date.now() >
    transaction.expiresAt
  ) {

    transactions.delete(
      transactionId
    );

    return null;
  }

  return transaction;
}


export function deleteOAuthTransaction(
  transactionId
) {

  transactions.delete(
    transactionId
  );
}