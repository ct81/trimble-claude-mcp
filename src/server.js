// Trimble AEC Connect (Captures Architecture, Engineering, & Construction workflows)

// git add . 
// git commit -m "Start MCP, Whatsapp ChatBots, Workflow Builder, Firebase Realtime Database, Swagger, HTML & Javascript, PDF/JSON Extractor, Python, Custom LLM-powered template generation, Trimble Agent Studio, Tekla Open APIs, TSD APIs, SketchUp Ruby APIs, TC Status Sharing, Workspace, Core, Model, ModelFeature, Organizer, Property Set, Regions & Topics APIs 
// #48"
// git push origin main

// git add src/mcp/http.js src/mcp/tools.js
// git commit -m "Fix MCP PDF input handling and diagnostics"
// git push origin main

// Redeploy on Render.
// Open https://trimble-claude-mcp-g86i.onrender.com/oauth/login and sign in with Trimble.
// Copy the x-mcp-session header from the success page into the Agent Studio connector's custom headers.
// Retry. The Render log should show hasBearer: false, and the call should authenticate through the session header.

//include all topic APIs to topics.js and use for mcp, swagger and server.js. and also tags: ['Core'],  summary:

import express from 'express';
import swaggerUi from 'swagger-ui-express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { askClaude } from './claude/client.js';
import { realtimeDb } from './firebase-database.js';
import { createSession, getSession, getSessionEmail } from './session-store.js';
import { extractTrimbleEmail } from './trimble/identity.js';
import { authorizationUrl, exchangeCode, requireSession } from './oauth/oauth.js';
// import { tools } from './trimble/client.js';
import { definitions, getDefinitions, callTool } from './mcp/tools.js';
import { handleMcp } from './mcp/http.js';
import {
  handleIncomingWebhook,
  consumeWhatsAppLoginToken,
  setWhatsAppSessionId,
  verifyWebhook as verifyWhatsAppWebhook
} from './whatsapp/bot.js';
import {
  createOAuthTransaction,
  getOAuthTransaction,
  deleteOAuthTransaction
} from './oauth/mcpOAuthStore.js';

import {
  createAuthorizationCode,
  consumeAuthorizationCode
} from './oauth/mcpAuthorizationCodes.js';

import {
  authorizationUrlForMcp
} from './oauth/trimbleOAuth.js';

import {
  verifyPkce
} from './oauth/pkce.js';

import {
  createMcpAccessToken,
  createMcpRefreshToken,
  consumeMcpRefreshToken,
  getSessionIdFromMcpToken
} from './oauth/mcpTokens.js';

import {
  registerClient,
  getClient,
  verifyClientSecret
} from './oauth/mcpClients.js';

import {
  getOAuthState,
  deleteOAuthState,
  createOAuthState
} from './oauth/oauthState.js';

// import {
//   swaggerDocument
// } from './swagger/swagger.js';
import {
  swaggerDocument,
  getSwaggerDocument
} from './swagger/swagger.js';

import {
  core,
  model,
  modelFeature,
  organizer,
  propertySet,
  regions,
  statusSharing,
  topics
} from './trimble/index.js';
import {
  connectWorkspaceBridge,
  disconnectWorkspaceBridge,
  getNextWorkspaceTask,
  submitWorkspaceResult
} from './trimble/workspace-bridge.js';

import pdfRouter
  from './pdf/pdf.js';

// =========================================================
// REQUEST ORIGIN LOGGING (which client / agent is calling)
// =========================================================

const AGENT_STUDIO_PATTERN = /trimble|agent[\s-]?studio/i;

// Clients known to start an OAuth flow from a 401 challenge. Others (e.g. Agent
// Studio, python-httpx) treat 401 as fatal, so they get a readable tool error.
const OAUTH_CHALLENGE_CLIENT_PATTERN = /claude|anthropic|openai|chatgpt|cursor|vscode|visual studio code|mcp-remote/i;

function describeCaller(req, extra = {}) {
  const h = req.headers;
  const hints = [
    h['user-agent'],
    h.origin,
    h.referer,
    extra.clientName,
    extra.redirectUri
  ].filter(Boolean).join(' ');

  return {
    isAgentStudio: AGENT_STUDIO_PATTERN.test(hints),
    userAgent: h['user-agent'],
    origin: h.origin,
    referer: h.referer,
    ip: req.ip,
    forwardedFor: h['x-forwarded-for'],
    ...extra
  };
}

function logCaller(label, req, extra) {
  console.log(`[${label}] Caller:`, JSON.stringify(describeCaller(req, extra)));
}

// =========================================================
// MCP BEARER AUTHENTICATION
// =========================================================

const trimbleTokenSessions = new Map();

async function sessionFromTrimbleToken(token) {
  const cached = trimbleTokenSessions.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached.sessionId;
  trimbleTokenSessions.delete(token);

  try {
    const r = await fetch(`${config.trimble.apiBaseUrl}/users/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!r.ok) return undefined;
    let profile;
    try {
      profile = await r.json();
    } catch (error) {
      console.warn('[MCP Auth] Could not read Trimble profile email:', error.message);
    }
    const email = extractTrimbleEmail(profile);
    if (!email) console.warn('[MCP Auth] Trimble profile did not include an email address');
    const sessionId = createSession({
      email,
      trimble: {
        access_token: token,
        token_type: 'Bearer',
        expires_in: 3300,
        obtained_at: Date.now()
      }
    });
    trimbleTokenSessions.set(token, { sessionId, expiresAt: Date.now() + 55 * 60 * 1000 });
    console.log('[MCP Auth] Trimble bearer login completed', {
      email: email || 'unavailable'
    });
    return sessionId;
  } catch (error) {
    console.error('[MCP Auth] Trimble bearer profile lookup failed:', error.message);
    return undefined;
  }
}

async function requireMcpBearer(req, res, next) {
  try {
    const authorization =
      req.headers.authorization || '';

    if (!authorization) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Missing Authorization header'
      });
    }

    const match =
      authorization.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Authorization header must use Bearer authentication'
      });
    }

    const accessToken =
      match[1].trim();

    if (!accessToken) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Missing Bearer token'
      });
    }

    // Convert MCP access token → existing Trimble session ID
    let sessionId =
      getSessionIdFromMcpToken(accessToken);

    // Browser clients (workflowBuilder.html) send a raw Trimble access token.
    if (!sessionId) {
      sessionId = await sessionFromTrimbleToken(accessToken);
    }

    if (!sessionId) {
      return res.status(401).json({
        error: 'invalid_token',
        error_description: 'Invalid or expired MCP access token'
      });
    }

    // Make the MCP handler see the same session
    // that requireSession normally provides.
    req.mcpSessionId = sessionId;
    req.session = getSession(sessionId);

    console.log(
      '[MCP Bearer] Authentication successful',
      { email: getSessionEmail(sessionId) || 'unavailable' }
    );

    return next();

  } catch (error) {

    console.error(
      '[MCP Bearer] Authentication failed:',
      error
    );

    return res.status(401).json({
      error: 'invalid_token',
      error_description: 'Invalid MCP access token'
    });
  }
}

// =========================================================
// MCP AUTH AUTO-DETECTION
// =========================================================

function requireMcpAuth(req, res, next) {

  const authorization =
    req.headers.authorization || '';

  // -----------------------------------------
  // Bearer token
  // -----------------------------------------

  if (
    /^Bearer\s+/i.test(
      authorization
    )
  ) {

    console.log(
      '[MCP Auth] Bearer authentication detected'
    );

    return requireMcpBearer(
      req,
      res,
      next
    );
  }

  // -----------------------------------------
  // Existing session / cookie authentication
  // -----------------------------------------

  console.log(
    '[MCP Auth] Session authentication detected'
  );

  return requireSession(
    req,
    res,
    next
  );
}

function requireMcpAuthForRequest(req, res, next) {
  // For connectors (e.g. Agent Studio) with no custom-header field.
  if (
    typeof req.query?.session === 'string' &&
    req.query.session &&
    !req.headers['x-mcp-session']
  ) {
    req.headers['x-mcp-session'] = req.query.session;
  }

  if (
    ['initialize', 'notifications/initialized', 'tools/list'].includes(
      req.body?.method
    )
  ) {
    return next();
  }

  // The start menu is static and needs no session; platform selection does.
  if (
    req.body?.method === 'tools/call' &&
    req.body?.params?.name === 'trimble_get_started' &&
    !req.body?.params?.arguments?.platform
  ) {
    return next();
  }

  if (
    req.body?.method === 'tools/call' &&
    !req.headers.authorization &&
    !req.headers['x-mcp-session'] &&
    !req.cookies?.mcp_session
  ) {
    const loginUrl = `${mcpBaseUrl(req)}/oauth/login`;

    if (!OAUTH_CHALLENGE_CLIENT_PATTERN.test(req.headers['user-agent'] || '')) {
      return res.status(200).json({
        jsonrpc: '2.0',
        id: req.body.id ?? null,
        result: {
          isError: true,
          content: [{
            type: 'text',
            text:
              `Not signed in to Trimble. Open ${loginUrl} in a browser, sign in, ` +
              'then send the session value shown on the success page as the ' +
              '"x-mcp-session" header on this connector, or connect the server with OAuth.'
          }]
        }
      });
    }

    res.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="${mcpBaseUrl(req)}/.well-known/oauth-protected-resource"`
    );
    return res.status(401).json({
      jsonrpc: '2.0',
      id: req.body.id ?? null,
      error: {
        code: -32001,
        message: 'Unauthorized: Trimble sign-in is required.'
      }
    });
  }

  return requireMcpAuth(req, res, next);
}

const app = express();
const workflowStorageDirectory = path.join(process.cwd(), 'pages', 'datastorage');
const workflowStoragePath = path.join(workflowStorageDirectory, 'workflowbuilder.json');
const workflowDbPath = 'workflowbuilder';
const maxWorkflows = 100;
const maxWorkflowFileBase64 = 8 * 1024 * 1024;
const maxWorkflowBytes = 9 * 1024 * 1024;
const maxLibraryBytes = 50 * 1024 * 1024;
const workflowDocumentId = (name) => createHash('sha256').update(name.toLowerCase()).digest('hex');
const workflowNodeTypes = new Set([
  'start', 'upload', 'upload_excel', 'upload_csv', 'upload_ifc', 'upload_dxf', 'upload_pdf',
  'mcp', 'result', 'export_excel', 'export_csv'
]);
const workflowNodePorts = {
  start: { out: true },
  upload: { in: true, out: true },
  upload_excel: { in: true, out: true },
  upload_csv: { in: true, out: true },
  upload_ifc: { in: true, out: true },
  upload_dxf: { in: true, out: true },
  upload_pdf: { in: true, out: true },
  mcp: { in: true, out: true },
  result: { in: true, out: true },
  export_excel: { in: true },
  export_csv: { in: true }
};

function validateWorkflowDocument(workflow) {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow) ||
      workflow.version !== 1 || !Array.isArray(workflow.nodes) ||
      !Array.isArray(workflow.edges) || workflow.nodes.length > 200 ||
      workflow.edges.length > 1000) {
    throw new Error('Workflow must have version 1, nodes, and edges arrays within supported limits');
  }

  const nodeIds = new Set();
  const nodes = workflow.nodes.map((node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node) ||
        typeof node.id !== 'string' || node.id.length < 1 || node.id.length > 64 ||
        nodeIds.has(node.id) || !workflowNodeTypes.has(node.type) ||
        !Number.isFinite(node.x) || node.x < 0 || node.x > 8000 ||
        !Number.isFinite(node.y) || node.y < 0 || node.y > 8000) {
      throw new Error('Workflow contains an invalid node');
    }
    nodeIds.add(node.id);

    const normalized = { id: node.id, type: node.type, x: node.x, y: node.y };
    if (node.sized === true) {
      if (!Number.isFinite(node.width) || node.width < 160 || node.width > 8000 ||
          !Number.isFinite(node.height) || node.height < 90 || node.height > 8000) {
        throw new Error('Workflow contains invalid node dimensions');
      }
      normalized.sized = true;
      normalized.width = node.width;
      normalized.height = node.height;
    }
    if (node.type.startsWith('upload') && node.file !== undefined) {
      const file = node.file;
      if (!file || typeof file !== 'object' || Array.isArray(file) ||
          typeof file.name !== 'string' || !file.name || file.name.length > 255 ||
          (file.type !== undefined && (typeof file.type !== 'string' || file.type.length > 200)) ||
          typeof file.base64 !== 'string' || file.base64.length > maxWorkflowFileBase64 ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(file.base64)) {
        throw new Error('Workflow contains an invalid uploaded file');
      }
      normalized.file = { name: file.name, type: file.type || '', base64: file.base64 };
    }
    if (node.type === 'mcp') {
      const settings = node.settings;
      if (!settings || typeof settings !== 'object' || Array.isArray(settings) ||
          typeof settings.url !== 'string' || settings.url.length > 2048 ||
          typeof settings.tool !== 'string' || settings.tool.length > 200 ||
          typeof settings.args !== 'string' || settings.args.length > 50000) {
        throw new Error('Workflow contains invalid MCP node settings');
      }
      normalized.settings = {
        url: settings.url,
        tool: settings.tool,
        args: settings.args
      };
    }
    return normalized;
  });

  const edgeIds = new Set();
  const connections = new Set();
  const edges = workflow.edges.map((edge) => {
    if (!edge || typeof edge !== 'object' || Array.isArray(edge) ||
        typeof edge.id !== 'string' || edge.id.length < 1 || edge.id.length > 64 ||
        edgeIds.has(edge.id) || typeof edge.from !== 'string' ||
        typeof edge.to !== 'string' || !nodeIds.has(edge.from) ||
        !nodeIds.has(edge.to) || edge.from === edge.to) {
      throw new Error('Workflow contains an invalid connection');
    }
    const fromNode = nodes.find((node) => node.id === edge.from);
    const toNode = nodes.find((node) => node.id === edge.to);
    const connection = `${edge.from}\n${edge.to}`;
    if (!workflowNodePorts[fromNode.type].out || !workflowNodePorts[toNode.type].in ||
        connections.has(connection)) {
      throw new Error('Workflow contains an invalid or duplicate connection');
    }
    edgeIds.add(edge.id);
    connections.add(connection);
    return { id: edge.id, from: edge.from, to: edge.to };
  });

  return { version: 1, nodes, edges };
}

