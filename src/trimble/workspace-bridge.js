import crypto from 'node:crypto';

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
const WORKSPACE_CALL_TIMEOUT_MS = 45 * 1000;
const LONG_POLL_TIMEOUT_MS = 25 * 1000;

const pairingCodes = new Map();
const bridgesBySession = new Map();
const bridgesByToken = new Map();
const pendingCalls = new Map();

function rejectPendingCalls(sessionId, message) {
  for (const [id, pending] of pendingCalls) {
    if (pending.sessionId !== sessionId) continue;

    clearTimeout(pending.timeout);
    pendingCalls.delete(id);
    pending.reject(new Error(message));
  }
}

function removeBridge(bridge, message) {
  if (bridgesBySession.get(bridge.sessionId) === bridge) {
    bridgesBySession.delete(bridge.sessionId);
  }

  bridgesByToken.delete(bridge.token);

  if (bridge.pollWaiter) {
    clearTimeout(bridge.pollWaiter.timeout);
    bridge.pollWaiter.resolve(null);
    bridge.pollWaiter = null;
  }

  rejectPendingCalls(bridge.sessionId, message);
}

function prunePairingCodes() {
  const now = Date.now();

  for (const [code, pairing] of pairingCodes) {
    if (pairing.expiresAt <= now) pairingCodes.delete(code);
  }
}

export function createWorkspacePairing(sessionId) {
  prunePairingCodes();

  const pairingCode = crypto.randomBytes(24).toString('base64url');
  const expiresAt = Date.now() + PAIRING_CODE_TTL_MS;
  pairingCodes.set(pairingCode, { sessionId, expiresAt });

  let extensionManifestUrl = null;
  if (process.env.PUBLIC_BASE_URL) {
    extensionManifestUrl = new URL(
      '/workspace-extension-manifest.json',
      process.env.PUBLIC_BASE_URL
    ).toString();
  }

  return {
    pairingCode,
    extensionManifestUrl,
    expiresInSeconds: PAIRING_CODE_TTL_MS / 1000
  };
}

export function connectWorkspaceBridge(pairingCode) {
  prunePairingCodes();

  const pairing = pairingCodes.get(pairingCode);
  if (!pairing) {
    throw new Error('Workspace pairing code is invalid or expired');
  }

  pairingCodes.delete(pairingCode);

  const existingBridge = bridgesBySession.get(pairing.sessionId);
  if (existingBridge) {
    removeBridge(existingBridge, 'Workspace browser bridge was replaced');
  }

  const bridge = {
    sessionId: pairing.sessionId,
    token: crypto.randomBytes(32).toString('base64url'),
    queue: [],
    pollWaiter: null,
    connectedAt: Date.now(),
    lastSeenAt: Date.now()
  };

  bridgesBySession.set(bridge.sessionId, bridge);
  bridgesByToken.set(bridge.token, bridge);

  return {
    bridgeToken: bridge.token,
    pollTimeoutMs: LONG_POLL_TIMEOUT_MS
  };
}

export function getNextWorkspaceTask(token) {
  const bridge = bridgesByToken.get(token);
  if (!bridge) {
    throw new Error('Workspace browser bridge is not authorized');
  }

  bridge.lastSeenAt = Date.now();
  if (bridge.queue.length > 0) return Promise.resolve(bridge.queue.shift());

  if (bridge.pollWaiter) {
    throw new Error('Only one Workspace browser poll may be active');
  }

  return new Promise((resolve) => {
    const waiter = { resolve, timeout: null };
    waiter.timeout = setTimeout(() => {
      if (bridge.pollWaiter !== waiter) return;
      bridge.pollWaiter = null;
      resolve(null);
    }, LONG_POLL_TIMEOUT_MS);

    bridge.pollWaiter = waiter;
  });
}

export function submitWorkspaceResult(token, { id, result, error } = {}) {
  const bridge = bridgesByToken.get(token);
  if (!bridge) {
    throw new Error('Workspace browser bridge is not authorized');
  }

  bridge.lastSeenAt = Date.now();
  const pending = pendingCalls.get(id);
  if (!pending || pending.sessionId !== bridge.sessionId) {
    throw new Error('Workspace call is unknown or has expired');
  }

  clearTimeout(pending.timeout);
  pendingCalls.delete(id);

  if (error) {
    pending.reject(new Error(String(error.message || error)));
  } else {
    pending.resolve(result);
  }

  return { accepted: true };
}

export function disconnectWorkspaceBridge(token) {
  const bridge = bridgesByToken.get(token);
  if (!bridge) return false;

  removeBridge(bridge, 'Workspace browser bridge disconnected');
  return true;
}

export function invokeWorkspace(sessionId, operation) {
  const bridge = bridgesBySession.get(sessionId);
  if (!bridge) {
    throw new Error(
      'No Trimble Connect browser is paired. Call workspace_pair and open its pairing URL in a Trimble Connect project extension.'
    );
  }

  const id = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCalls.delete(id);
      reject(new Error('Workspace API call timed out waiting for the browser'));
    }, WORKSPACE_CALL_TIMEOUT_MS);

    pendingCalls.set(id, {
      sessionId,
      resolve,
      reject,
      timeout
    });

    const task = { id, ...operation };
    if (bridge.pollWaiter) {
      const waiter = bridge.pollWaiter;
      bridge.pollWaiter = null;
      clearTimeout(waiter.timeout);
      waiter.resolve(task);
    } else {
      bridge.queue.push(task);
    }
  });
}