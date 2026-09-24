import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { setTimeout as delay } from 'node:timers/promises';

const SKETCHUP_MCP_COMMAND = 'npx';
const SKETCHUP_MCP_ARGS = ['-y', '@parkhill/mcp-server-for-sketchup@latest'];
const SKETCHUP_CONNECT_TIMEOUT_MS = 30_000;

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
          SKETCHUP_MCP_HOST: '127.0.0.1',
          SKETCHUP_MCP_PORT: '9876',
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
  const client = await getSketchUpClient();
  if (!client) {
    throw new Error('SKETCHUP_NOT_RUNNING: SketchUp MCP backend is unavailable');
  }
  return client.callTool({ name, arguments: args });
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