function validateWorkflowName(name) {
  if (typeof name !== 'string') throw new Error('Workflow name is required');
  const normalized = name.trim();
  if (!normalized || normalized.length > 100 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error('Workflow name must be 1-100 characters and contain no control characters');
  }
  return normalized;
}

function normalizeUpdatedBy(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 254 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('Workflow updatedBy must be a valid email');
  }
  return value.trim().toLowerCase();
}

async function readWorkflowLibrary() {
  let contents;
  try {
    contents = await readFile(workflowStoragePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const document = JSON.parse(contents);
  if (document?.version === 1 && Array.isArray(document.workflows)) {
    if (document.workflows.length > maxWorkflows) throw new Error('Workflow library exceeds the 100 workflow limit');
    const names = new Set();
    return document.workflows.map((entry) => {
      const name = validateWorkflowName(entry?.name);
      const normalizedName = name.toLowerCase();
      if (names.has(normalizedName)) throw new Error('Workflow library contains duplicate names');
      names.add(normalizedName);
      return { name, workflow: validateWorkflowDocument(entry.workflow), updatedBy: normalizeUpdatedBy(entry.updatedBy) };
    });
  }

  if (document?.version === 1 && Array.isArray(document.nodes) && Array.isArray(document.edges)) {
    const workflow = validateWorkflowDocument(document);
    return workflow.nodes.length || workflow.edges.length ? [{ name: 'Default', workflow }] : [];
  }

  throw new Error('Saved workflow library has an unsupported format');
}

async function writeWorkflowLibrary(workflows) {
  const serialized = `${JSON.stringify({ version: 1, workflows }, null, 2)}\n`;
  if (Buffer.byteLength(serialized, 'utf8') > maxLibraryBytes) {
    const error = new Error('Workflow library exceeds the 50 MB storage limit');
    error.status = 413;
    throw error;
  }
  await mkdir(workflowStorageDirectory, { recursive: true });
  const temporaryPath = path.join(workflowStorageDirectory, `.workflowbuilder-${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, serialized, { flag: 'wx' });
    await rename(temporaryPath, workflowStoragePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

// Realtime Database layout: names/<id> = name (cheap listing) and items/<id> =
// {name, workflow (JSON string), updatedAt}.
// owners/<id> = updatedBy email, used to filter the list without reading workflow bodies.
async function listWorkflowNames(updatedBy = '') {
  if (!realtimeDb) {
    return (await readWorkflowLibrary())
      .filter((entry) => !updatedBy || entry.updatedBy === updatedBy)
      .map(({ name }) => name);
  }
  const [names, owners] = await Promise.all([
    realtimeDb.ref(`${workflowDbPath}/names`).get(),
    updatedBy ? realtimeDb.ref(`${workflowDbPath}/owners`).get() : null
  ]);
  const ownerMap = owners?.val() || {};
  return Object.entries(names.val() || {})
    .filter(([id]) => !updatedBy || ownerMap[id] === updatedBy)
    .map(([, name]) => name)
    .sort((a, b) => a.localeCompare(b));
}

async function getSavedWorkflow(name, updatedBy = '') {
  if (!realtimeDb) {
    return (await readWorkflowLibrary()).find((entry) =>
      entry.name.toLowerCase() === name.toLowerCase() && (!updatedBy || entry.updatedBy === updatedBy)) || null;
  }
  const snapshot = await realtimeDb.ref(`${workflowDbPath}/items/${workflowDocumentId(name)}`).get();
  if (!snapshot.exists()) return null;
  const item = snapshot.val();
  if (updatedBy && normalizeUpdatedBy(item.updatedBy) !== updatedBy) return null;
  return { name: item.name, workflow: validateWorkflowDocument(JSON.parse(item.workflow)), updatedBy: item.updatedBy || '' };
}

async function saveNamedWorkflow(name, workflow, updatedBy = '') {
  if (!realtimeDb) {
    const workflows = await readWorkflowLibrary();
    const index = workflows.findIndex((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (index === -1 && workflows.length >= maxWorkflows) throw limitError();
    if (index === -1) workflows.push({ name, workflow, updatedBy });
    else workflows[index] = { name, workflow, updatedBy };
    return writeWorkflowLibrary(workflows);
  }

  const serialized = JSON.stringify(workflow);
  if (Buffer.byteLength(serialized, 'utf8') > maxWorkflowBytes) {
    const error = new Error('Workflow exceeds the storage size limit');
    error.status = 413;
    throw error;
  }
  const id = workflowDocumentId(name);
  const names = (await realtimeDb.ref(`${workflowDbPath}/names`).get()).val() || {};
  if (!(id in names) && Object.keys(names).length >= maxWorkflows) throw limitError();
  await realtimeDb.ref(workflowDbPath).update({
    [`names/${id}`]: name,
    [`owners/${id}`]: updatedBy,
    [`items/${id}`]: { name, workflow: serialized, updatedBy, updatedAt: new Date().toISOString() }
  });
}

async function deleteSavedWorkflow(name, updatedBy = '') {
  if (!await getSavedWorkflow(name, updatedBy)) return false;
  if (!realtimeDb) {
    const workflows = await readWorkflowLibrary();
    await writeWorkflowLibrary(workflows.filter((entry) => entry.name.toLowerCase() !== name.toLowerCase()));
    return true;
  }
  const id = workflowDocumentId(name);
  await realtimeDb.ref(workflowDbPath).update({
    [`names/${id}`]: null,
    [`owners/${id}`]: null,
    [`items/${id}`]: null
  });
  return true;
}

function limitError() {
  const error = new Error('Workflow library is limited to 100 saved workflows');
  error.status = 400;
  return error;
}

app.set('trust proxy', 1);
// Browser-based MCP registries call these cross-origin; other routes keep the original CORS policy.
const openCors = cors({ origin: true, exposedHeaders: ['WWW-Authenticate', 'Mcp-Session-Id'] });
const openCorsPaths = /^\/(mcp|\.well-known|oauth\/(register|token))(\/|$|\?)/;
const restrictedCors = cors({origin: config.extensionOrigin === '*' ? true : config.extensionOrigin, credentials:true, exposedHeaders:['WWW-Authenticate','Mcp-Session-Id']});
app.use((req, res, next) => (openCorsPaths.test(req.url) ? openCors : restrictedCors)(req, res, next));
app.use(express.static(path.join(process.cwd(), 'public')));
app.use('/pages', (req, res, next) => {
  if (req.path === '/datastorage' || req.path.startsWith('/datastorage/')) return next();
  return express.static(path.join(process.cwd(), 'pages'))(req, res, next);
});
app.use('/src', express.static(path.join(process.cwd(), 'src')));

app.get('/public/workspace-bridge.html', (req, res) => {
  return res.redirect(
    308,
    req.originalUrl.replace(/^\/public(?=\/)/, '')
  );
});

//app.use(express.json({limit:'2mb'}));
app.use(express.json({ limit: '500mb' }));
app.use(
    express.urlencoded({
        extended: true
    })
);
app.use(cookieParser());

app.get('/api/workflow', requireMcpAuth, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const updatedBy = normalizeUpdatedBy(req.query.updatedBy);
    if (req.query.name === undefined) {
      const names = await listWorkflowNames(updatedBy);
      return res.json({ version: 1, workflows: names.map((name) => ({ name })) });
    }
    const name = validateWorkflowName(req.query.name);
    const saved = await getSavedWorkflow(name, updatedBy);
    if (!saved) return res.status(404).json({ error: `Workflow "${name}" was not found` });
    return res.json(saved);
  } catch (error) {
    console.error('[Workflow] Failed to load workflow:', error);
    if (error.message.startsWith('Workflow')) {
      return res.status(error.message.includes('name') ? 400 : 500).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Failed to load saved workflows' });
  }
});

app.delete('/api/workflow', requireMcpAuth, async (req, res) => {
  try {
    const name = validateWorkflowName(req.query.name);
    const updatedBy = normalizeUpdatedBy(req.query.updatedBy);
    if (!await deleteSavedWorkflow(name, updatedBy)) {
      return res.status(404).json({ error: `Workflow "${name}" was not found` });
    }
    return res.json({ deleted: true, name });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.message.startsWith('Workflow')) return res.status(400).json({ error: error.message });
    console.error('[Workflow] Failed to delete workflow:', error);
    return res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

app.put('/api/workflow', requireMcpAuth, async (req, res) => {
  try {
    const name = validateWorkflowName(req.body?.name);
    const workflow = validateWorkflowDocument(req.body?.workflow);
    const updatedBy = normalizeUpdatedBy(req.body?.updatedBy);
    await saveNamedWorkflow(name, workflow, updatedBy);
    return res.json({ saved: true, name, updatedBy, storage: realtimeDb ? 'firebase' : 'local-disk' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: 'Workflow body must be valid JSON' });
    }
    if (error.message.startsWith('Workflow')) {
      return res.status(400).json({ error: error.message });
    }
    console.error('[Workflow] Failed to save workflow:', error);
    return res.status(500).json({ error: 'Failed to save workflow' });
  }
});

app.post('/api/chat', requireMcpAuth, async (req, res) => {
  try {
    const messages = req.body?.messages;
    if (!Array.isArray(messages) || !messages.length || messages.length > 50) {
      return res.status(400).json({ error: 'messages must be an array of 1-50 items' });
    }
    const clean = messages.map((m) => ({
      role: m?.role === 'assistant' ? 'assistant' : 'user',
      content: String(m?.content ?? '').slice(0, 20000)
    }));
    if (clean[0].role !== 'user' || clean[clean.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'Conversation must start and end with a user message' });
    }
    const data = await askClaude(clean, [], 'You are a helpful assistant inside the CHES Workflow Builder for Trimble Connect. Be concise.');
    const reply = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    return res.json({ reply });
  } catch (error) {
    console.error('[Chat] Claude request failed:', error);
    const notConfigured = error.message.includes('not configured');
    return res.status(notConfigured ? 503 : 502).json({ error: notConfigured ? error.message : 'Claude request failed' });
  }
});

app.get('/workspace-extension-manifest.json', (req, res) => {
  return res.redirect(308, '/workspace.json');
});
// app.use(
//     '/swagger',
//     swaggerUi.serve,
//     swaggerUi.setup(
//         swaggerDocument,
//         {
//             explorer: true
//         }
//     )
// );

// ==========================================
// DYNAMIC SWAGGER JSON
// ==========================================

app.get('/swagger/swagger.json', async (req, res) => {

  try {

    console.log(
      '[Swagger] Generating dynamic Swagger document...'
    );

    const document =
      await getSwaggerDocument();

    res.json(document);

  } catch (err) {

    console.error(
      '[Swagger] Failed to generate document:',
      err
    );

    res.status(500).json({
      error:
        'Failed to generate Swagger document',

      message:
        err.message
    });
  }
});


// ==========================================
// SWAGGER UI
// ==========================================

app.use(
  '/swagger',
  swaggerUi.serve,
  //swaggerUi.setup(swaggerDocument, {
  swaggerUi.setup(null, {
    explorer: true,

    swaggerOptions: {
      url: '/swagger/swagger.json'
    }
  })
);

app.get('/health', (_, res) => res.json({status:'ok',service:'trimble-connect-mcp'}));
app.get('/api/config', (_, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ trimbleClientId: config.trimble.clientId || '' });
});
app.get(
    "/.well-known/oauth-protected-resource",
    (req, res) => {

        const baseUrl =
            process.env.PUBLIC_BASE_URL;

        res.json({
            resource: `${baseUrl}/mcp`,

            authorization_servers: [
                baseUrl
            ]
        });
    }
);
app.get(
    "/.well-known/oauth-authorization-server",
    (req, res) => {

        const baseUrl =
            process.env.PUBLIC_BASE_URL;

        res.json({

            issuer: baseUrl,

            authorization_endpoint:
                `${baseUrl}/oauth/authorize`,

            token_endpoint:
                `${baseUrl}/oauth/token`,

            registration_endpoint:
                `${baseUrl}/oauth/register`,

            response_types_supported: [
                "code"
            ],

            grant_types_supported: [
                "authorization_code",
                "refresh_token"
            ],

            code_challenge_methods_supported: [
                "S256"
            ],

            token_endpoint_auth_methods_supported: [
                "none",
                "client_secret_post",
                "client_secret_basic"
            ]
        });
    }
);
app.get(
  '/oauth/authorize',
  async (req, res) => {

    try {

      const {
        client_id,
        redirect_uri,
        response_type,
        state,
        code_challenge,
        code_challenge_method,
        resource
      } = req.query;

      console.log(
        '========== MCP AUTHORIZE =========='
      );

      logCaller('MCP Authorize', req, {
        clientId: client_id,
        clientName: getClient(client_id)?.clientName,
        redirectUri: redirect_uri,
        resource
      });

      console.log(
        'Query:',
        req.query
      );

      // -----------------------------------------
      // Validate client
      // -----------------------------------------

      const client =
        getClient(client_id);

      if (!client) {

        return res.status(400).json({

          error:
            'unauthorized_client',

          error_description:
            'Unknown client_id'
        });
      }

      // -----------------------------------------
      // Validate redirect URI
      // -----------------------------------------

      if (
        !client.redirectUris.includes(
          redirect_uri
        )
      ) {

        return res.status(400).json({

          error:
            'invalid_request',

          error_description:
            'Invalid redirect_uri'
        });
      }

      // -----------------------------------------
      // Validate response type
      // -----------------------------------------

      if (
        response_type !== 'code'
      ) {

        return res.status(400).json({

          error:
            'unsupported_response_type'
        });
      }

      // -----------------------------------------
      // Validate state
      // -----------------------------------------

      if (!state) {

        return res.status(400).json({

          error:
            'invalid_request',

          error_description:
            'Missing state'
        });
      }

      // -----------------------------------------
      // Validate PKCE
      // -----------------------------------------

      // PKCE is mandatory for public clients and optional for
      // confidential clients that authenticate with a secret.
      if (!code_challenge && !client.clientSecret) {

        return res.status(400).json({

          error:
            'invalid_request',

          error_description:
            'Missing code_challenge'
        });
      }

      if (
        code_challenge &&
        code_challenge_method !==
        'S256'
      ) {

        return res.status(400).json({

          error:
            'invalid_request',

          error_description:
            'Only S256 PKCE is supported'
        });
      }

      // -----------------------------------------
      // Resource
      // -----------------------------------------

      const mcpResource =
        resource ||
        `${process.env.PUBLIC_BASE_URL}/mcp`;

      console.log(
        'MCP resource:',
        mcpResource
      );

      // -----------------------------------------
      // Create MCP transaction
      // -----------------------------------------

      const transactionId =
        createOAuthTransaction({

          clientId:
            client_id,

          redirectUri:
            redirect_uri,

          state,

          codeChallenge:
            code_challenge,

          codeChallengeMethod:
            code_challenge_method,

          resource:
            mcpResource
        });

      console.log(
        'MCP transaction:',
        transactionId
      );

      // -----------------------------------------
      // Start Trimble OAuth
      // -----------------------------------------

      const trimbleUrl =
        authorizationUrlForMcp(
          transactionId
        );

      console.log(
        'Redirecting to Trimble:',
        trimbleUrl
      );

      return res.redirect(
        trimbleUrl
      );

    } catch (e) {

      console.error(
        'MCP authorize error:',
        e
      );

      return res.status(500).json({

        error:
          'server_error',

        error_description:
          e.message
      });
    }
  }
);
app.post(
  '/oauth/token',
  async (req, res) => {

    try {

      console.log(
        '========== MCP TOKEN =========='
      );

      logCaller('MCP Token', req, {
        clientId: req.body?.client_id,
        clientName: getClient(req.body?.client_id)?.clientName,
        redirectUri: req.body?.redirect_uri,
        grantType: req.body?.grant_type,
        hasBasicAuth: /^Basic\s/i.test(req.headers.authorization || '')
      });

      console.log(
        'Token request:',
        {
          grant_type:
            req.body?.grant_type,

          client_id:
            req.body?.client_id,

          redirect_uri:
            req.body?.redirect_uri,

          hasCode:
            !!req.body?.code,

          hasCodeVerifier:
            !!req.body?.code_verifier,

          resource:
            req.body?.resource
        }
      );

      // Client credentials may arrive in the body or a Basic header.
      let basicId;
      let basicSecret;
      const basic =
        (req.headers.authorization || '')
          .match(/^Basic\s+(.+)$/i);

      if (basic) {
        const decoded =
          Buffer.from(basic[1], 'base64')
            .toString('utf8');
        const idx = decoded.indexOf(':');

        if (idx > 0) {
          basicId =
            decodeURIComponent(
              decoded.slice(0, idx)
            );
          basicSecret =
            decodeURIComponent(
              decoded.slice(idx + 1)
            );
        }
      }

      const body = req.body || {};

      const {
        grant_type,
        code,
        redirect_uri,
        code_verifier,
        resource,
        refresh_token
      } = body;

      const client_id =
        body.client_id || basicId;

      const client_secret =
        body.client_secret || basicSecret;

      // -----------------------------------------
      // Client
      // -----------------------------------------

      const client =
        getClient(client_id);

      if (!client) {

        return res.status(401).json({

          error:
            'invalid_client',

          error_description:
            'Unknown client'
        });
      }

      if (
        !verifyClientSecret(
          client,
          client_secret
        )
      ) {

        return res.status(401).json({

          error:
            'invalid_client',

          error_description:
            'Invalid client credentials'
        });
      }

      // -----------------------------------------
      // Refresh token grant
      // -----------------------------------------

      if (grant_type === 'refresh_token') {

        const stored =
          refresh_token
            ? consumeMcpRefreshToken(
                refresh_token
              )
            : null;

        if (
          !stored ||
          stored.clientId !== client_id
        ) {

          return res.status(400).json({

            error:
              'invalid_grant',

            error_description:
              'Invalid or expired refresh token'
          });
        }

        return res.json({

          access_token:
            createMcpAccessToken(
              stored.sessionId,
              stored.resource
            ),

          token_type:
            'Bearer',

          expires_in:
            3600,

          refresh_token:
            createMcpRefreshToken(
              stored.sessionId,
              stored.resource,
              client_id
            ),

          resource:
            stored.resource
        });
      }

      // -----------------------------------------
      // Grant type
      // -----------------------------------------

      if (
        grant_type !==
        'authorization_code'
      ) {

        return res.status(400).json({

          error:
            'unsupported_grant_type'
        });
      }

      // -----------------------------------------
      // Code
      // -----------------------------------------

      if (!code) {

        return res.status(400).json({

          error:
            'invalid_request',

          error_description:
            'Missing authorization code'
        });
      }

      // -----------------------------------------
      // Consume authorization code
      // -----------------------------------------

      const authorization =
        consumeAuthorizationCode(
          code
        );

      if (!authorization) {

        return res.status(400).json({

          error:
            'invalid_grant',

          error_description:
            'Invalid or expired authorization code'
        });
      }

      // -----------------------------------------
      // Client ID
      // -----------------------------------------

      if (
        authorization.clientId !==
        client_id
      ) {

        return res.status(400).json({

          error:
            'invalid_grant',

          error_description:
            'Client mismatch'
        });
      }

      // -----------------------------------------
      // Redirect URI
      // -----------------------------------------

      if (
        redirect_uri &&
        authorization.redirectUri !==
        redirect_uri
      ) {

        return res.status(400).json({

          error:
            'invalid_grant',

          error_description:
            'Redirect URI mismatch'
        });
      }

      // -----------------------------------------
      // Resource
      // -----------------------------------------

      const expectedResource =
        authorization.resource ||
        `${process.env.PUBLIC_BASE_URL}/mcp`;

      if (
        resource &&
        resource !== expectedResource
      ) {

        return res.status(400).json({

          error:
            'invalid_grant',

          error_description:
            'Resource mismatch'
        });
      }

      // -----------------------------------------
      // PKCE
      // -----------------------------------------

      if (
        authorization.codeChallenge ||
        !client.clientSecret
      ) {

        if (!code_verifier) {

          return res.status(400).json({

            error:
              'invalid_grant',

            error_description:
              'Missing code_verifier'
          });
        }

        const pkceValid =
          verifyPkce(
            code_verifier,
            authorization.codeChallenge
          );

        if (!pkceValid) {

          return res.status(400).json({

            error:
              'invalid_grant',

            error_description:
              'PKCE verification failed'
          });
        }
      }

      // -----------------------------------------
      // Create MCP access token
      // -----------------------------------------

      const accessToken =
        createMcpAccessToken(
          authorization.sessionId,
          expectedResource
        );

      console.log(
        'MCP token created successfully'
      );

      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');

      return res.json({

        access_token:
          accessToken,

        token_type:
          'Bearer',

        expires_in:
          3600,

        refresh_token:
          createMcpRefreshToken(
            authorization.sessionId,
            expectedResource,
            client_id
          ),

        resource:
          expectedResource
      });

    } catch (e) {

      console.error(
        'MCP token error:',
        e
      );

      return res.status(500).json({

        error:
          'server_error',

        error_description:
          e.message
      });
    }
  }
);
app.post(
  '/oauth/register',
  async (req, res) => {

    try {

      console.log(
        'MCP client registration:',
        JSON.stringify(req.body, null, 2)
      );

      logCaller('MCP Register', req, {
        clientName: req.body?.client_name,
        redirectUri: (req.body?.redirect_uris || []).join(',')
      });

      const {
        client_name,
        redirect_uris,
        logo_uri,
        grant_types,
        response_types,
        token_endpoint_auth_method,
        application_type
      } = req.body;

      if (
        !Array.isArray(redirect_uris) ||
        redirect_uris.length === 0
      ) {

        return res.status(400).json({
          error:
            'invalid_client_metadata',

          error_description:
            'redirect_uris is required'
        });
      }

      /*
       * Claude is a public OAuth client.
       * It should use PKCE rather than a
       * client secret.
       */

      const client =
        registerClient({

          client_name,

          redirect_uris,

          logo_uri,

          grant_types,

          response_types,

          token_endpoint_auth_method,

          application_type
        });

      return res.status(201).json({

        client_id:
          client.clientId,

        ...(client.clientSecret && {
          client_secret:
            client.clientSecret,
          client_secret_expires_at: 0
        }),

        client_name:
          client.clientName,

        redirect_uris:
          client.redirectUris,

        logo_uri:
          client.logoUri,

        grant_types:
          client.grantTypes,

        response_types:
          client.responseTypes,

        token_endpoint_auth_method:
          client.tokenEndpointAuthMethod,

        application_type:
          client.applicationType

      });

    } catch (e) {

      console.error(
        'MCP client registration failed:',
        e
      );

      return res.status(500).json({
        error:
          'server_error',

        error_description:
          e.message
      });
    }
  }
);
app.get('/oauth/login', (_, res) => { try { res.redirect(authorizationUrl()); } catch (e) { res.status(500).json({error:e.message}); } });
app.get('/oauth/whatsapp/login', (req, res) => {
  const chatId = consumeWhatsAppLoginToken(req.query.token);
  if (!chatId) {
    return res.status(400).send(
      'This WhatsApp sign-in link is invalid or expired. Request a new link in WhatsApp.'
    );
  }

  try {
    return res.redirect(authorizationUrl({ type: 'whatsapp', chatId }));
  } catch (error) {
    console.error('WhatsApp OAuth login failed:', error);
    return res.status(500).send('Unable to start Trimble sign-in. Request a new link in WhatsApp.');
  }
});
app.get(
  '/oauth/callback',
  async (req, res) => {

    try {

      const {
        code,
        state,
        error: oauthError,
        error_description: oauthErrorDescription
      } = req.query;

      /*
       * Browser-based clients (e.g. workflowBuilder.html) run their own
       * PKCE flow and generate their own state, so the server has no record
       * of it. Relay the result back to the opener instead of failing.
       */
      if (
        state &&
        (code || oauthError) &&
        !getOAuthState(state)
      ) {
        const payload = JSON.stringify({
          type: 'trimble-oauth-callback',
          code: code ? String(code) : undefined,
          returnedState: String(state),
          error: oauthError
            ? String(oauthErrorDescription || oauthError)
            : undefined
        }).replace(/</g, '\\u003c');

        res.setHeader('Cache-Control', 'no-store');
        return res.send(
          `<!DOCTYPE html><html><body><p>Sign-in complete. You can close this window.</p><script>
const payload = ${payload};
try { const bc = new BroadcastChannel('trimble-oauth-flow'); bc.postMessage(payload); bc.close(); } catch (e) {}
try { if (window.opener) window.opener.postMessage(payload, location.origin); } catch (e) {}
setTimeout(() => window.close(), 300);
</script></body></html>`
        );
      }

      if (!code) {
        throw new Error(
          'Missing OAuth authorization code'
        );
      }

      if (!state) {
        throw new Error(
          'Missing OAuth state'
        );
      }

      /*
       * Look up Trimble OAuth state.
       */
      // const stateData =
      //   states.get(state);
      const stateData =
        getOAuthState(state);

      if (!stateData) {
        throw new Error(
          'Invalid or expired OAuth state'
        );
      }

      /*
       * Check expiration.
       *
       * Example: 10 minutes.
       */
      const createdAt =
        typeof stateData === 'number'
          ? stateData
          : stateData.createdAt;

      if (
        Date.now() - createdAt >
        10 * 60 * 1000
      ) {

        // states.delete(state);
        deleteOAuthState(state);

        throw new Error(
          'OAuth state expired'
        );
      }

      /*
       * -----------------------------------------
       * MCP FLOW
       * -----------------------------------------
       */

      if (
        typeof stateData === 'object' &&
        stateData.type === 'mcp'
      ) {

        const transaction =
          getOAuthTransaction(
            stateData.transactionId
          );

        if (!transaction) {
          throw new Error(
            'MCP OAuth transaction not found'
          );
        }

        /*
         * Exchange Trimble code.
         */
        const sessionId =
          await exchangeCode(
            code,
            state
          );

        /*
         * Create temporary MCP authorization code.
         */
        const mcpCode =
          createAuthorizationCode({

            sessionId,

            clientId:
              transaction.clientId,

            redirectUri:
              transaction.redirectUri,

            codeChallenge:
              transaction.codeChallenge,

            codeChallengeMethod:
              transaction.codeChallengeMethod,

            resource:
              transaction.resource
          });

        /*
         * Delete temporary state.
         */
        //states.delete(state);
        deleteOAuthState(state);

        /*
         * Delete MCP transaction.
         */
        deleteOAuthTransaction(
          stateData.transactionId
        );

        /*
         * Redirect to Claude.
         */
        const callbackUrl =
          new URL(
            transaction.redirectUri
          );

        callbackUrl.searchParams.set(
          'code',
          mcpCode
        );

        callbackUrl.searchParams.set(
          'state',
          transaction.state
        );

        return res.redirect(
          callbackUrl.toString()
        );
      }

      if (
        typeof stateData === 'object' &&
        stateData.type === 'whatsapp'
      ) {
        const sessionId = await exchangeCode(code, state);
        setWhatsAppSessionId(stateData.chatId, sessionId);
        console.log('[WhatsApp OAuth] Login linked to chat', {
          email: getSessionEmail(sessionId) || 'unavailable'
        });
        res.setHeader('Cache-Control', 'no-store');
        return res.send(
          '<!DOCTYPE html><html><body>' +
          '<h2>Trimble sign-in complete.</h2>' +
          '<p>Return to WhatsApp and send your request again.</p>' +
          '</body></html>'
        );
      }

      /*
       * -----------------------------------------
       * EXISTING EXTENSION FLOW
       * -----------------------------------------
       */

      const sessionId =
        await exchangeCode(
          code,
          state
        );

      //states.delete(state);
      deleteOAuthState(state);

      res.cookie(
        'mcp_session',
        sessionId,
        {
          httpOnly: true,

          secure:
            config.sessionSecret &&
            config.extensionOrigin
              .startsWith('https://'),

          sameSite: 'lax',

          maxAge:
            7 * 24 * 3600 * 1000
        }
      );

      return res.redirect(
        '/auth/success'
      );

    } catch (e) {

      console.error(
        'OAuth callback error:',
        e
      );

      return res.status(400).send(
        `<h1>OAuth failed</h1>
         <pre>${escapeHtml(
           e.message
         )}</pre>`
      );
    }
  }
);
app.get('/auth/success', (req, res) => {
  const sessionId = req.cookies?.mcp_session;
  res.setHeader('Cache-Control', 'no-store');
  res.send(
    '<h2>Trimble authentication successful.</h2>' +
    '<p>You can close this window and return to your client.</p>' +
    (sessionId
      ? '<p>For clients without OAuth (e.g. Agent Studio), add this header to the MCP connector. Keep it private:</p>' +
        `<pre>x-mcp-session: ${escapeHtml(sessionId)}</pre>` +
        '<p>If the connector has no custom-header field, use this MCP URL instead (it contains your session, keep it private):</p>' +
        `<pre>${escapeHtml(`${mcpBaseUrl(req)}/mcp?session=${sessionId}`)}</pre>`
      : '')
  );
});
app.get('/auth/status', requireSession, (req,res) => res.json({authenticated:true}));

// =========================================================
// GET TRIMBLE CONNECT APIs
// =========================================================

app.get(
  '/api/v1/auth/trimble/access-token',
  requireSession,
  async (req, res) => {
    try {
      const result = await callTool(
        req.mcpSessionId,
        'get_trimble_access_token',
        {}
      );
      return res.json(result);
    } catch (error) {
      console.error('GET /api/v1/auth/trimble/access-token:', error);
      return res.status(error.statusCode || 500).json({ error: error.message });
    }
  }
);

app.get(
  '/api/v1/users/me',
  requireSession,
  async (req, res) => {

    try {

      const result =
        await core.getCurrentUser(
          req.mcpSessionId
        );

      return res.json(result);

    } catch (e) {

      console.error(
        'GET /api/v1/users/me:',
        e
      );

      return res.status(500).json({
        error: e.message
      });
    }
  }
);
app.get(
  '/api/v1/regions',
  requireSession,
  async (req, res) => {

    try {

      const result =
        await regions.getRegions(
          req.mcpSessionId
        );

      return res.json(result);

    } catch (e) {

      console.error(
        'GET /api/v1/regions:',
        e
      );

      return res.status(500).json({
        error: e.message
      });
    }
  }
);
app.get(
  '/api/v1/projects',
  requireSession,
  async (req, res) => {

    try {

      const result =
        await core.getProjects(
          req.mcpSessionId,
          req.query
        );

      return res.json(result);

    } catch (e) {

      console.error(
        'GET /api/v1/projects:',
        e
      );

      return res.status(500).json({
        error: e.message
      });
    }
  }
);
app.get(
  '/api/v1/projects/:projectId',
  requireSession,
  async (req, res) => {

    try {

      const result =
        await core.getProject(
          req.mcpSessionId,
          req.params.projectId
        );

      return res.json(result);

    } catch (e) {

      console.error(
        'GET /api/v1/projects/:projectId:',
        e
      );

      return res.status(500).json({
        error: e.message
      });
    }
  }
);
app.get(
  '/api/v1/projects/:projectId/folders',
  requireSession,
  async (req, res) => {

    try {

      const result =
        await core.getFolders(
          req.mcpSessionId,
          req.params.projectId,
          req.query
        );

      return res.json(result);

    } catch (e) {

      console.error(
        'GET folders:',
        e
      );

      return res.status(500).json({
        error: e.message
      });
    }
  }
);
app.get(
  '/api/v1/projects/:projectId/files',
  requireSession,
  async (req, res) => {

    try {

      const result =
        await core.getFiles(
          req.mcpSessionId,
          req.params.projectId,
          req.query
        );

      return res.json(result);

    } catch (e) {

      console.error(
        'GET files:',
        e
      );

      return res.status(500).json({
        error: e.message
      });
    }
  }
);

app.get('/api/v1/users/:userId', requireSession, async (req, res) => {
  try {
    const result = await core.getUser(req.mcpSessionId, req.params.userId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/users/:userId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/v1/projects', requireSession, async (req, res) => {
  try {
    const result = await core.createProject(req.mcpSessionId, req.body);
    return res.status(201).json(result);
  } catch (e) {
    console.error('POST /api/v1/projects:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.put('/api/v1/projects/:projectId', requireSession, async (req, res) => {
  try {
    const result = await core.updateProject(req.mcpSessionId, req.params.projectId, req.body);
    return res.json(result);
  } catch (e) {
    console.error('PUT /api/v1/projects/:projectId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.delete('/api/v1/projects/:projectId', requireSession, async (req, res) => {
  try {
    const result = await core.deleteProject(req.mcpSessionId, req.params.projectId);
    return res.json(result);
  } catch (e) {
    console.error('DELETE /api/v1/projects/:projectId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/members', requireSession, async (req, res) => {
  try {
    const result = await core.getProjectMembers(req.mcpSessionId, req.params.projectId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/members:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/v1/projects/:projectId/folders', requireSession, async (req, res) => {
  try {
    const result = await core.createFolder(req.mcpSessionId, req.params.projectId, req.body);
    return res.status(201).json(result);
  } catch (e) {
    console.error('POST /api/v1/projects/:projectId/folders:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/folders/:folderId', requireSession, async (req, res) => {
  try {
    const result = await core.getFolder(req.mcpSessionId, req.params.folderId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/folders/:folderId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.put('/api/v1/folders/:folderId', requireSession, async (req, res) => {
  try {
    const result = await core.updateFolder(req.mcpSessionId, req.params.folderId, req.body);
    return res.json(result);
  } catch (e) {
    console.error('PUT /api/v1/folders/:folderId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.delete('/api/v1/folders/:folderId', requireSession, async (req, res) => {
  try {
    const result = await core.deleteFolder(req.mcpSessionId, req.params.folderId);
    return res.json(result);
  } catch (e) {
    console.error('DELETE /api/v1/folders/:folderId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/folders/:folderId/folders', requireSession, async (req, res) => {
  try {
    const result = await core.getSubfolders(req.mcpSessionId, req.params.folderId, req.query);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/folders/:folderId/folders:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/folders/:folderId/files', requireSession, async (req, res) => {
  try {
    const result = await core.getFolderFiles(req.mcpSessionId, req.params.folderId, req.query);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/folders/:folderId/files:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/files/:fileId', requireSession, async (req, res) => {
  try {
    const result = await core.getFile(req.mcpSessionId, req.params.fileId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/files/:fileId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.put('/api/v1/files/:fileId', requireSession, async (req, res) => {
  try {
    const result = await core.updateFile(req.mcpSessionId, req.params.fileId, req.body);
    return res.json(result);
  } catch (e) {
    console.error('PUT /api/v1/files/:fileId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.delete('/api/v1/files/:fileId', requireSession, async (req, res) => {
  try {
    const result = await core.deleteFile(req.mcpSessionId, req.params.fileId);
    return res.json(result);
  } catch (e) {
    console.error('DELETE /api/v1/files/:fileId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/files/:fileId/versions', requireSession, async (req, res) => {
  try {
    const result = await core.getFileVersions(req.mcpSessionId, req.params.fileId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/files/:fileId/versions:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/v1/files/:fileId/versions', requireSession, async (req, res) => {
  try {
    const result = await core.createFileVersion(req.mcpSessionId, req.params.fileId, req.body);
    return res.status(201).json(result);
  } catch (e) {
    console.error('POST /api/v1/files/:fileId/versions:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/todos', requireSession, async (req, res) => {
  try {
    const result = await organizer.getTodos(req.mcpSessionId, req.params.projectId, req.query);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/todos:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/v1/projects/:projectId/todos', requireSession, async (req, res) => {
  try {
    const result = await organizer.createTodo(req.mcpSessionId, req.params.projectId, req.body);
    return res.status(201).json(result);
  } catch (e) {
    console.error('POST /api/v1/projects/:projectId/todos:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/todos/:todoId', requireSession, async (req, res) => {
  try {
    const result = await organizer.getTodo(req.mcpSessionId, req.params.todoId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/todos/:todoId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.put('/api/v1/todos/:todoId', requireSession, async (req, res) => {
  try {
    const result = await organizer.updateTodo(req.mcpSessionId, req.params.todoId, req.body);
    return res.json(result);
  } catch (e) {
    console.error('PUT /api/v1/todos/:todoId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.delete('/api/v1/todos/:todoId', requireSession, async (req, res) => {
  try {
    const result = await organizer.deleteTodo(req.mcpSessionId, req.params.todoId);
    return res.json(result);
  } catch (e) {
    console.error('DELETE /api/v1/todos/:todoId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/views', requireSession, async (req, res) => {
  try {
    const result = await organizer.getViews(req.mcpSessionId, req.params.projectId, req.query);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/views:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/v1/projects/:projectId/views', requireSession, async (req, res) => {
  try {
    const result = await organizer.createView(req.mcpSessionId, req.params.projectId, req.body);
    return res.status(201).json(result);
  } catch (e) {
    console.error('POST /api/v1/projects/:projectId/views:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/views/:viewId', requireSession, async (req, res) => {
  try {
    const result = await organizer.getView(req.mcpSessionId, req.params.viewId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/views/:viewId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/search', requireSession, async (req, res) => {
  try {
    const result = await core.search(req.mcpSessionId, req.params.projectId, req.query);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/search:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/models/:modelId', requireSession, async (req, res) => {
  try {
    const result = await model.getModel(req.mcpSessionId, req.params.projectId, req.params.modelId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/models/:modelId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/models/:modelId/entities', requireSession, async (req, res) => {
  try {
    const result = await model.getEntities(req.mcpSessionId, req.params.projectId, req.params.modelId, req.query);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/models/:modelId/entities:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/groups', requireSession, async (req, res) => {
  try {
    const result = await modelFeature.getGroups(req.mcpSessionId, req.params.projectId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/groups:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/groups/:groupId', requireSession, async (req, res) => {
  try {
    const result = await modelFeature.getGroup(req.mcpSessionId, req.params.projectId, req.params.groupId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/groups/:groupId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/issues', requireSession, async (req, res) => {
  try {
    const result = await topics.getTopics(req.mcpSessionId, req.params.projectId, req.query);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/issues:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/v1/projects/:projectId/issues', requireSession, async (req, res) => {
  try {
    const result = await topics.createTopic(req.mcpSessionId, req.params.projectId, req.body);
    return res.status(201).json(result);
  } catch (e) {
    console.error('POST /api/v1/projects/:projectId/issues:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/issues/:topicId', requireSession, async (req, res) => {
  try {
    const result = await topics.getTopic(req.mcpSessionId, req.params.projectId, req.params.topicId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/issues/:topicId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.put('/api/v1/projects/:projectId/issues/:topicId', requireSession, async (req, res) => {
  try {
    const result = await topics.updateTopic(req.mcpSessionId, req.params.projectId, req.params.topicId, req.body);
    return res.json(result);
  } catch (e) {
    console.error('PUT /api/v1/projects/:projectId/issues/:topicId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/issues/:topicId/comments', requireSession, async (req, res) => {
  try {
    const result = await topics.getComments(req.mcpSessionId, req.params.projectId, req.params.topicId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/issues/:topicId/comments:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/v1/projects/:projectId/issues/:topicId/comments', requireSession, async (req, res) => {
  try {
    const result = await topics.createComment(req.mcpSessionId, req.params.projectId, req.params.topicId, req.body);
    return res.status(201).json(result);
  } catch (e) {
    console.error('POST /api/v1/projects/:projectId/issues/:topicId/comments:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/issues/:topicId/comments/:commentId', requireSession, async (req, res) => {
  try {
    const result = await topics.getComment(req.mcpSessionId, req.params.projectId, req.params.topicId, req.params.commentId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/issues/:topicId/comments/:commentId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.put('/api/v1/projects/:projectId/issues/:topicId/comments/:commentId', requireSession, async (req, res) => {
  try {
    const result = await topics.updateComment(req.mcpSessionId, req.params.projectId, req.params.topicId, req.params.commentId, req.body);
    return res.json(result);
  } catch (e) {
    console.error('PUT /api/v1/projects/:projectId/issues/:topicId/comments/:commentId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.delete('/api/v1/projects/:projectId/issues/:topicId/comments/:commentId', requireSession, async (req, res) => {
  try {
    const result = await topics.deleteComment(req.mcpSessionId, req.params.projectId, req.params.topicId, req.params.commentId);
    return res.json(result);
  } catch (e) {
    console.error('DELETE /api/v1/projects/:projectId/issues/:topicId/comments/:commentId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/issues/:topicId/viewpoints', requireSession, async (req, res) => {
  try {
    const result = await topics.getViewpoints(req.mcpSessionId, req.params.projectId, req.params.topicId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/issues/:topicId/viewpoints:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/v1/projects/:projectId/issues/:topicId/viewpoints', requireSession, async (req, res) => {
  try {
    const result = await topics.createViewpoint(req.mcpSessionId, req.params.projectId, req.params.topicId, req.body);
    return res.status(201).json(result);
  } catch (e) {
    console.error('POST /api/v1/projects/:projectId/issues/:topicId/viewpoints:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/issues/:topicId/viewpoints/:viewpointId', requireSession, async (req, res) => {
  try {
    const result = await topics.getViewpoint(req.mcpSessionId, req.params.projectId, req.params.topicId, req.params.viewpointId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/issues/:topicId/viewpoints/:viewpointId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.delete('/api/v1/projects/:projectId/issues/:topicId/viewpoints/:viewpointId', requireSession, async (req, res) => {
  try {
    const result = await topics.deleteViewpoint(req.mcpSessionId, req.params.projectId, req.params.topicId, req.params.viewpointId);
    return res.json(result);
  } catch (e) {
    console.error('DELETE /api/v1/projects/:projectId/issues/:topicId/viewpoints/:viewpointId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/issues/:topicId/viewpoints/:viewpointId/snapshot', requireSession, async (req, res) => {
  try {
    const result = await topics.getViewpointSnapshot(req.mcpSessionId, req.params.projectId, req.params.topicId, req.params.viewpointId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/issues/:topicId/viewpoints/:viewpointId/snapshot:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/issues/:topicId/viewpoints/:viewpointId/bitmaps/:bitmapId', requireSession, async (req, res) => {
  try {
    const result = await topics.getViewpointBitmap(req.mcpSessionId, req.params.projectId, req.params.topicId, req.params.viewpointId, req.params.bitmapId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/issues/:topicId/viewpoints/:viewpointId/bitmaps/:bitmapId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/issues/:topicId/document-references', requireSession, async (req, res) => {
  try {
    const result = await topics.getDocumentReferences(req.mcpSessionId, req.params.projectId, req.params.topicId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/issues/:topicId/document-references:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/v1/projects/:projectId/issues/:topicId/document-references', requireSession, async (req, res) => {
  try {
    const result = await topics.createDocumentReference(req.mcpSessionId, req.params.projectId, req.params.topicId, req.body);
    return res.status(201).json(result);
  } catch (e) {
    console.error('POST /api/v1/projects/:projectId/issues/:topicId/document-references:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/issues/:topicId/document-references/:documentReferenceId', requireSession, async (req, res) => {
  try {
    const result = await topics.getDocumentReference(req.mcpSessionId, req.params.projectId, req.params.topicId, req.params.documentReferenceId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/issues/:topicId/document-references/:documentReferenceId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.put('/api/v1/projects/:projectId/issues/:topicId/document-references/:documentReferenceId', requireSession, async (req, res) => {
  try {
    const result = await topics.updateDocumentReference(req.mcpSessionId, req.params.projectId, req.params.topicId, req.params.documentReferenceId, req.body);
    return res.json(result);
  } catch (e) {
    console.error('PUT /api/v1/projects/:projectId/issues/:topicId/document-references/:documentReferenceId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.delete('/api/v1/projects/:projectId/issues/:topicId/document-references/:documentReferenceId', requireSession, async (req, res) => {
  try {
    const result = await topics.deleteDocumentReference(req.mcpSessionId, req.params.projectId, req.params.topicId, req.params.documentReferenceId);
    return res.json(result);
  } catch (e) {
    console.error('DELETE /api/v1/projects/:projectId/issues/:topicId/document-references/:documentReferenceId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/issues/:topicId/related-topics', requireSession, async (req, res) => {
  try {
    const result = await topics.getRelatedTopics(req.mcpSessionId, req.params.projectId, req.params.topicId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/issues/:topicId/related-topics:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.put('/api/v1/projects/:projectId/issues/:topicId/related-topics', requireSession, async (req, res) => {
  try {
    const result = await topics.setRelatedTopics(req.mcpSessionId, req.params.projectId, req.params.topicId, req.body);
    return res.json(result);
  } catch (e) {
    console.error('PUT /api/v1/projects/:projectId/issues/:topicId/related-topics:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/bcf/projects', requireSession, async (req, res) => {
  try {
    const result = await topics.getBcfProjects(req.mcpSessionId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/bcf/projects:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/issue-extensions', requireSession, async (req, res) => {
  try {
    const result = await topics.getExtensions(req.mcpSessionId, req.params.projectId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/issue-extensions:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/issue-documents', requireSession, async (req, res) => {
  try {
    const result = await topics.getDocuments(req.mcpSessionId, req.params.projectId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/issue-documents:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/projects/:projectId/issue-documents/:documentId', requireSession, async (req, res) => {
  try {
    const result = await topics.getDocument(req.mcpSessionId, req.params.projectId, req.params.documentId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/projects/:projectId/issue-documents/:documentId:', e);
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/v1/bcf/version', requireSession, async (req, res) => {
  try {
    const result = await topics.getVersion(req.mcpSessionId);
    return res.json(result);
  } catch (e) {
    console.error('GET /api/v1/bcf/version:', e);
    return res.status(500).json({ error: e.message });
  }
});

function addStatusSharingRoute(method, route, handler, successStatus = 200) {
  app[method](`/api/v1/status-sharing${route}`, requireSession, async (req, res) => {
    try {
      const result = await handler(req);
      return res.status(successStatus).json(result);
    } catch (e) {
      console.error(`${method.toUpperCase()} /api/v1/status-sharing${route}:`, e);
      return res.status(500).json({ error: e.message });
    }
  });
}

addStatusSharingRoute('post', '/auth/token', (req) =>
  statusSharing.exchangeToken(req.mcpSessionId, req.query)
);
addStatusSharingRoute('get', '/auth/enabled/:projectId', (req) =>
  statusSharing.isEnabled(req.mcpSessionId, req.params.projectId)
);
addStatusSharingRoute('get', '/projects', (req) =>
  statusSharing.getProjects(req.mcpSessionId)
);
addStatusSharingRoute('get', '/projects/:projectId', (req) =>
  statusSharing.getProject(req.mcpSessionId, req.params.projectId)
);
addStatusSharingRoute('get', '/projects/:projectId/status', (req) =>
  statusSharing.getStatuses(req.mcpSessionId, req.params.projectId, req.query)
);
addStatusSharingRoute('get', '/projects/:projectId/status/page', (req) =>
  statusSharing.getStatusesPage(req.mcpSessionId, req.params.projectId, req.query)
);
addStatusSharingRoute('get', '/projects/:projectId/statusactions', (req) =>
  statusSharing.getStatusActions(req.mcpSessionId, req.params.projectId)
);
addStatusSharingRoute('post', '/projects/:projectId/statusactions', (req) =>
  statusSharing.createStatusAction(req.mcpSessionId, req.params.projectId, req.body),
201
);
addStatusSharingRoute('get', '/projects/:projectId/statusactions/:statusActionId', (req) =>
  statusSharing.getStatusAction(req.mcpSessionId, req.params.projectId, req.params.statusActionId)
);
addStatusSharingRoute('put', '/projects/:projectId/statusactions/:statusActionId', (req) =>
  statusSharing.updateStatusAction(req.mcpSessionId, req.params.projectId, req.params.statusActionId, req.body)
);
addStatusSharingRoute('delete', '/projects/:projectId/statusactions/:statusActionId', (req) =>
  statusSharing.deleteStatusAction(req.mcpSessionId, req.params.projectId, req.params.statusActionId)
);
addStatusSharingRoute('get', '/projects/:projectId/statusactions/:statusActionId/customstatusvalues', (req) =>
  statusSharing.getCustomStatusValues(req.mcpSessionId, req.params.projectId, req.params.statusActionId)
);
addStatusSharingRoute('post', '/projects/:projectId/statusactions/:statusActionId/customstatusvalues', (req) =>
  statusSharing.addCustomStatusValues(req.mcpSessionId, req.params.projectId, req.params.statusActionId, req.body),
201
);
addStatusSharingRoute('get', '/projects/:projectId/statusactions/:statusActionId/customstatusvalues/:code', (req) =>
  statusSharing.getCustomStatusValue(req.mcpSessionId, req.params.projectId, req.params.statusActionId, req.params.code)
);
addStatusSharingRoute('put', '/projects/:projectId/statusactions/:statusActionId/customstatusvalues/:code', (req) =>
  statusSharing.updateCustomStatusValue(req.mcpSessionId, req.params.projectId, req.params.statusActionId, req.params.code, req.body)
);
addStatusSharingRoute('get', '/projects/:projectId/statusactions/:statusActionId/groupaccess', (req) =>
  statusSharing.getStatusActionGroupAccess(req.mcpSessionId, req.params.projectId, req.params.statusActionId)
);
addStatusSharingRoute('put', '/projects/:projectId/statusactions/:statusActionId/groupaccess', (req) =>
  statusSharing.updateStatusActionGroupAccess(req.mcpSessionId, req.params.projectId, req.params.statusActionId, req.body)
);
addStatusSharingRoute('get', '/license/:projectId', (req) =>
  statusSharing.getLicense(req.mcpSessionId, req.params.projectId)
);
addStatusSharingRoute('get', '/projects/:projectId/groups', (req) =>
  statusSharing.getGroups(req.mcpSessionId, req.params.projectId)
);
addStatusSharingRoute('get', '/projects/:projectId/statusevents', (req) =>
  statusSharing.getStatusEvents(req.mcpSessionId, req.params.projectId, req.query)
);
addStatusSharingRoute('post', '/projects/:projectId/statusevents', (req) =>
  statusSharing.createStatusEvents(req.mcpSessionId, req.params.projectId, req.body),
201
);
addStatusSharingRoute('get', '/projects/:projectId/statusevents/page', (req) =>
  statusSharing.getStatusEventsPage(req.mcpSessionId, req.params.projectId, req.query)
);
addStatusSharingRoute('get', '/projects/:projectId/statusevents/:eventId', (req) =>
  statusSharing.getStatusEvent(req.mcpSessionId, req.params.projectId, req.params.eventId)
);

function getWorkspaceBridgeToken(req) {
  const authorization = req.get('authorization') || '';
  return authorization.replace(/^Bearer\s+/i, '').trim();
}

function workspaceBridgeError(res, error) {
  const status = error.message.includes('not authorized') ? 401 : 400;
  return res.status(status).json({ error: error.message });
}

app.post('/api/workspace/bridge/connect', (req, res) => {
  try {
    return res.json(connectWorkspaceBridge(req.body?.pairingCode));
  } catch (error) {
    return workspaceBridgeError(res, error);
  }
});

app.get('/api/workspace/bridge/tasks', async (req, res) => {
  try {
    const task = await getNextWorkspaceTask(getWorkspaceBridgeToken(req));
    return res.json({ task });
  } catch (error) {
    return workspaceBridgeError(res, error);
  }
});

app.post('/api/workspace/bridge/results', (req, res) => {
  try {
    const result = submitWorkspaceResult(
      getWorkspaceBridgeToken(req),
      req.body || {}
    );
    return res.json(result);
  } catch (error) {
    return workspaceBridgeError(res, error);
  }
});

app.post('/api/workspace/bridge/disconnect', (req, res) => {
  try {
    return res.json({
      disconnected: disconnectWorkspaceBridge(getWorkspaceBridgeToken(req))
    });
  } catch (error) {
    return workspaceBridgeError(res, error);
  }
});

app.get(
  '/api/v1/property-set/me',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.getCurrentUser(req.mcpSessionId);
      return res.json(result);
    } catch (e) {
      console.error('GET /api/v1/property-set/me:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.get(
  '/api/v1/property-set/libs',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.getLibraries(req.mcpSessionId, req.query);
      return res.json(result);
    } catch (e) {
      console.error('GET /api/v1/property-set/libs:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.post(
  '/api/v1/property-set/libs',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.createLibrary(req.mcpSessionId, req.body);
      return res.status(201).json(result);
    } catch (e) {
      console.error('POST /api/v1/property-set/libs:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.get(
  '/api/v1/property-set/libs/:libId',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.getLibrary(req.mcpSessionId, req.params.libId);
      return res.json(result);
    } catch (e) {
      console.error('GET /api/v1/property-set/libs/:libId:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.patch(
  '/api/v1/property-set/libs/:libId',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.updateLibrary(req.mcpSessionId, req.params.libId, req.body);
      return res.json(result);
    } catch (e) {
      console.error('PATCH /api/v1/property-set/libs/:libId:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.delete(
  '/api/v1/property-set/libs/:libId',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.deleteLibrary(req.mcpSessionId, req.params.libId);
      return res.json(result);
    } catch (e) {
      console.error('DELETE /api/v1/property-set/libs/:libId:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.get(
  '/api/v1/property-set/libs/:libId/policy',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.getLibraryPolicy(req.mcpSessionId, req.params.libId);
      return res.json(result);
    } catch (e) {
      console.error('GET /api/v1/property-set/libs/:libId/policy:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.put(
  '/api/v1/property-set/libs/:libId/policy',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.setLibraryPolicy(req.mcpSessionId, req.params.libId, req.body);
      return res.json(result);
    } catch (e) {
      console.error('PUT /api/v1/property-set/libs/:libId/policy:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.get(
  '/api/v1/property-set/libs/:libId/defs',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.listDefinitions(req.mcpSessionId, req.params.libId, req.query);
      return res.json(result);
    } catch (e) {
      console.error('GET /api/v1/property-set/libs/:libId/defs:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.post(
  '/api/v1/property-set/libs/:libId/defs',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.createDefinition(req.mcpSessionId, req.params.libId, req.body);
      return res.status(201).json(result);
    } catch (e) {
      console.error('POST /api/v1/property-set/libs/:libId/defs:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.get(
  '/api/v1/property-set/libs/:libId/defs/:defId',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.getDefinition(req.mcpSessionId, req.params.libId, req.params.defId);
      return res.json(result);
    } catch (e) {
      console.error('GET /api/v1/property-set/libs/:libId/defs/:defId:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.patch(
  '/api/v1/property-set/libs/:libId/defs/:defId',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.updateDefinition(req.mcpSessionId, req.params.libId, req.params.defId, req.body);
      return res.json(result);
    } catch (e) {
      console.error('PATCH /api/v1/property-set/libs/:libId/defs/:defId:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.delete(
  '/api/v1/property-set/libs/:libId/defs/:defId',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.deleteDefinition(req.mcpSessionId, req.params.libId, req.params.defId);
      return res.json(result);
    } catch (e) {
      console.error('DELETE /api/v1/property-set/libs/:libId/defs/:defId:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.get(
  '/api/v1/property-set/libs/:libId/defs/:defId/versions',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.getDefinitionVersions(req.mcpSessionId, req.params.libId, req.params.defId);
      return res.json(result);
    } catch (e) {
      console.error('GET /api/v1/property-set/libs/:libId/defs/:defId/versions:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.get(
  '/api/v1/property-set/libs/:libId/defs/:defId/versions/:version',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.getDefinitionVersion(req.mcpSessionId, req.params.libId, req.params.defId, req.params.version);
      return res.json(result);
    } catch (e) {
      console.error('GET /api/v1/property-set/libs/:libId/defs/:defId/versions/:version:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.get(
  '/api/v1/property-set/libs/:libId/defs/:defId/schema/:version',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.getDefinitionSchema(req.mcpSessionId, req.params.libId, req.params.defId, req.params.version);
      return res.json(result);
    } catch (e) {
      console.error('GET /api/v1/property-set/libs/:libId/defs/:defId/schema/:version:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.post(
  '/api/v1/property-set/libs/:libId/defs/:defId/validate',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.validateValues(req.mcpSessionId, req.params.libId, req.params.defId, req.body);
      return res.json(result);
    } catch (e) {
      console.error('POST /api/v1/property-set/libs/:libId/defs/:defId/validate:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.get(
  '/api/v1/property-set/libs/:libId/defs/:defId/psets',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.listPsetsByDefinition(req.mcpSessionId, req.params.libId, req.params.defId);
      return res.json(result);
    } catch (e) {
      console.error('GET /api/v1/property-set/libs/:libId/defs/:defId/psets:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.get(
  '/api/v1/property-set/psets/:link',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.listPsetsForLink(req.mcpSessionId, req.params.link, req.query);
      return res.json(result);
    } catch (e) {
      console.error('GET /api/v1/property-set/psets/:link:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.get(
  '/api/v1/property-set/psets/:link/:libId/:defId',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.getPset(req.mcpSessionId, req.params.link, req.params.libId, req.params.defId);
      return res.json(result);
    } catch (e) {
      console.error('GET /api/v1/property-set/psets/:link/:libId/:defId:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.patch(
  '/api/v1/property-set/psets/:link/:libId/:defId',
  requireSession,
  async (req, res) => {
    try {
      const props = req.body?.props ?? req.body;
      const result = await propertySet.updatePset(req.mcpSessionId, req.params.link, req.params.libId, req.params.defId, props);
      return res.json(result);
    } catch (e) {
      console.error('PATCH /api/v1/property-set/psets/:link/:libId/:defId:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.delete(
  '/api/v1/property-set/psets/:link/:libId/:defId',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.deletePset(req.mcpSessionId, req.params.link, req.params.libId, req.params.defId);
      return res.json(result);
    } catch (e) {
      console.error('DELETE /api/v1/property-set/psets/:link/:libId/:defId:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.get(
  '/api/v1/property-set/psets/:link/:libId/:defId/versions',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.getPsetVersions(req.mcpSessionId, req.params.link, req.params.libId, req.params.defId);
      return res.json(result);
    } catch (e) {
      console.error('GET /api/v1/property-set/psets/:link/:libId/:defId/versions:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.get(
  '/api/v1/property-set/psets/:link/:libId/:defId/versions/:version',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.getPsetVersion(req.mcpSessionId, req.params.link, req.params.libId, req.params.defId, req.params.version);
      return res.json(result);
    } catch (e) {
      console.error('GET /api/v1/property-set/psets/:link/:libId/:defId/versions/:version:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.post(
  '/api/v1/property-set/batch-get',
  requireSession,
  async (req, res) => {
    try {
      const payload = req.body?.psets ?? req.body;
      const result = await propertySet.batchGetPsets(req.mcpSessionId, payload);
      return res.json(result);
    } catch (e) {
      console.error('POST /api/v1/property-set/batch-get:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.post(
  '/api/v1/property-set/psets/changeset',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.applyChangeset(req.mcpSessionId, req.body);
      return res.json(result);
    } catch (e) {
      console.error('POST /api/v1/property-set/psets/changeset:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.post(
  '/api/v1/property-set/psets/changeset-async',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.applyChangesetAsync(req.mcpSessionId, req.body);
      return res.json(result);
    } catch (e) {
      console.error('POST /api/v1/property-set/psets/changeset-async:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.get(
  '/api/v1/property-set/psets/changeset/:changesetId',
  requireSession,
  async (req, res) => {
    try {
      const result = await propertySet.getChangesetStatus(req.mcpSessionId, req.params.changesetId);
      return res.json(result);
    } catch (e) {
      console.error('GET /api/v1/property-set/psets/changeset/:changesetId:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.use(
  '/api/pdf',
  pdfRouter
);

app.get(
  '/api/mcp/tools',
  requireSession,
  async (req, res) => {
    try {
      const tools = await getDefinitions();
      return res.json({ tools });
    } catch (e) {
      console.error('GET /api/mcp/tools:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

function addSketchUpInspectionRoute(route, toolName, getArguments) {
  app.get(route, requireSession, async (req, res) => {
    try {
      const result = await callTool(
        req.mcpSessionId,
        toolName,
        getArguments(req)
      );
      return res.json(result);
    } catch (error) {
      console.error(`GET ${route}:`, error);
      const status = error.message?.startsWith('SKETCHUP_NOT_RUNNING') ? 503 : 500;
      return res.status(status).json({ error: error.message });
    }
  });
}

addSketchUpInspectionRoute(
  '/api/mcp/sketchup/groups',
  'sketchup_get_groups',
  (req) => ({ include_nested: req.query.include_nested !== 'false', limit: req.query.limit })
);
addSketchUpInspectionRoute(
  '/api/mcp/sketchup/components',
  'sketchup_get_components',
  (req) => ({ include_nested: req.query.include_nested !== 'false', limit: req.query.limit })
);
addSketchUpInspectionRoute(
  '/api/mcp/sketchup/attributes/:entityId',
  'sketchup_get_attributes',
  (req) => ({ entity_id: req.params.entityId })
);
addSketchUpInspectionRoute(
  '/api/mcp/sketchup/geometry/:entityId',
  'sketchup_calculate_geometry',
  (req) => ({ entity_id: req.params.entityId })
);
addSketchUpInspectionRoute(
  '/api/mcp/sketchup/validate/:entityId',
  'sketchup_validate_geometry',
  (req) => ({ entity_id: req.params.entityId })
);
addSketchUpInspectionRoute(
  '/api/mcp/sketchup/objects',
  'sketchup_get_objects',
  (req) => ({
    types: req.query.types
      ? String(req.query.types).split(',').map((type) => type.trim()).filter(Boolean)
      : undefined,
    include_nested: req.query.include_nested !== 'false',
    limit: req.query.limit
  })
);
addSketchUpInspectionRoute(
  '/api/mcp/sketchup/model/validate',
  'sketchup_validate_model',
  () => ({})
);

app.post(
  '/api/mcp/sketchup/model/export',
  requireSession,
  async (req, res) => {
    try {
      const result = await callTool(
        req.mcpSessionId,
        'sketchup_export_model',
        req.body?.arguments ?? req.body ?? {}
      );
      return res.json(result);
    } catch (error) {
      console.error('POST /api/mcp/sketchup/model/export:', error);
      const status = error.message?.startsWith('SKETCHUP_NOT_RUNNING') ? 503 : 400;
      return res.status(status).json({ error: error.message });
    }
  }
);

// // =========================================================
// // TEKLA MCP TOOL
// // =========================================================
// //
// // This is a convenience HTTP endpoint for testing the same MCP tool
// // that Claude/other MCP clients call through POST /mcp.
// // The actual MCP tool name is: tekla_get_status
// //
// // MCP clients do NOT need this endpoint. They use:
// //   POST /mcp
// //   tools/call -> tekla_get_status
// //
// app.get(
//   '/api/mcp/tekla/status',
//   requireSession,
//   async (req, res) => {
//     try {
//       console.log('========== TEKLA MCP STATUS ==========');
//       console.log('Session:', req.mcpSessionId ? 'authenticated' : 'missing');
//       console.log('Tool: tekla_get_status');

//       const result = await callTool(
//         req.mcpSessionId,
//         'tekla_get_status',
//         {}
//       );

//       console.log('Tekla status result:', JSON.stringify(result));
//       console.log('======================================');

//       return res.json(result);
//     } catch (e) {
//       console.error('GET /api/mcp/tekla/status:', e);
//       return res.status(500).json({
//         error: e.message
//       });
//     }
//   }
// );
// =========================================================
// TEKLA MCP / REST TOOLS
// =========================================================
//
// These routes are convenience HTTP endpoints for testing the
// same Tekla MCP tools exposed through:
//
//   POST /mcp
//
// MCP:
//
//   tools/call
//   {
//     "name": "tekla_get_model",
//     "arguments": {}
//   }
//
// REST convenience:
//
//   GET  /api/mcp/tekla/status
//   GET  /api/mcp/tekla/model
//   POST /api/mcp/tekla/parts
//   POST /api/mcp/tekla/object
//   POST /api/mcp/tekla/selection
//   POST /api/mcp/tekla/assemblies
//   POST /api/mcp/tekla/assembly
//   POST /api/mcp/tekla/bolts
//   POST /api/mcp/tekla/welds
//   POST /api/mcp/tekla/rebar
//   POST /api/mcp/tekla/rebar-group
//   POST /api/mcp/tekla/create/beam
//   POST /api/mcp/tekla/create/parametric-stair
//   POST /api/mcp/tekla/create/polybeam
//   POST /api/mcp/tekla/create/column
//   POST /api/mcp/tekla/create/plate
//   POST /api/mcp/tekla/create/assembly
//   POST /api/mcp/tekla/create/weld
//   POST /api/mcp/tekla/create/bolt
//   POST /api/mcp/tekla/create/rebar
//   POST /api/mcp/tekla/create/rebar-group
//   POST /api/mcp/tekla/create/phase
//   GET  /api/mcp/tekla/phases
//
// Generic MCP/Swagger:
//
//   POST /api/mcp/tools/tekla_get_status
//   POST /api/mcp/tools/tekla_get_model
//   POST /api/mcp/tools/tekla_get_parts
//   POST /api/mcp/tools/tekla_get_object
//   POST /api/mcp/tools/tekla_get_selection
//   POST /api/mcp/tools/tekla_get_assemblies
//   POST /api/mcp/tools/tekla_get_assembly
//   POST /api/mcp/tools/tekla_get_bolts
//   POST /api/mcp/tools/tekla_get_welds
//   POST /api/mcp/tools/tekla_get_rebar
//   POST /api/mcp/tools/tekla_get_rebar_group
//   POST /api/mcp/tools/tekla_create_beam
//   POST /api/mcp/tools/tekla_create_parametric_stair
//   POST /api/mcp/tools/tekla_create_polybeam
//   POST /api/mcp/tools/tekla_create_column
//   POST /api/mcp/tools/tekla_create_plate
//   POST /api/mcp/tools/tekla_create_assembly
//   POST /api/mcp/tools/tekla_create_weld
//   POST /api/mcp/tools/tekla_create_bolt
//   POST /api/mcp/tools/tekla_create_rebar
//   POST /api/mcp/tools/tekla_create_rebar_group
//   POST /api/mcp/tools/tekla_create_phase
//   POST /api/mcp/tools/tekla_get_phases
//
// =========================================================


/**
 * Generic helper for executing a Tekla MCP tool.
 *
 * All Tekla routes eventually go through:
 *
 *   callTool()
 *      ↓
 *   mcp/tools.js
 *      ↓
 *   TEKLA_BRIDGE_URL
 *      ↓
 *   ngrok
 *      ↓
 *   TeklaStatus.exe :7128
 *      ↓
 *   Tekla Structures 2026
 */
async function executeTeklaTool(
  req,
  res,
  toolName,
  args = {}
) {
  try {

    console.log(
      '================================================'
    );

    console.log(
      `[Tekla] ${req.method} ${req.originalUrl}`
    );

    console.log(
      `[Tekla] Tool: ${toolName}`
    );

    console.log(
      '[Tekla] Session:',
      req.mcpSessionId
        ? 'authenticated'
        : 'missing'
    );

    console.log(
      '[Tekla] Arguments:',
      JSON.stringify(args, null, 2)
    );


    const result = await callTool(
      req.mcpSessionId,
      toolName,
      args
    );


    console.log(
      `[Tekla] ${toolName} completed`
    );

    console.log(
      '[Tekla] Result:',
      JSON.stringify(result)
    );

    console.log(
      '================================================'
    );


    return res.json(result);

  } catch (e) {

    console.error(
      `[Tekla] ${toolName} failed:`,
      e
    );

    console.log(
      '================================================'
    );

    return res.status(
      e.status ||
      e.statusCode ||
      500
    ).json({
      success: false,
      tool: toolName,
      error: e.message
    });
  }
}


/*
 * ---------------------------------------------------------
 * GET TEKLA STATUS
 * ---------------------------------------------------------
 *
 * Convenience endpoint:
 *
 * GET /api/mcp/tekla/status
 *
 * Internally:
 *
 * tekla_get_status
 */
app.get(
  '/api/mcp/tekla/status',
  requireSession,
  async (req, res) => {

    return executeTeklaTool(
      req,
      res,
      'tekla_get_status',
      {}
    );

  }
);


/*
 * ---------------------------------------------------------
 * GET TEKLA MODEL
 * ---------------------------------------------------------
 *
 * GET /api/mcp/tekla/model
 *
 * Internally:
 *
 * tekla_get_model
 */
app.get(
  '/api/mcp/tekla/model',
  requireSession,
  async (req, res) => {

    return executeTeklaTool(
      req,
      res,
      'tekla_get_model',
      {}
    );

  }
);

app.get(
  '/api/mcp/tekla/phases',
  requireSession,
  async (req, res) => {
    return executeTeklaTool(
      req,
      res,
      'tekla_get_phases',
      {}
    );
  }
);

app.get(
  '/api/mcp/tekla/model/validate',
  requireSession,
  async (req, res) => executeTeklaTool(req, res, 'tekla_validate_model')
);


/*
 * ---------------------------------------------------------
 * GET TEKLA PARTS
 * ---------------------------------------------------------
 *
 * POST /api/mcp/tekla/parts
 *
 * Body example:
 *
 * {
 *   "filter": {},
 *   "limit": 100
 * }
 */
app.post(
  '/api/mcp/tekla/parts',
  requireSession,
  async (req, res) => {

    const args =
      req.body?.arguments ??
      req.body ??
      {};

    return executeTeklaTool(
      req,
      res,
      'tekla_get_parts',
      args
    );

  }
);


/*
 * ---------------------------------------------------------
 * GET TEKLA OBJECT
 * ---------------------------------------------------------
 *
 * POST /api/mcp/tekla/object
 *
 * Body:
 *
 * {
 *   "id": "123456"
 * }
 */
app.post(
  '/api/mcp/tekla/object',
  requireSession,
  async (req, res) => {

    const args =
      req.body?.arguments ??
      req.body ??
      {};

    return executeTeklaTool(
      req,
      res,
      'tekla_get_object',
      args
    );

  }
);


/*
 * ---------------------------------------------------------
 * GET TEKLA SELECTION
 * ---------------------------------------------------------
 *
 * POST /api/mcp/tekla/selection
 *
 * No body required.
 */
app.post(
  '/api/mcp/tekla/selection',
  requireSession,
  async (req, res) => {

    const args =
      req.body?.arguments ??
      req.body ??
      {};

    return executeTeklaTool(
      req,
      res,
      'tekla_get_selection',
      args
    );

  }
);


/*
 * ---------------------------------------------------------
 * GET TEKLA ASSEMBLIES
 * ---------------------------------------------------------
 *
 * POST /api/mcp/tekla/assemblies
 *
 * Body example:
 *
 * {
 *   "filter": {},
 *   "limit": 100
 * }
 */
app.post(
  '/api/mcp/tekla/assemblies',
  requireSession,
  async (req, res) => {

    const args =
      req.body?.arguments ??
      req.body ??
      {};

    return executeTeklaTool(
      req,
      res,
      'tekla_get_assemblies',
      args
    );

  }
);


/*
 * ---------------------------------------------------------
 * GET TEKLA ASSEMBLY
 * ---------------------------------------------------------
 *
 * POST /api/mcp/tekla/assembly
 *
 * Body:
 *
 * {
 *   "id": "123456"
 * }
 */
app.post(
  '/api/mcp/tekla/assembly',
  requireSession,
  async (req, res) => {

    const args =
      req.body?.arguments ??
      req.body ??
      {};

    return executeTeklaTool(
      req,
      res,
      'tekla_get_assembly',
      args
    );

  }
);


/*
 * ---------------------------------------------------------
 * GET TEKLA BOLTS
 * ---------------------------------------------------------
 *
 * POST /api/mcp/tekla/bolts
 *
 * Body example:
 *
 * {
 *   "filter": {},
 *   "limit": 100
 * }
 */
app.post(
  '/api/mcp/tekla/bolts',
  requireSession,
  async (req, res) => {

    const args =
      req.body?.arguments ??
      req.body ??
      {};

    return executeTeklaTool(
      req,
      res,
      'tekla_get_bolts',
      args
    );

  }
);


/*
 * ---------------------------------------------------------
 * GET TEKLA WELDS
 * ---------------------------------------------------------
 *
 * POST /api/mcp/tekla/welds
 *
 * Body example:
 *
 * {
 *   "filter": {},
 *   "limit": 100
 * }
 */
app.post(
  '/api/mcp/tekla/welds',
  requireSession,
  async (req, res) => {

    const args =
      req.body?.arguments ??
      req.body ??
      {};

    return executeTeklaTool(
      req,
      res,
      'tekla_get_welds',
      args
    );

  }
);


/*
 * ---------------------------------------------------------
 * GET TEKLA REBAR
 * ---------------------------------------------------------
 *
 * POST /api/mcp/tekla/rebar
 *
 * Body example:
 *
 * {
 *   "filter": {},
 *   "limit": 100
 * }
 */
app.post(
  '/api/mcp/tekla/rebar',
  requireSession,
  async (req, res) => {

    const args =
      req.body?.arguments ??
      req.body ??
      {};

    return executeTeklaTool(
      req,
      res,
      'tekla_get_rebar',
      args
    );

  }
);


/*
 * ---------------------------------------------------------
 * GET TEKLA REBAR GROUP
 * ---------------------------------------------------------
 *
 * POST /api/mcp/tekla/rebar-group
 *
 * Body:
 *
 * {
 *   "id": "123456"
 * }
 */
app.post(
  '/api/mcp/tekla/rebar-group',
  requireSession,
  async (req, res) => {

    const args =
      req.body?.arguments ??
      req.body ??
      {};

    return executeTeklaTool(
      req,
      res,
      'tekla_get_rebar_group',
      args
    );

  }
);

const teklaActionRoutes = [
  { path: '/api/mcp/tekla/components/definitions', method: 'get', toolName: 'tekla_component_list' },
  { path: '/api/mcp/tekla/components/definition/get', toolName: 'tekla_component_get_definition' },
  { path: '/api/mcp/tekla/components/definition/save', toolName: 'tekla_component_save_definition' },
  { path: '/api/mcp/tekla/components/definition/delete', toolName: 'tekla_component_delete_definition' },
  { path: '/api/mcp/tekla/components/definition/clone', toolName: 'tekla_component_clone_definition' },
  { path: '/api/mcp/tekla/components/definition/export', toolName: 'tekla_component_export_definition' },
  { path: '/api/mcp/tekla/components/validate', toolName: 'tekla_component_validate' },
  { path: '/api/mcp/tekla/components/create', toolName: 'tekla_component_create' },
  { path: '/api/mcp/tekla/components/instance', toolName: 'tekla_component_get_instance' },
  { path: '/api/mcp/tekla/components/clone', toolName: 'tekla_component_clone' },
  { path: '/api/mcp/tekla/components/update', toolName: 'tekla_component_update' },
  { path: '/api/mcp/tekla/components/delete', toolName: 'tekla_component_delete' },
  { path: '/api/mcp/tekla/create/beam', toolName: 'tekla_create_beam' },
  { path: '/api/mcp/tekla/create/parametric-stair', toolName: 'tekla_create_parametric_stair' },
  { path: '/api/mcp/tekla/create/column', toolName: 'tekla_create_column' },
  { path: '/api/mcp/tekla/create/plate', toolName: 'tekla_create_plate' },
  { path: '/api/mcp/tekla/create/wall', toolName: 'tekla_create_wall' },
  { path: '/api/mcp/tekla/create/slab', toolName: 'tekla_create_slab' },
  { path: '/api/mcp/tekla/create/curve-beam', toolName: 'tekla_create_curve_beam' },
  { path: '/api/mcp/tekla/create/polybeam', toolName: 'tekla_create_polybeam' },
  { path: '/api/mcp/tekla/create/curve-column', toolName: 'tekla_create_curve_column' },
  { path: '/api/mcp/tekla/create/curve-wall', toolName: 'tekla_create_curve_wall' },
  { path: '/api/mcp/tekla/create/curve-slab', toolName: 'tekla_create_curve_slab' },
  { path: '/api/mcp/tekla/create/assembly', toolName: 'tekla_create_assembly' },
  { path: '/api/mcp/tekla/create/weld', toolName: 'tekla_create_weld' },
  { path: '/api/mcp/tekla/create/bolt', toolName: 'tekla_create_bolt' },
  { path: '/api/mcp/tekla/create/rebar', toolName: 'tekla_create_rebar' },
  { path: '/api/mcp/tekla/create/rebar-group', toolName: 'tekla_create_rebar_group' },
  { path: '/api/mcp/tekla/create/phase', toolName: 'tekla_create_phase' },
  { path: '/api/mcp/tekla/update/beam', toolName: 'tekla_update_beam' },
  { path: '/api/mcp/tekla/update/polybeam', toolName: 'tekla_update_polybeam' },
  { path: '/api/mcp/tekla/update/column', toolName: 'tekla_update_column' },
  { path: '/api/mcp/tekla/update/plate', toolName: 'tekla_update_plate' },
  { path: '/api/mcp/tekla/update/wall', toolName: 'tekla_update_wall' },
  { path: '/api/mcp/tekla/update/slab', toolName: 'tekla_update_slab' },
  { path: '/api/mcp/tekla/update/curve-beam', toolName: 'tekla_update_curve_beam' },
  { path: '/api/mcp/tekla/update/curve-column', toolName: 'tekla_update_curve_column' },
  { path: '/api/mcp/tekla/update/curve-wall', toolName: 'tekla_update_curve_wall' },
  { path: '/api/mcp/tekla/update/curve-slab', toolName: 'tekla_update_curve_slab' },
  { path: '/api/mcp/tekla/update/assembly', toolName: 'tekla_update_assembly' },
  { path: '/api/mcp/tekla/update/weld', toolName: 'tekla_update_weld' },
  { path: '/api/mcp/tekla/update/bolt', toolName: 'tekla_update_bolt' },
  { path: '/api/mcp/tekla/update/rebar', toolName: 'tekla_update_rebar' },
  { path: '/api/mcp/tekla/update/rebar-group', toolName: 'tekla_update_rebar_group' },
  { path: '/api/mcp/tekla/update/phase', toolName: 'tekla_update_phase' },
  { path: '/api/mcp/tekla/delete/wall', toolName: 'tekla_delete_wall' },
  { path: '/api/mcp/tekla/delete/slab', toolName: 'tekla_delete_slab' },
  { path: '/api/mcp/tekla/delete/curve-beam', toolName: 'tekla_delete_curve_beam' },
  { path: '/api/mcp/tekla/delete/curve-column', toolName: 'tekla_delete_curve_column' },
  { path: '/api/mcp/tekla/delete/curve-wall', toolName: 'tekla_delete_curve_wall' },
  { path: '/api/mcp/tekla/delete/curve-slab', toolName: 'tekla_delete_curve_slab' }
];

for (const route of teklaActionRoutes) {
  app[route.method || 'post'](
    route.path,
    requireSession,
    async (req, res) => {
      const args = req.body?.arguments ?? req.body ?? {};
      return executeTeklaTool(req, res, route.toolName, args);
    }
  );
}

// GREEN-API webhook: set "webhookUrl" to <PUBLIC_BASE_URL>/api/whatsapp/webhook
// and "webhookUrlToken" to WHATSAPP_WEBHOOK_TOKEN.
app.post('/api/whatsapp/webhook', (req, res) => {
  console.log(`[WHATSAPP-WEBHOOK] received at ${new Date().toISOString()}`);
  const payloadLength = JSON.stringify(req.body ?? {}).length;
  console.log(`[WHATSAPP-WEBHOOK] payload received. Length: ${payloadLength}`);
  if (!verifyWhatsAppWebhook(req)) {
    console.warn('[WHATSAPP-WEBHOOK] rejected: invalid token');
    return res.sendStatus(401);
  }
  res.sendStatus(200);
  handleIncomingWebhook(req.body);
});

app.post(
  '/api/mcp/whatsapp/send',
  requireSession,
  async (req, res) => {
    try {
      const args = req.body?.arguments ?? req.body ?? {};
      const result = await callTool(
        req.mcpSessionId,
        'send_whatsapp_message',
        args
      );
      return res.json(result);
    } catch (error) {
      console.error('POST /api/mcp/whatsapp/send:', error);
      return res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  }
);

app.post(
  '/api/mcp/tender/extract',
  requireSession,
  async (req, res) => {
    try {
      const args = req.body?.arguments ?? req.body ?? {};
      const result = await callTool(
        req.mcpSessionId,
        'extract_tender_project',
        args
      );
      return res.json(result);
    } catch (error) {
      console.error('POST /api/mcp/tender/extract:', error);
      const status = error.statusCode || (error.code === 'ETIMEDOUT' || error.killed ? 504 : 500);
      return res.status(status).json({ success: false, error: error.message });
    }
  }
);

app.get(
  '/api/mcp/status-sharing/viewer/templates',
  requireSession,
  async (req, res) => {
    try {
      const result = await callTool(
        req.mcpSessionId,
        'status_sharing_list_viewer_templates',
        {}
      );
      return res.json(result);
    } catch (e) {
      console.error('GET /api/mcp/status-sharing/viewer/templates:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.post(
  '/api/mcp/status-sharing/viewer/generate',
  requireSession,
  async (req, res) => {
    try {
      const args = req.body?.arguments ?? req.body ?? {};
      const result = await callTool(
        req.mcpSessionId,
        'status_sharing_generate_viewer',
        args
      );
      return res.json(result);
    } catch (e) {
      console.error('POST /api/mcp/status-sharing/viewer/generate:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.post(
  '/api/mcp/python/test',
  requireSession,
  async (req, res) => {
    try {
      const result = await callTool(
        req.mcpSessionId,
        'run_python_test',
        {}
      );
      return res.json(result);
    } catch (e) {
      console.error('POST /api/mcp/python/test:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

app.post(
  '/api/mcp/bridge/options',
  requireSession,
  async (req, res) => {
    try {
      const args = req.body?.arguments ?? req.body ?? {};
      const result = await callTool(
        req.mcpSessionId,
        'trimble_get_started',
        args
      );
      return res.json(result);
    } catch (error) {
      console.error('POST /api/mcp/bridge/options:', error);
      return res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  '/api/mcp/bridge/select',
  requireSession,
  async (req, res) => {
    try {
      const args = req.body?.arguments ?? req.body ?? {};
      const result = await callTool(
        req.mcpSessionId,
        'trimble_select_bridge',
        args
      );
      return res.json(result);
    } catch (error) {
      console.error('POST /api/mcp/bridge/select:', error);
      return res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  '/api/mcp/tsd/:toolName',
  requireSession,
  async (req, res) => {
    try {
      const args = req.body?.arguments ?? req.body ?? {};
      const toolName = req.params.toolName.startsWith('tsd_')
        ? req.params.toolName
        : `tsd_${req.params.toolName}`;
      const result = await callTool(req.mcpSessionId, toolName, args);
      return res.json(result);
    } catch (error) {
      console.error('POST /api/mcp/tsd/:toolName:', error);
      return res.status(500).json({ error: error.message });
    }
  }
);

app.post(
  '/api/mcp/tools/:toolName',
  requireSession,
  async (req, res) => {
    try {
      const args = req.body?.arguments ?? req.body ?? {};
      const result = await callTool(
        req.mcpSessionId,
        req.params.toolName,
        args
      );
      return res.json(result);
    } catch (e) {
      console.error('POST /api/mcp/tools/:toolName:', e);
      return res.status(500).json({ error: e.message });
    }
  }
);

// Main MCP endpoint. tekla_get_status is exposed by mcp/tools.js and
// dispatched by handleMcp() -> callTool() -> Tekla bridge.
//app.post('/mcp', requireSession, handleMcp);

// Registry compatibility: advertise OAuth discovery on 401 and answer non-POST probes.
const mcpBaseUrl = req =>
  process.env.PUBLIC_BASE_URL ||
  `${req.headers['x-forwarded-proto'] || req.protocol}://${req.get('host')}`;

app.get(
  [
    '/.well-known/oauth-protected-resource/mcp',
    '/mcp/.well-known/oauth-protected-resource'
  ],
  (req, res) => {
    const baseUrl = mcpBaseUrl(req);
    res.json({
      resource: `${baseUrl}/mcp`,
      authorization_servers: [baseUrl]
    });
  }
);

app.get('/mcp', (req, res) => {
  res.setHeader('Allow', 'POST, OPTIONS');
  res.status(405).json({
    jsonrpc: '2.0',
    id: null,
    error: { code: -32000, message: 'Method not allowed. Use POST.' }
  });
});

app.post(
  '/mcp',
  (req, res, next) => {
    res.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="${mcpBaseUrl(req)}/.well-known/oauth-protected-resource"`
    );
    next();
  },
  (req, res, next) => {
    const params = req.body?.params || {};
    logCaller('MCP Request', req, {
      rpcMethod: req.body?.method,
      tool: params.name,
      clientInfo: params.clientInfo,
      hasBearer: /^Bearer\s/i.test(req.headers.authorization || ''),
      promptHint: params.arguments?.prompt ?? params.arguments?.query
    });
    next();
  },
  requireMcpAuthForRequest,
  handleMcp
);

// REMOVE THIS before shipping
//app.post('/mcp-debug', handleMcp);

// Global error handler — MUST be the last app.use() before app.listen()
app.use((err, req, res, next) => {
  console.error('========== EXPRESS ERROR ==========');
  console.error('Name:', err.name);
  console.error('Message:', err.message);
  console.error('Status:', err.status || err.statusCode || 500);
  console.error('Method:', req.method, req.originalUrl);
  console.error('Headers:', {
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length'],
    authorization:
      req.headers.authorization
        ? req.headers.authorization.slice(0, 20) + '…'
        : '(none)',
    origin: req.headers.origin || '(none)'
  });
  console.error('Stack:', err.stack);
  console.error('===================================');

  // If headers were already sent, we can't do anything — delegate.
  if (res.headersSent) {
    return next(err);
  }

  let status = err.status || err.statusCode || 500;

  // Map body-parser errors to a clearer JSON-RPC message
  let message = err.message || 'Internal error';
  if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large.';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body is not valid JSON.';
  }

  res.status(status).json({
    jsonrpc: '2.0',
    id: req.body?.id ?? null,
    error: {
      code: -32700,
      message
    }
  });
});

app.listen(config.port, () => console.log(`Trimble Claude MCP listening on ${config.port}`));

// Render's free plan spins the service down after ~15 min idle, causing a
// 30-60s cold start on the next request. Self-ping /health periodically to
// keep the instance warm.
const KEEP_ALIVE_INTERVAL_MS = 10 * 60 * 1000;

if (process.env.PUBLIC_BASE_URL) {
  setInterval(() => {
    fetch(`${process.env.PUBLIC_BASE_URL}/health`)
      .catch((e) => console.error('[keep-alive] Ping failed:', e.message));
  }, KEEP_ALIVE_INTERVAL_MS);
}

function escapeHtml(s){return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\\':'&#39;'}[c]));}
