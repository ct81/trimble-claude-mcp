import {
  getDefinitions,
  callTool
} from './tools.js';

export async function handleMcp(   // <-- CHANGED: was `export function`
  req,
  res
) {
  const sessionId =
    req.mcpSessionId;

  const body =
    req.body || {};

  // ==========================================
  // REQUEST LOGGING
  // ==========================================

  console.log(
    '========== MCP REQUEST =========='
  );

  console.log(
    'Method:',
    body.method
  );

  console.log(
    'ID:',
    body.id
  );

  console.log(
    'Params:',
    JSON.stringify(
      body.params || {},
      (key, value) => {
        if (
          key === 'pdfBase64' &&
          typeof value === 'string'
        ) {
          return `[PDF BASE64: ${value.length} chars]`;
        }
        return value;
      },
      2
    )
  );

  console.log(
    '================================='
  );


  // ==========================================
  // INITIALIZE
  // ==========================================

  if (
    body.method === 'initialize'
  ) {
    if (sessionId) {
      res.setHeader(
        'Mcp-Session-Id',
        sessionId
      );
    }

    return res.json({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        protocolVersion:
          '2025-06-18',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name:
            'trimble-connect-mcp',
          version:
            '1.0.0'
        },
        instructions:
          'When a user starts a conversation without a specific task, call trimble_get_started and present its choices. If they choose Tekla or SketchUp, call trimble_get_started again with platform set to their choice. If it returns multiple bridge options, present them as numbered Name - URL/host choices, ask the user to choose, then call trimble_select_bridge with the platform and option number before using that platform tools. If it returns one option, it is selected automatically. If they choose Trimble Connect, help with that platform using the available tools. If they choose Later, do not call any platform tools. Do not interrupt a user who already stated a specific task.'
      }
    });
  }


  // ==========================================
  // INITIALIZED NOTIFICATION
  // ==========================================

  if (
    body.method ===
    'notifications/initialized'
  ) {
    return res
      .status(202)
      .end();
  }


  // ==========================================
  // TOOLS LIST
  // ==========================================

  if (
    body.method === 'tools/list'
  ) {

    // CHANGED: now async, merges Trimble + SketchUp tools
    const tools =
      await getDefinitions();

    return res.json({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        tools
      }
    });
  }


  // ==========================================
  // TOOLS CALL
  // ==========================================

  if (
    body.method === 'tools/call'
  ) {
    const name =
      body.params?.name;

    const args =
      body.params?.arguments || {};

    // All tool namespaces use the shared callTool() dispatcher.


    console.log(
      '========== MCP TOOL CALL =========='
    );

    console.log(
      'Tool:',
      name
    );

    console.log(
      'Argument keys:',
      Object.keys(args)
    );

    console.log(
      'Arguments:',
      JSON.stringify(
        args,
        (key, value) => {
          if (
            key === 'pdfBase64' &&
            typeof value === 'string'
          ) {
            return `[PDF BASE64: ${value.length} chars]`;
          }
          return value;
        },
        2
      )
    );

    console.log(
      '==================================='
    );

    // NOTE: your existing callTool signature is (sessionId, name, args).
    // Keep that order; the routing logic lives inside tools.js.
    return callTool(
      sessionId,
      name,
      args
    )
      .then(
        result => {
          return res.json({
            jsonrpc: '2.0',
            id: body.id,
            result
          });
        }
      )
      .catch(
        error => {
          console.error(
            'MCP tools/call error:',
            error
          );
          return res.status(200).json({
            jsonrpc: '2.0',
            id: body.id,
            error: {
              code: -32000,
              message:
                error.message
            }
          });
        }
      );
  }


  // ==========================================
  // UNKNOWN METHOD
  // ==========================================

  return res.status(400).json({
    jsonrpc: '2.0',
    id: body.id,
    error: {
      code: -32601,
      message:
        'Method not found'
    }
  });
}