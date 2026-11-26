import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const page = readFileSync(new URL('../pages/login/login.html', import.meta.url), 'utf8');
test('Outlook popup hands its token to the opener tab and ignores other windows', async () => {
    const start = page.indexOf("  window.addEventListener('message', async");
    const end = page.indexOf('  /* ═══════════════ ACCOUNT REQUEST', start);
    assert.ok(start >= 0 && end > start);
    let handler;
    let rendered = false;
    const stored = new Map();
    const popup = {};
    const user = { id: 'user', email: 'user@example.com', provider: 'microsoft' };
    const context = vm.createContext({
        activePopup: popup,
        location: { origin: 'https://example.com' },
        window: { addEventListener: (_event, callback) => { handler = callback; } },
        hideConnecting() {}, getUsers: () => ({ user }), setSession() {},
        clearSession() {}, showMsg() {},
        renderApp: async () => { rendered = true; return true; },
        LABELS: { microsoft: 'Outlook' }, OUTLOOK_TOKEN_KEY: 'outlook-token',
        sessionStorage: { setItem: (key, value) => stored.set(key, JSON.parse(value)) }
    });
    vm.runInContext(page.slice(start, end), context);
    const data = { source: 'oauth-demo', ok: true, provider: 'microsoft', email: user.email,
        outlookToken: { email: user.email, accessToken: 'test-token', expiresAt: Date.now() + 3600000 } };
    await handler({ origin: 'https://example.com', source: {}, data });
    assert.equal(rendered, false);
    await handler({ origin: 'https://example.com', source: popup, data });
    assert.equal(stored.get('outlook-token').accessToken, 'test-token');
    assert.equal(rendered, true);
});

test('Outlook code exchange requests Mail.Read without a secret and retains token expiry', async () => {
    const start = page.indexOf('  async function exchangeCode(');
    const end = page.indexOf('  async function fetchProfile(', start);
    assert.ok(start >= 0 && end > start);
    let scopes = 'User.Read Mail.Read';
    const context = vm.createContext({
        URLSearchParams,
        REDIRECT_URI: 'https://example.com/login.html',
        CONFIG: { microsoft: { clientId: 'test-client', tenant: 'common', scopes: ['User.Read', 'Mail.Read'] } },
        fetch: async (url, options) => {
            assert.equal(url, 'https://login.microsoftonline.com/common/oauth2/v2.0/token');
            assert.equal(options.body.get('code_verifier'), 'verifier');
            assert.equal(options.body.has('client_secret'), false);
            return { ok: true, json: async () => ({ access_token: 'test-token', expires_in: 3600, scope: scopes }) };
        }
    });
    vm.runInContext(page.slice(start, end), context);
    const token = await context.exchangeCode('microsoft', 'code', 'verifier');
    assert.equal(token.accessToken, 'test-token');
    assert.ok(token.expiresAt > Date.now());
    scopes = 'User.Read';
    await assert.rejects(context.exchangeCode('microsoft', 'code', 'verifier'), /Mail.Read permission/);
});
