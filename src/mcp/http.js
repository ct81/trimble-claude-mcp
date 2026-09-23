import {
  definitions,
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


// import {
//   definitions,
//   callTool
// } from './tools.js';

// export function handleMcp(
//   req,
//   res
// ) {
//   const sessionId =
//     req.mcpSessionId;

//   const body =
//     req.body || {};

//   // ==========================================
//   // REQUEST LOGGING
//   // ==========================================

//   console.log(
//     '========== MCP REQUEST =========='
//   );

//   console.log(
//     'Method:',
//     body.method
//   );

//   console.log(
//     'ID:',
//     body.id
//   );

//   console.log(
//     'Params:',
//     JSON.stringify(
//       body.params || {},
//       (key, value) => {

//         // Never print the actual PDF Base64
//         if (
//           key === 'pdfBase64' &&
//           typeof value === 'string'
//         ) {
//           return `[PDF BASE64: ${value.length} chars]`;
//         }

//         return value;
//       },
//       2
//     )
//   );

//   console.log(
//     '================================='
//   );


//   // ==========================================
//   // INITIALIZE
//   // ==========================================

//   if (
//     body.method === 'initialize'
//   ) {

//     if (sessionId) {
//       res.setHeader(
//         'Mcp-Session-Id',
//         sessionId
//       );
//     }

//     return res.json({

//       jsonrpc: '2.0',

//       id: body.id,

//       result: {

//         protocolVersion:
//           '2025-06-18',

//         capabilities: {
//           tools: {}
//         },

//         serverInfo: {

//           name:
//             'trimble-connect-mcp',

//           version:
//             '1.0.0'

//         }

//       }

//     });
//   }


//   // ==========================================
//   // INITIALIZED NOTIFICATION
//   // ==========================================

//   if (
//     body.method ===
//     'notifications/initialized'
//   ) {

//     return res
//       .status(202)
//       .end();

//   }


//   // ==========================================
//   // TOOLS LIST
//   // ==========================================

//   if (
//     body.method === 'tools/list'
//   ) {

//     return res.json({

//       jsonrpc: '2.0',

//       id: body.id,

//       result: {

//         tools: definitions

//       }

//     });

//   }


//   // ==========================================
//   // TOOLS CALL
//   // ==========================================

//   if (
//     body.method === 'tools/call'
//   ) {

//     const name =
//       body.params?.name;

//     const args =
//       body.params?.arguments || {};


//     console.log(
//       '========== MCP TOOL CALL =========='
//     );

//     console.log(
//       'Tool:',
//       name
//     );

//     console.log(
//       'Argument keys:',
//       Object.keys(args)
//     );

//     console.log(
//       'Arguments:',
//       JSON.stringify(
//         args,
//         (key, value) => {

//           if (
//             key === 'pdfBase64' &&
//             typeof value === 'string'
//           ) {

//             return `[PDF BASE64: ${value.length} chars]`;

//           }

//           return value;

//         },
//         2
//       )
//     );

//     console.log(
//       '==================================='
//     );


//     return callTool(
//       sessionId,
//       name,
//       args
//     )

//       .then(
//         result => {

//           return res.json({

//             jsonrpc: '2.0',

//             id: body.id,

//             result

//           });

//         }
//       )

//       .catch(
//         error => {

//           console.error(
//             'MCP tools/call error:',
//             error
//           );

//           return res.status(200).json({

//             jsonrpc: '2.0',

//             id: body.id,

//             error: {

//               code: -32000,

//               message:
//                 error.message

//             }

//           });

//         }
//       );

//   }


//   // ==========================================
//   // UNKNOWN METHOD
//   // ==========================================

//   return res.status(400).json({

//     jsonrpc: '2.0',

//     id: body.id,

//     error: {

//       code: -32601,

//       message:
//         'Method not found'

//     }

//   });

// }








// import {
//   definitions,
//   callTool
// } from './tools.js';

// export function handleMcp(
//   req,
//   res
// ) {
//   const sessionId =
//     req.mcpSessionId;

//   const body =
//     req.body || {};

//   // ==========================================
//   // INITIALIZE
//   // ==========================================

//   if (
//     body.method === 'initialize'
//   ) {
//     if (sessionId) {
//       res.setHeader('Mcp-Session-Id', sessionId);
//     }

//     return res.json({
//       jsonrpc: '2.0',

//       id: body.id,

//       result: {
//         protocolVersion:
//           '2025-06-18',

//         capabilities: {
//           tools: {}
//         },

//         serverInfo: {
//           name:
//             'trimble-claude-mcp',

//           version:
//             '1.0.0'
//         }
//       }
//     });
//   }


//   // ==========================================
//   // INITIALIZED NOTIFICATION
//   // ==========================================

//   if (
//     body.method ===
//     'notifications/initialized'
//   ) {
//     return res.status(202).end();
//   }


//   // ==========================================
//   // TOOLS LIST
//   // ==========================================

//   if (
//     body.method === 'tools/list'
//   ) {
//     return res.json({
//       jsonrpc: '2.0',

//       id: body.id,

//       result: {
//         tools: definitions
//       }
//     });
//   }


//   // ==========================================
//   // TOOLS CALL
//   // ==========================================

//   if (
//     body.method === 'tools/call'
//   ) {

//     const name =
//       body.params?.name;

//     const args =
//       body.params?.arguments || {};

//     return callTool(
//       sessionId,
//       name,
//       args
//     )
//       .then(result => {

//         return res.json({
//           jsonrpc: '2.0',

//           id: body.id,

//           result
//         });

//       })
//       .catch(error => {

//         console.error(
//           'MCP tools/call error:',
//           error
//         );

//         return res.status(200).json({
//           jsonrpc: '2.0',

//           id: body.id,

//           error: {
//             code: -32000,

//             message:
//               error.message
//           }
//         });

//       });
//   }


//   // ==========================================
//   // UNKNOWN METHOD
//   // ==========================================

//   return res.status(400).json({
//     jsonrpc: '2.0',

//     id: body.id,

//     error: {
//       code: -32601,

//       message:
//         'Method not found'
//     }
//   });
// }

// // import { definitions, callTool } from './tools.js';

// // export function handleMcp(req, res) {
// //   const sessionId = req.mcpSessionId;
// //   const body = req.body || {};
// //   if (body.method === 'initialize') return res.json({jsonrpc:'2.0',id:body.id,result:{protocolVersion:'2025-06-18',capabilities:{tools:{}},serverInfo:{name:'trimble-claude-mcp',version:'1.0.0'}}});
// //   if (body.method === 'notifications/initialized') return res.status(202).end();
// //   if (body.method === 'tools/list') return res.json({jsonrpc:'2.0',id:body.id,result:{tools:definitions}});
// //   if (body.method === 'tools/call') return callTool(sessionId, body.params?.name, body.params?.arguments || {}).then(result => res.json({jsonrpc:'2.0',id:body.id,result})).catch(e => res.status(500).json({jsonrpc:'2.0',id:body.id,error:{code:-32000,message:e.message}}));
// //   return res.status(400).json({jsonrpc:'2.0',id:body.id,error:{code:-32601,message:'Method not found'}});
// // }
