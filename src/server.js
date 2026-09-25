// git add . 
// git commit -m "Start MCP, Swagger, UI, TC Workspace API and Property Set API #87"
// git push origin main

// git add src/mcp/http.js src/mcp/tools.js
// git commit -m "Fix MCP PDF input handling and diagnostics"
// git push origin main

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
  topics
} from './trimble/index.js';

import pdfRouter
  from './pdf/pdf.js';

const app = express();

app.set('trust proxy', 1);
app.use(cors({origin: config.extensionOrigin === '*' ? true : config.extensionOrigin, credentials:true}));
app.use(express.static(path.join(process.cwd(), 'public')));
app.use('/pages', express.static(path.join(process.cwd(), 'pages')));
app.use('/src', express.static(path.join(process.cwd(), 'src')));

//app.use(express.json({limit:'2mb'}));
app.use(express.json({ limit: '500mb' }));
app.use(
    express.urlencoded({
        extended: true
    })
);
app.use(cookieParser());
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
  swaggerUi.setup(swaggerDocument, {
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
        await core.getRegions(
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

  const status = err.status || err.statusCode || 500;

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
function escapeHtml(s){return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\\':'&#39;'}[c]));}
