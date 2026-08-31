//import crypto from 'node:crypto';
import { config } from '../config.js';
import { createSession, getSession, updateSession } from '../session-store.js';
import {
  getSessionIdFromMcpToken
} from './mcpTokens.js';

import {
  getOAuthState,
  deleteOAuthState,
  createOAuthState
} from './oauthState.js';

// export function authorizationUrl() {

//   if (
//     !config.trimble.clientId ||
//     !config.trimble.authorizationEndpoint
//   ) {
//     throw new Error(
//       'Trimble OAuth configuration is incomplete'
//     );
//   }

//   const state =
//     createOAuthState({
//       type: 'extension'
//     });

//   const url =
//     new URL(
//       config.trimble.authorizationEndpoint
//     );

//   url.searchParams.set(
//     'client_id',
//     config.trimble.clientId
//   );

//   url.searchParams.set(
//     'redirect_uri',
//     config.trimble.redirectUri
//   );

//   url.searchParams.set(
//     'response_type',
//     'code'
//   );

//   url.searchParams.set(
//     'scope',
//     config.trimble.scope
//   );

//   url.searchParams.set(
//     'state',
//     state
//   );

//   return url.toString();
// }

// export async function exchangeCode(
//   code,
//   state
// ) {

//   if (!code) {
//     throw new Error(
//       'Missing Trimble authorization code'
//     );
//   }

//   const body =
//     new URLSearchParams({

//       grant_type:
//         'authorization_code',

//       code,

//       redirect_uri:
//         config.trimble.redirectUri,

//       client_id:
//         config.trimble.clientId,

//       client_secret:
//         config.trimble.clientSecret
//     });

//   const response =
//     await fetch(
//       config.trimble.tokenEndpoint,
//       {
//         method: 'POST',

//         headers: {
//           'content-type':
//             'application/x-www-form-urlencoded'
//         },

//         body
//       }
//     );

//   const json =
//     await response.json();

//   console.log('[Trimble OAuth] Token response:', {
//     token_type: json.token_type,
//     expires_in: json.expires_in,
//     access_token: json.access_token
//       ? `${json.access_token.substring(0, 8)}...`
//       : null,
//     refresh_token: json.refresh_token
//       ? `${json.refresh_token.substring(0, 8)}...`
//       : null
//   });

//   console.log('[Trimble OAuth] FULL Token response:', {
//     token_type: json.token_type,
//     expires_in: json.expires_in,
//     access_token: json.access_token,
//     refresh_token: json.refresh_token
//   });

//   if (!response.ok) {

//     throw new Error(
//       `Trimble token exchange failed: ${JSON.stringify(json)}`
//     );
//   }

//   const sessionId =
//     createSession({
//       trimble: {
//         ...json,
//         obtained_at: Date.now()
//       }
//     });

//   return sessionId;
// }


// export async function refreshIfNeeded(sessionId) {
//   const session = getSession(sessionId); if (!session?.trimble?.refresh_token) return session;
//   const expiresAt = (session.trimble.obtained_at || 0) + (session.trimble.expires_in || 3600) * 1000;
//   if (Date.now() < expiresAt - 60000) return session;
//   const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.trimble.refresh_token, client_id: config.trimble.clientId, client_secret: config.trimble.clientSecret });
//   const response = await fetch(config.trimble.tokenEndpoint, { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body });
//   const json = await response.json();
//   if (!response.ok) throw new Error(`Trimble refresh failed: ${JSON.stringify(json)}`);
//   return updateSession(sessionId, { trimble: { ...session.trimble, ...json, obtained_at: Date.now() } });
// }



