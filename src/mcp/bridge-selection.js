import { AsyncLocalStorage } from 'node:async_hooks';

const bridgeContext = new AsyncLocalStorage();
const selections = new Map();

export function withBridgeSession(sessionId, callback) {
  return bridgeContext.run(sessionId, callback);
}

export function getSelectedBridge(platform) {
  const sessionId = bridgeContext.getStore();
  return sessionId ? selections.get(sessionId)?.[platform] || null : null;
}

export function selectBridge(sessionId, platform, value) {
  if (!selections.has(sessionId)) selections.set(sessionId, {});
  selections.get(sessionId)[platform] = value;
}