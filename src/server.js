// git add .
// git commit -m "Start MCP 21"
// git push origin main


import express from 'express';
import swaggerUi from 'swagger-ui-express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { authorizationUrl, exchangeCode, requireSession } from './oauth/oauth.js';
// import { tools } from './trimble/client.js';
import { definitions, callTool } from './mcp/tools.js';
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

import {
  swaggerDocument
} from './swagger/swagger.js';

import {
  core,
  model,
  modelFeature,
  organizer,
  propertySet,
  topics
} from './trimble/index.js';

const app = express();

// const swaggerDocument = {
//     openapi: '3.0.3',

//     info: {
//         title: 'Trimble Connect MCP API',
//         version: '1.0.0',
//         description:
//             'Testing API for Trimble Connect MCP tools'
//     },

//     servers: [
//         {
//             url:
//                 process.env.PUBLIC_BASE_URL ||
//                 `http://localhost:${config.port}`
//         }
//     ],

//     components: {

//         securitySchemes: {

//             bearerAuth: {
//                 type: 'http',
//                 scheme: 'bearer',
//                 bearerFormat: 'MCP Access Token'
//             }

//         },

//         schemas: {

//             Project: {
//                 type: 'object',
//                 additionalProperties: true
//             },

//             Error: {
//                 type: 'object',

//                 properties: {
//                     error: {
//                         type: 'string'
//                     }
//                 }
//             }

//         }

//     },

//     paths: {}
// };

// swaggerDocument.paths['/api/v1/projects'] = {
//   get: {
//     summary: 'Get Trimble Connect projects',

//     description:
//       'Returns the Trimble Connect projects available to the authenticated user.',

//     security: [
//       {
//         bearerAuth: []
//       }
//     ],

//     responses: {
//       200: {
//         description: 'Projects retrieved successfully'
//       },

//       401: {
//         description: 'Authentication required'
//       },

//       500: {
//         description: 'Trimble API error'
//       }
//     }
//   }
// };

app.set('trust proxy', 1);
app.use(cors({origin: config.extensionOrigin === '*' ? true : config.extensionOrigin, credentials:true}));
// app.use(
//   cors({
//     origin: true,
//     credentials: true
//   })
// );
//app.use(express.json({limit:'2mb'}));
app.use(express.json());
app.use(
    express.urlencoded({
        extended: true
    })
);
app.use(cookieParser());
app.use(
    '/swagger',
    swaggerUi.serve,
    swaggerUi.setup(
        swaggerDocument,
        {
            explorer: true
        }
    )
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
// TEST: GET TRIMBLE CONNECT PROJECTS
// =========================================================

// app.get(
//   '/api/v1/projects',
//   requireSession,
//   async (req, res) => {

//     try {

//       console.log(
//         '[Swagger] Calling Trimble Connect getProjects'
//       );

//       console.log(
//         '[Swagger] Session ID:',
//         req.mcpSessionId
//           ? `${req.mcpSessionId.substring(0, 8)}...`
//           : null
//       );

//       const result =
//         await tools.getProjects(
//           req.mcpSessionId
//         );

//       console.log(
//         '[Swagger] getProjects successful'
//       );

//       return res.json(result);

//     } catch (error) {

//       console.error(
//         '[Swagger] getProjects failed:',
//         error
//       );

//       return res.status(500).json({
//         error: error.message
//       });

//     }
//   }
// );
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

app.post('/mcp', requireSession, handleMcp);
// app.post(
//   '/mcp',
//   (req, res, next) => {

//     console.log(
//       '========== MCP REQUEST =========='
//     );

//     console.log(
//       'Method:',
//       req.method
//     );

//     console.log(
//       'Headers:',
//       req.headers
//     );

//     console.log(
//       'Body:',
//       req.body
//     );

//     next();
//   },
//   requireSession,
//   handleMcp
// );

app.listen(config.port, () => console.log(`Trimble Claude MCP listening on ${config.port}`));
function escapeHtml(s){return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\\':'&#39;'}[c]));}
