import crypto from 'node:crypto';
import { config } from '../config.js';
import { createSession, getSession, updateSession } from '../session-store.js';

const states = new Map();

export function authorizationUrl() {
  if (!config.trimble.clientId || !config.trimble.authorizationEndpoint) throw new Error('Trimble OAuth configuration is incomplete');
  const state = crypto.randomBytes(24).toString('hex');
  states.set(state, Date.now());
  const url = new URL(config.trimble.authorizationEndpoint);
  url.searchParams.set('client_id', config.trimble.clientId);
  url.searchParams.set('redirect_uri', config.trimble.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.trimble.scope);
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeCode(code, state) {
  const issued = states.get(state);
  if (!issued || Date.now() - issued > 10 * 60 * 1000) throw new Error('Invalid or expired OAuth state');
  states.delete(state);
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: config.trimble.redirectUri, client_id: config.trimble.clientId, client_secret: config.trimble.clientSecret });
  const response = await fetch(config.trimble.tokenEndpoint, { method: 'POST', headers: {'content-type':'application/x-www-form-urlencoded'}, body });
  const json = await response.json();
  if (!response.ok) throw new Error(`Trimble token exchange failed: ${JSON.stringify(json)}`);
  const sessionId = createSession({ trimble: json });
  return sessionId;
}

// export function requireSession(req, res, next) {
//   const id = req.headers['x-mcp-session'] || req.cookies?.mcp_session;
//   const session = getSession(id);
//   if (!session) return res.status(401).json({ error: 'authentication_required', authorize: '/oauth/login' });
//   req.mcpSessionId = id; req.session = session; next();
// }
export function requireSession(req, res, next) {
  /*
   * 1. Existing browser/extension session
   */
  const legacyId =
    req.headers['x-mcp-session'] ||
    req.cookies?.mcp_session;

  /*
   * 2. MCP OAuth Bearer token
   */
  const authHeader =
    req.headers.authorization;

  let bearerToken = null;

  if (authHeader) {
    const match =
      authHeader.match(/^Bearer\s+(.+)$/i);

    if (match) {
      bearerToken = match[1];
    }
  }

  /*
   * Prefer OAuth Bearer token for Claude.
   * Fall back to existing session authentication.
   */
  const id = bearerToken || legacyId;

  const session = getSession(id);

  if (!session) {
    const baseUrl =
      process.env.PUBLIC_BASE_URL;

    res.setHeader(
      'WWW-Authenticate',
      `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`
    );

    return res.status(401).json({
      error: 'authentication_required'
    });
  }

  req.mcpSessionId = id;
  req.session = session;

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
