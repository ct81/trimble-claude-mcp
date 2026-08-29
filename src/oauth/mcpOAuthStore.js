import crypto from 'crypto';

const transactions = new Map();

export function createOAuthTransaction(data) {

  const id =
    crypto.randomUUID();

  transactions.set(id, {
    ...data,
    createdAt: Date.now()
  });

  return id;
}

export function getOAuthTransaction(id) {

  return transactions.get(id);
}

export function deleteOAuthTransaction(id) {

  transactions.delete(id);
}