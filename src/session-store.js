import crypto from 'node:crypto';

const sessions = new Map();

export function createSession(data) {
  const id = crypto.randomUUID();
  sessions.set(id, { ...data, createdAt: Date.now(), updatedAt: Date.now() });
  return id;
}
export function getSession(id) { return id ? sessions.get(id) : undefined; }
export function updateSession(id, patch) {
  const current = sessions.get(id); if (!current) return undefined;
  const next = { ...current, ...patch, updatedAt: Date.now() }; sessions.set(id, next); return next;
}
export function deleteSession(id) { sessions.delete(id); }

// IMPORTANT: this in-memory store is for development only. Replace with Firestore/Redis/Postgres before multi-instance production use.
