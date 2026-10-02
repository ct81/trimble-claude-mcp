// Trimble AEC Connect (Captures Architecture, Engineering, & Construction workflows)

// git add . 
// git commit -m "Start MCP, Swagger, HTML & Javascript, PDF/JSON Extractor, Python, Tekla Open APIs, SketchUp Ruby APIs, TC Status Sharing, Workspace, Core, Model, ModelFeature, Organizer, Property Set, Regions & Topics APIs 
// #22"
// git push origin main

// git add src/mcp/http.js src/mcp/tools.js
// git commit -m "Fix MCP PDF input handling and diagnostics"
// git push origin main

//include all topic APIs to topics.js and use for mcp, swagger and server.js. and also tags: ['Core'],  summary:

import express from 'express';
import swaggerUi from 'swagger-ui-express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { config } from './config.js';
import { authorizationUrl, exchangeCode, requireSession } from './oauth/oauth.js';
// import { tools } from './trimble/client.js';
import { definitions, getDefinitions, callTool } from './mcp/tools.js';
import { handleMcp } from './mcp/http.js';
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
  getSessionIdFromMcpToken
} from './oauth/mcpTokens.js';

import {
  registerClient,
  getClient
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

const app = express();

app.set('trust proxy', 1);
app.use(cors({origin: config.extensionOrigin === '*' ? true : config.extensionOrigin, credentials:true}));
app.use(express.static(path.join(process.cwd(), 'public')));
app.use('/pages', express.static(path.join(process.cwd(), 'pages')));
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
                "none"
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

      if (!code_challenge) {

        return res.status(400).json({

          error:
            'invalid_request',

          error_description:
            'Missing code_challenge'
        });
      }

      if (
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

      const {
        grant_type,
        code,
        client_id,
        redirect_uri,
        code_verifier,
        resource
      } = req.body;

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
      // Client
      // -----------------------------------------

      const client =
        getClient(client_id);

      if (!client) {

        return res.status(400).json({

          error:
            'invalid_client',

          error_description:
            'Unknown client'
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

      return res.json({

        access_token:
          accessToken,

        token_type:
          'Bearer',

        expires_in:
          3600,

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
app.get(
  '/oauth/callback',
  async (req, res) => {

    try {

      const {
        code,
        state
      } = req.query;

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
app.get('/auth/success', (_, res) => res.send('<h2>Trimble authentication successful.</h2><p>You can close this window and return to Claude.</p>'));
app.get('/auth/status', requireSession, (req,res) => res.json({authenticated:true}));

// =========================================================
// GET TRIMBLE CONNECT APIs
// =========================================================

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

const teklaCreateRoutes = [
  { path: '/api/mcp/tekla/create/beam', toolName: 'tekla_create_beam' },
  { path: '/api/mcp/tekla/create/column', toolName: 'tekla_create_column' },
  { path: '/api/mcp/tekla/create/plate', toolName: 'tekla_create_plate' },
  { path: '/api/mcp/tekla/create/assembly', toolName: 'tekla_create_assembly' },
  { path: '/api/mcp/tekla/create/weld', toolName: 'tekla_create_weld' },
  { path: '/api/mcp/tekla/create/bolt', toolName: 'tekla_create_bolt' },
  { path: '/api/mcp/tekla/create/rebar', toolName: 'tekla_create_rebar' },
  { path: '/api/mcp/tekla/create/rebar-group', toolName: 'tekla_create_rebar_group' },
  { path: '/api/mcp/tekla/create/phase', toolName: 'tekla_create_phase' }
];

for (const route of teklaCreateRoutes) {
  app.post(
    route.path,
    requireSession,
    async (req, res) => {
      const args = req.body?.arguments ?? req.body ?? {};
      return executeTeklaTool(req, res, route.toolName, args);
    }
  );
}

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
app.post('/mcp', requireSession, handleMcp);

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
