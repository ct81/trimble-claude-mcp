import {
  createWorkspaceClient,
  workspaceApiGroups
} from '/src/trimble/workspace.js';

const form = document.querySelector('#pair-form');
const pairingInput = document.querySelector('#pairing-code');
const pairButton = document.querySelector('#pair-button');
const statusText = document.querySelector('#status');
const pairingCodeFromUrl = new URLSearchParams(location.search).get('pairingCode');

if (pairingCodeFromUrl) pairingInput.value = pairingCodeFromUrl;

let workspaceApi;
let workspaceClient;
let bridgeToken;

function setStatus(message) {
  statusText.textContent = message;
}

function getMethodNames(value) {
  const names = new Set();

  for (let current = value; current && current !== Object.prototype; current = Object.getPrototypeOf(current)) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name !== 'constructor' && typeof value[name] === 'function') {
        names.add(name);
      }
    }
  }

  return [...names].sort();
}

function serializeResult(result) {
  if (result === undefined) return null;

  try {
    return JSON.parse(JSON.stringify(result));
  } catch {
    throw new Error('Workspace API returned a value that cannot be serialized as JSON');
  }
}

async function callWorkspaceApi(task) {
  if (task.action === 'list') {
    return Object.fromEntries(
      workspaceApiGroups.map((groupName) => [
        groupName,
        getMethodNames(workspaceClient[groupName])
      ])
    );
  }

  if (task.action !== 'invoke' || !workspaceApiGroups.includes(task.group)) {
    throw new Error('Unsupported Workspace API operation');
  }

  return serializeResult(
    await workspaceClient.call(task.group, task.method, ...(task.args || []))
  );
}

async function sendResult(result) {
  const response = await fetch('/api/workspace/bridge/results', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bridgeToken}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(result)
  });

  if (!response.ok) {
    throw new Error(`Bridge result rejected (${response.status})`);
  }
}

async function handleTask(task) {
  try {
    await sendResult({ id: task.id, result: await callWorkspaceApi(task) });
  } catch (error) {
    await sendResult({
      id: task.id,
      error: { message: error.message || String(error) }
    });
  }
}

async function pollTasks() {
  while (bridgeToken) {
    try {
      const response = await fetch('/api/workspace/bridge/tasks', {
        headers: { authorization: `Bearer ${bridgeToken}` }
      });

      if (!response.ok) {
        throw new Error(`Bridge poll failed (${response.status})`);
      }

      const { task } = await response.json();
      if (task) await handleTask(task);
    } catch (error) {
      bridgeToken = null;
      pairButton.disabled = false;
      setStatus(error.message || String(error));
    }
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  pairButton.disabled = true;
  setStatus('Connecting to Trimble Connect...');

  try {
    const sdk = window.TrimbleConnectWorkspace;
    if (!sdk || typeof sdk.connect !== 'function') {
      throw new Error('Trimble Connect Workspace SDK did not load');
    }

    workspaceApi = await sdk.connect(window.parent);
    workspaceClient = createWorkspaceClient(workspaceApi);

    const response = await fetch('/api/workspace/bridge/connect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pairingCode: pairingInput.value.trim() })
    });

    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Pairing failed');

    bridgeToken = body.bridgeToken;
    pairingInput.disabled = true;
    setStatus('Connected to this MCP session');
    pollTasks();
  } catch (error) {
    pairButton.disabled = false;
    setStatus(error.message || String(error));
  }
});