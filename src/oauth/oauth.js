import crypto from 'node:crypto';
import { config } from '../config.js';
import { createSession, getSession, updateSession } from '../session-store.js';

const states = new Map();

// export function authorizationUrl() {
//   if (!config.trimble.clientId || !config.trimble.authorizationEndpoint) throw new Error('Trimble OAuth configuration is incomplete');
//   const state = crypto.randomBytes(24).toString('hex');
//   states.set(state, Date.now());
//   const url = new URL(config.trimble.authorizationEndpoint);
//   url.searchParams.set('client_id', config.trimble.clientId);
//   url.searchParams.set('redirect_uri', config.trimble.redirectUri);
//   url.searchParams.set('response_type', 'code');
//   url.searchParams.set('scope', config.trimble.scope);
//   url.searchParams.set('state', state);
//   return url.toString();
// }
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

  states.set(
    state,
    Date.now()
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

  return url.toString();
}

export function authorizationUrlForMcp(
  transactionId
) {

  if (
    !config.trimble.clientId ||
    !config.trimble.authorizationEndpoint
  ) {
    throw new Error(
      'Trimble OAuth configuration is incomplete'
    );
  }

  const trimbleState =
    crypto.randomBytes(24).toString('hex');

  states.set(
    trimbleState,
    {
      type: 'mcp',

      transactionId,

      createdAt:
        Date.now()
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
    trimbleState
  );

  return url.toString();
}

// export async function exchangeCode(code, state) {
//   const issued = states.get(state);
//   if (!issued || Date.now() - issued > 10 * 60 * 1000) throw new Error('Invalid or expired OAuth state');
//   states.delete(state);
//   const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: config.trimble.redirectUri, client_id: config.trimble.clientId, client_secret: config.trimble.clientSecret });
//   const response = await fetch(config.trimble.tokenEndpoint, { method: 'POST', headers: {'content-type':'application/x-www-form-urlencoded'}, body });
//   const json = await response.json();
//   if (!response.ok) throw new Error(`Trimble token exchange failed: ${JSON.stringify(json)}`);
//   const sessionId = createSession({ trimble: json });
//   return sessionId;
// }
export async function exchangeCode(code, state) {

  const issued =
    states.get(state);

  if (!issued) {
    throw new Error(
      'Invalid or expired OAuth state'
    );
  }

  /*
   * Existing extension OAuth stores
   * a number.
   *
   * MCP OAuth stores an object.
   */
  const issuedAt =
    typeof issued === 'number'
      ? issued
      : issued.createdAt;

  if (
    !issuedAt ||
    Date.now() - issuedAt >
      10 * 60 * 1000
  ) {

    states.delete(state);

    throw new Error(
      'Invalid or expired OAuth state'
    );
  }

  /*
   * IMPORTANT:
   *
   * Do NOT delete the state here.
   *
   * The MCP callback still needs to know
   * whether this was an MCP OAuth request.
   *
   * We will delete it after the flow is
   * successfully completed.
   */

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

  const json =
    await response.json();

  if (!response.ok) {

    throw new Error(
      `Trimble token exchange failed: ${JSON.stringify(json)}`
    );
  }

  /*
   * Create your existing application session.
   */
  const sessionId =
    createSession({
      trimble: json
    });

  return sessionId;
}

// export function requireSession(req, res, next) {
//   const id = req.headers['x-mcp-session'] || req.cookies?.mcp_session;
//   const session = getSession(id);
//   if (!session) return res.status(401).json({ error: 'authentication_required', authorize: '/oauth/login' });
//   req.mcpSessionId = id; req.session = session; next();
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

export async function refreshIfNeeded(sessionId) {
  const session = getSession(sessionId); if (!session?.trimble?.refresh_token) return session;
  const expiresAt = (session.trimble.obtained_at || 0) + (session.trimble.expires_in || 3600) * 1000;
  if (Date.now() < expiresAt - 60000) return session;
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.trimble.refresh_token, client_id: config.trimble.clientId, client_secret: config.trimble.clientSecret });
  const response = await fetch(config.trimble.tokenEndpoint, { method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body });
  const json = await response.json();
  if (!response.ok) throw new Error(`Trimble refresh failed: ${JSON.stringify(json)}`);
  return updateSession(sessionId, { trimble: { ...session.trimble, ...json, obtained_at: Date.now() } });
}
