import {
  definitions,
  callTool
} from './tools.js';

export function handleMcp(
  req,
  res
) {
  const sessionId =
    req.mcpSessionId;

  const body =
    req.body || {};

  // ==========================================
  // INITIALIZE
  // ==========================================

  if (
    body.method === 'initialize'
  ) {
    if (sessionId) {
      res.setHeader('Mcp-Session-Id', sessionId);
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
            'trimble-claude-mcp',

          version:
            '1.0.0'
        }
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
    return res.status(202).end();
  }


  // ==========================================
  // TOOLS LIST
  // ==========================================

  if (
    body.method === 'tools/list'
  ) {
    return res.json({
      jsonrpc: '2.0',

      id: body.id,

      result: {
        tools: definitions
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

    return callTool(
      sessionId,
      name,
      args
    )
      .then(result => {

        return res.json({
          jsonrpc: '2.0',

          id: body.id,

          result
        });

      })
      .catch(error => {

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

      });
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

// import { definitions, callTool } from './tools.js';

// export function handleMcp(req, res) {
//   const sessionId = req.mcpSessionId;
//   const body = req.body || {};
//   if (body.method === 'initialize') return res.json({jsonrpc:'2.0',id:body.id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'trimble-claude-mcp',version:'1.0.0'}}});
//   if (body.method === 'notifications/initialized') return res.status(202).end();
//   if (body.method === 'tools/list') return res.json({jsonrpc:'2.0',id:body.id,result:{tools:definitions}});
//   if (body.method === 'tools/call') return callTool(sessionId, body.params?.name, body.params?.arguments || {}).then(result => res.json({jsonrpc:'2.0',id:body.id,result})).catch(e => res.status(500).json({jsonrpc:'2.0',id:body.id,error:{code:-32000,message:e.message}}));
//   return res.status(400).json({jsonrpc:'2.0',id:body.id,error:{code:-32601,message:'Method not found'}});
// }
