import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SKETCHUP_MCP_COMMAND = 'npx';
const SKETCHUP_MCP_ARGS = ['-y', '@parkhill/mcp-server-for-sketchup@latest'];

let sketchupClient = null;

/**
 * Lazily connect to the SketchUp MCP server via stdio.
 */
export async function getSketchUpClient() {
  if (sketchupClient) return sketchupClient;

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

    const client = new Client(
      { name: 'trimble-connect-mcp-proxy', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
    sketchupClient = client;
    console.log('[SketchUp] Backend connected via stdio');
    return sketchupClient;
  } catch (err) {
    console.error('[SketchUp] Connection failed:', err.message);
    return null;
  }
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
  const result = await client.listTools();
  return result.tools || [];
}