export function requireSession(
  req,
  res,
  next
) {

  /*
   * =========================================
   * Claude MCP OAuth
   * =========================================
   */

  const authHeader =
    req.headers.authorization;

  if (
    authHeader &&
    authHeader.startsWith('Bearer ')
  ) {

    const accessToken =
      authHeader.substring(7).trim();

    const sessionId =
      getSessionIdFromMcpToken(
        accessToken
      );

    if (!sessionId) {

      const baseUrl =
        process.env.PUBLIC_BASE_URL;

      res.setHeader(
        'WWW-Authenticate',
        `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
      );

      return res.status(401).json({
        error:
          'invalid_token'
      });
    }

    const session =
      getSession(sessionId);

    if (!session) {

      return res.status(401).json({
        error:
          'invalid_token'
      });
    }

    req.mcpSessionId =
      sessionId;

    req.session =
      session;

    return next();
  }

  /*
   * =========================================
   * Existing Trimble Connect extension
   * =========================================
   */

  const id =
    req.headers['x-mcp-session'] ||
    req.cookies?.mcp_session;

  const session =
    getSession(id);

  if (!session) {

    const baseUrl =
      process.env.PUBLIC_BASE_URL;

    res.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
    );

    return res.status(401).json({
      error:
        'authentication_required'
    });
  }

  req.mcpSessionId =
    id;

  req.session =
    session;

  next();
}

export function authorizationUrl() {

  if (
    !config.trimble.clientId ||
    !config.trimble.authorizationEndpoint
  ) {
    throw new Error(
      'Trimble OAuth configuration is incomplete'
    );
  }

  const state =
    crypto.randomBytes(24).toString('hex');

  createOAuthState(
    state,
    {
      type: 'extension',
      createdAt: Date.now()
    }
  );

  const url =
    new URL(
      config.trimble.authorizationEndpoint
    );

  url.searchParams.set(
    'client_id',
    config.trimble.clientId
  );

  url.searchParams.set(
    'redirect_uri',
    config.trimble.redirectUri
  );

  url.searchParams.set(
    'response_type',
    'code'
  );

  url.searchParams.set(
    'scope',
    config.trimble.scope
  );

  url.searchParams.set(
    'state',
    state
  );

  console.log(
    '[OAuth] Authorization URL created'
  );

  console.log(
    '[OAuth] State:',
    state
  );

  return url.toString();
}

export async function exchangeCode(
  code,
  state
) {

  console.log(
    '[OAuth] exchangeCode()'
  );

  console.log(
    '[OAuth] State received:',
    state
  );

  if (!code) {
    throw new Error(
      'Missing Trimble authorization code'
    );
  }

  if (!state) {
    throw new Error(
      'Missing OAuth state'
    );
  }

  const issued =
    getOAuthState(state);

  if (!issued) {
    throw new Error(
      'Invalid or expired OAuth state'
    );
  }

  console.log(
    '[OAuth] State validated:',
    issued
  );

  /*
   * IMPORTANT:
   * Delete state before exchanging the code.
   * This prevents reuse of the same OAuth state.
   */
  deleteOAuthState(state);

  const body =
    new URLSearchParams({

      grant_type:
        'authorization_code',

      code,

      redirect_uri:
        config.trimble.redirectUri,

      client_id:
        config.trimble.clientId,

      client_secret:
        config.trimble.clientSecret

    });

  const response =
    await fetch(
      config.trimble.tokenEndpoint,
      {
        method: 'POST',

        headers: {
          'content-type':
            'application/x-www-form-urlencoded'
        },

        body
      }
    );

  const text =
    await response.text();

  let json;

  try {
    json =
      text
        ? JSON.parse(text)
        : {};
  } catch {
    json = {
      raw: text
    };
  }

  if (!response.ok) {

    console.error(
      '[OAuth] Token exchange failed:',
      json
    );

    throw new Error(
      `Trimble token exchange failed: ${
        JSON.stringify(json)
      }`
    );
  }

  console.log(
    '[Trimble OAuth] Token response:',
    {
      token_type:
        json.token_type,

      expires_in:
        json.expires_in,

      has_access_token:
        !!json.access_token,

      has_refresh_token:
        !!json.refresh_token
    }
  );

  const sessionId =
    createSession({
      trimble: {
        ...json,
        obtained_at:
          Date.now()
      }
    });

  console.log(
    '[OAuth] Session created:',
    sessionId
  );

  return sessionId;
}

export async function refreshIfNeeded(
  sessionId
) {

  const session =
    getSession(sessionId);

  if (
    !session?.trimble?.refresh_token
  ) {
    return session;
  }

  const expiresAt =
    (
      session.trimble.obtained_at ||
      0
    ) +
    (
      session.trimble.expires_in ||
      3600
    ) *
    1000;

  if (
    Date.now() <
    expiresAt - 60000
  ) {
    return session;
  }

  console.log(
    '[Trimble OAuth] Access token expired. Refreshing...'
  );

  const body =
    new URLSearchParams({
      grant_type:
        'refresh_token',

      refresh_token:
        session.trimble.refresh_token,

      client_id:
        config.trimble.clientId,

      client_secret:
        config.trimble.clientSecret
    });

  const response =
    await fetch(
      config.trimble.tokenEndpoint,
      {
        method: 'POST',

        headers: {
          'content-type':
            'application/x-www-form-urlencoded'
        },

        body
      }
    );

  const json =
    await response.json();

  if (!response.ok) {

    console.error(
      '[Trimble OAuth] Refresh failed:',
      json
    );

    throw new Error(
      `Trimble refresh failed: ${JSON.stringify(json)}`
    );
  }

  return updateSession(
    sessionId,
    {
      trimble: {
        ...session.trimble,

        ...json,

        /*
         * Some OAuth providers don't return
         * a new refresh_token.
         *
         * Keep the old one.
         */
        refresh_token:
          json.refresh_token ||
          session.trimble.refresh_token,

        obtained_at:
          Date.now()
      }
    }
  );
}