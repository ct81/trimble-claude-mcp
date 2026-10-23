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

// Used by the WhatsApp bot, which has no browser session of its own.
export function getLatestSessionId(predicate = () => true) {
  let latestId;
  let latestAt = -1;
  for (const [id, data] of sessions) {
    if (predicate(data) && data.updatedAt > latestAt) {
      latestId = id;
      latestAt = data.updatedAt;
    }
  }
  return latestId;
}
