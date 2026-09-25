import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const SKETCHUP_MCP_COMMAND = process.execPath;
const SKETCHUP_MCP_ARGS = [
  'node_modules/@parkhill/mcp-server-for-sketchup/build/index.js'
];
const SKETCHUP_CONNECT_TIMEOUT_MS = 30_000;
const SKETCHUP_MCP_HOST = process.env.SKETCHUP_MCP_HOST || '0.tcp.ap.ngrok.io';
const SKETCHUP_MCP_PORT = process.env.SKETCHUP_MCP_PORT || '16942';
const SKETCHUP_MCP_PROTOCOL = process.env.SKETCHUP_MCP_PROTOCOL || 'legacy';
const SKETCHUP_MCP_CLIENT_VERSION = process.env.SKETCHUP_MCP_CLIENT_VERSION || '0.3.1';
const SKETCHUP_MCP_CALL_TIMEOUT_MS = 60_000;

let sketchupClient = null;
let sketchupClientPromise = null;

/**
 * Lazily connect to the SketchUp MCP server via stdio.
 */
export async function getSketchUpClient() {
  if (sketchupClient) return sketchupClient;
  if (sketchupClientPromise) return sketchupClientPromise;

  sketchupClientPromise = (async () => {
    let client;

    try {
      const transport = new StdioClientTransport({
        command: SKETCHUP_MCP_COMMAND,
        args: SKETCHUP_MCP_ARGS,
        env: {
          ...process.env,
          SKETCHUP_MCP_HOST,
          SKETCHUP_MCP_PORT,
        },
      });

      client = new Client(
        { name: 'trimble-connect-mcp-proxy', version: '1.0.0' },
        { capabilities: {} }
      );

      await Promise.race([
        client.connect(transport),
        delay(SKETCHUP_CONNECT_TIMEOUT_MS).then(() => {
          throw new Error(
            `Connection timed out after ${SKETCHUP_CONNECT_TIMEOUT_MS} ms`
          );
        })
      ]);

      sketchupClient = client;
      console.log('[SketchUp] Backend connected via stdio');
      return client;
    } catch (err) {
      console.error('[SketchUp] Connection failed:', err.message);
      try {
        await client?.close();
      } catch {
        // The transport may already have exited.
      }
      return null;
    } finally {
      sketchupClientPromise = null;
    }
  })();

  return sketchupClientPromise;
}

/**
 * Forward a tool call to the SketchUp backend.
 */
export async function callSketchUpTool(name, args) {
  if (SKETCHUP_MCP_PROTOCOL === 'legacy') {
    const realName = name === 'status' ? 'get_selection' : name;
    return callLegacySketchUpTool(realName, args);
  }

  const client = await getSketchUpClient();
  if (!client) {
    throw new Error('SKETCHUP_NOT_RUNNING: SketchUp MCP backend is unavailable');
  }

  const result = await client.listTools();
  const availableNames = new Set(
    (result.tools || []).map((tool) => tool.name)
  );
  const backendName = availableNames.has(name)
    ? name
    : availableNames.has(`sketchup_${name}`)
      ? `sketchup_${name}`
      : name;

  return client.callTool({ name: backendName, arguments: args });
}

function callLegacySketchUpTool(name, args) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({
      host: SKETCHUP_MCP_HOST,
      port: Number(SKETCHUP_MCP_PORT)
    });
    let buffer = Buffer.alloc(0);
    let requestId = 1;
    let settled = false;
    let timeout;

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      callback();
    };

    const send = (method, params) => {
      const body = Buffer.from(JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: requestId++
      }));
      const frame = Buffer.alloc(body.length + 4);
      frame.writeUInt32BE(body.length);
      body.copy(frame, 4);
      socket.write(frame);
    };

    const handleFrame = (body) => {
      let response;
      try {
        response = JSON.parse(body.toString('utf8'));
      } catch (error) {
        finish(() => reject(new Error(`Invalid SketchUp response: ${error.message}`)));
        return;
      }

      if (response.error) {
        finish(() => reject(new Error(response.error.message || 'SketchUp request failed')));
        return;
      }

      if (response.id === 1) {
        send('tools/call', { name, arguments: args });
        return;
      }

      finish(() => resolve(response.result || {}));
    };

    socket.setTimeout(SKETCHUP_MCP_CALL_TIMEOUT_MS, () => {
      finish(() => reject(new Error(`SketchUp request timed out after ${SKETCHUP_MCP_CALL_TIMEOUT_MS} ms`)));
    });
    socket.on('connect', () => {
      send('hello', { client_version: SKETCHUP_MCP_CLIENT_VERSION });
    });
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 4) {
        const length = buffer.readUInt32BE(0);
        if (buffer.length < length + 4) return;
        const body = buffer.subarray(4, length + 4);
        buffer = buffer.subarray(length + 4);
        handleFrame(body);
      }
    });
    socket.on('error', (error) => {
      finish(() => reject(error));
    });
    timeout = setTimeout(() => {
      finish(() => reject(new Error('SketchUp connection timed out')));
    }, SKETCHUP_MCP_CALL_TIMEOUT_MS);
  });
}

/**
 * Fetch all tool definitions from the SketchUp backend.
 */
export async function listSketchUpTools() {
  const client = await getSketchUpClient();
  if (!client) return [];

  try {
    const result = await client.listTools();
    return result.tools || [];
  } catch (err) {
    console.error('[SketchUp] Tool discovery failed:', err.message);
    sketchupClient = null;
    return [];
  }
}