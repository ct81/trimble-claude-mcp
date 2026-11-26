import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const page = readFileSync(new URL('../pages/login/login.html', import.meta.url), 'utf8');
const tokenResponse = {
    access_token: 'test-token', expires_in: 3600,
    scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly'
};
const start = page.indexOf('  function signInWithGoogle()');
const end = page.indexOf('  /* ═══════════════ OAUTH CALLBACK', start);
assert.ok(start >= 0 && end > start);

test('successful sign-in prompts registered users before redirecting to testmain', async () => {
    const start = page.indexOf('  async function renderApp(user)');
    const end = page.indexOf('  function signOut()', start);
    assert.ok(start >= 0 && end > start);
    const redirects = [];
    const logs = [];
    const alerts = [];
    const errors = [];
    let registered = true;
    let failed = false;
    let signedOut = false;
    const context = vm.createContext({
        URL,
        console: { log: (...args) => logs.push(args), error() {} },
        window: { alert: message => alerts.push(message) },
        showMsg: message => errors.push(message),
        fetch: async (url, options) => {
            assert.equal(url, '/api/login/status');
            assert.deepEqual(JSON.parse(options.body), { email: 'user@example.com' });
            return {
                ok: !failed, headers: { get: () => 'application/json' },
                json: async () => failed ? { error: 'Could not check registration.' } : { registered }
            };
        },
        readJSON: JSON.parse,
        GOOGLE_TOKEN_KEY: 'oauth_google_token_v1',
        sessionStorage: { getItem: () => JSON.stringify({ accessToken: 'secret-token', expiresAt: 123 }) },
        location: {
            href: 'https://example.com/trimble-claude-mcp/pages/login/login.html?code=example',
            replace: url => redirects.push(url)
        },
        signOut() { signedOut = true; }
    });
    vm.runInContext(page.slice(start, end), context);
    await context.renderApp(null);
    assert.equal(signedOut, true);
    assert.deepEqual(redirects, []);
    await context.renderApp({ email: 'user@example.com', hash: 'private-hash', salt: 'private-salt' });
    assert.deepEqual(alerts, ['You have registered with us.']);
    assert.deepEqual(redirects, ['https://example.com/trimble-claude-mcp/pages/login/testmain.html']);
    assert.equal(logs[1][1].accessToken, 'secret-token');
    assert.doesNotMatch(JSON.stringify(logs), /private-hash|private-salt/);
    registered = false;
    await context.renderApp({ email: 'user@example.com' });
    assert.equal(alerts.length, 1);
    assert.equal(redirects.length, 2);
    failed = true;
    await context.renderApp({ email: 'user@example.com' });
    assert.equal(redirects.length, 2);
    assert.match(errors[0], /Could not check registration/);
});

function createHarness() {
    let options;
    let requested;
    const messages = [];
    const sessions = [];
    const profiles = [];
    const storedTokens = new Map();
    let hidden = 0;
    const context = vm.createContext({
        window: { google: { accounts: { oauth2: {
            initTokenClient(config) {
                options = config;
                return { requestAccessToken(config) { requested = config; } };
            }
        } } } },
        CONFIG: { google: { clientId: 'test-client', scopes: tokenResponse.scope.split(' ') } },
        googleSignInRequest: 0,
        GOOGLE_TOKEN_KEY: 'oauth_google_token_v1',
        sessionStorage: { setItem: (key, value) => storedTokens.set(key, JSON.parse(value)) },
        clearMsg() {},
        showConnecting() {},
        hideConnecting() { hidden++; },
        showMsg: (message, type) => messages.push({ message, type }),
        fetchProfile: async (provider, token) => {
            profiles.push({ provider, token });
            return { id: 'user', email: 'user@example.com', name: 'User' };
        },
        upsertUser: profile => profile,
        setSession: user => sessions.push(user.email),
        renderApp() {}
    });
    vm.runInContext(page.slice(start, end), context);
    return { context, messages, sessions, profiles, storedTokens, get options() { return options; },
        get requested() { return requested; }, get hidden() { return hidden; } };
}

test('Google uses the token popup and signs in without an authorization-code exchange', async () => {
    const harness = createHarness();
    await harness.context.signInWith('google');
    assert.equal(harness.options.client_id, 'test-client');
    assert.equal(harness.options.scope, tokenResponse.scope);
    assert.equal(harness.requested.prompt, 'select_account');
    await harness.options.callback(tokenResponse);
    assert.deepEqual(harness.profiles, [{ provider: 'google', token: 'test-token' }]);
    assert.deepEqual(harness.sessions, ['user@example.com']);
    assert.equal(harness.hidden, 1);
    assert.equal(harness.messages.at(-1).type, 'ok');
    const token = harness.storedTokens.get('oauth_google_token_v1');
    assert.equal(token.accessToken, 'test-token');
    assert.equal(token.email, 'user@example.com');
    assert.ok(token.expiresAt > Date.now() && token.expiresAt <= Date.now() + 3600000);
});

test('missing Google library and popup failures are shown explicitly', async () => {
    const harness = createHarness();
    harness.context.window.google = undefined;
    await harness.context.signInWith('google');
    assert.match(harness.messages.at(-1).message, /could not load/);

    const popup = createHarness();
    await popup.context.signInWith('google');
    popup.options.error_callback({ type: 'popup_failed_to_open' });
    assert.match(popup.messages.at(-1).message, /blocked/);
    assert.equal(popup.hidden, 1);
});

test('denied permissions or missing profile email do not create a session', async () => {
    const harness = createHarness();
    await harness.context.signInWith('google');
    await harness.options.callback({ error: 'access_denied' });
    assert.equal(harness.messages.at(-1).message, 'access_denied');
    harness.context.fetchProfile = async () => ({ id: 'user', email: '' });
    await harness.options.callback(tokenResponse);
    assert.match(harness.messages.at(-1).message, /email address/);
    assert.deepEqual(harness.sessions, []);
});

test('cancelled and superseded Google requests cannot complete sign-in', async () => {
    const harness = createHarness();
    await harness.context.signInWith('google');
    const oldCallback = harness.options.callback;
    await harness.context.signInWith('google');
    await oldCallback(tokenResponse);
    assert.deepEqual(harness.profiles, []);

    harness.context.fetchProfile = async () => {
        harness.context.googleSignInRequest++;
        return { id: 'user', email: 'user@example.com' };
    };
    await harness.options.callback(tokenResponse);
    assert.deepEqual(harness.sessions, []);
    assert.equal(harness.storedTokens.size, 0);
});

test('Gmail permission and valid token expiry are required before storing a token', async () => {
    const harness = createHarness();
    await harness.context.signInWith('google');
    await harness.options.callback({ ...tokenResponse, scope: 'openid email profile' });
    assert.match(harness.messages.at(-1).message, /permission was not granted/);
    await harness.options.callback({ ...tokenResponse, expires_in: undefined });
    assert.match(harness.messages.at(-1).message, /invalid token expiration/);
    assert.equal(harness.storedTokens.size, 0);
    assert.deepEqual(harness.sessions, []);
});

test('restoring a Google login without a current-tab Gmail token stays on login for reconnection', async () => {
    const start = page.indexOf('  (async function boot()');
    const end = page.indexOf('  })();', start) + '  })();'.length;
    assert.ok(start >= 0 && end > start);
    for (const token of [null, { accessToken: 'expired', email: 'user@example.com', expiresAt: 1 }]) {
        let cleared = false;
        let redirected = false;
        const messages = [];
        const user = { id: 'user', email: 'user@example.com', provider: 'google' };
        const context = vm.createContext({
            location: { protocol: 'https:' },
            window: {},
            renderSetup() {}, setMode() {},
            handleCallbackIfPresent: async () => false,
            getSession: () => ({ email: user.email, userId: user.id, provider: user.provider, at: Date.now() }),
            getUsers: () => ({ user }),
            GOOGLE_TOKEN_KEY: 'oauth_google_token_v1',
            sessionStorage: { getItem: () => JSON.stringify(token) },
            readJSON: JSON.parse,
            clearSession() { cleared = true; },
            renderApp() { redirected = true; },
            showMsg: message => messages.push(message)
        });
        await vm.runInContext(page.slice(start, end), context);
        assert.equal(cleared, true);
        assert.equal(redirected, false);
        assert.match(messages[0], /Sign in with Google again/);
    }
});
