import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const page = readFileSync(new URL('../pages/login/testmain.html', import.meta.url), 'utf8');
const script = page.match(/<script>([\s\S]*?)<\/script>/)[1];

function createHarness() {
    const token = { accessToken: 'test-token', expiresAt: Date.now() + 3600000, email: 'user@example.com' };
    const session = new Map([['oauth_google_token_v1', JSON.stringify(token)], ['oauth_pending_v1', '{}'],
        ['username', 'User'], ['unrelated', 'keep']]);
    const local = new Map([
        ['oauth_demo_session_v1', JSON.stringify({ email: token.email })],
        ['oauth_demo_users_v1', JSON.stringify({ user: { email: token.email, name: 'User' } })]
    ]);
    const storage = values => ({
        getItem: key => values.get(key) ?? null,
        removeItem: key => values.delete(key)
    });
    const elements = Object.fromEntries(['gmail-status', 'gmail-messages', 'read-gmail', 'userName', 'account-name', 'account-email'].map(id =>
        [id, { children: [], replaceChildren() { this.children = []; },
            appendChild(child) { this.children.push(child); }, addEventListener() {} }]));
    const calls = [];
    const logs = [];
    const context = vm.createContext({
        sessionStorage: storage(session), localStorage: storage(local),
        document: { getElementById: id => elements[id], createElement: () => ({}) },
        window: { location: { replace(url) { this.href = url; } } },
        console: { error() {}, log: (...args) => logs.push(args) },
        fetch: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, json: async () => url.includes('maxResults')
                ? { messages: [{ id: 'one' }] }
                : { payload: { headers: [{ name: 'Subject', value: '<b>Subject</b>' }, { name: 'From', value: 'Sender' }] } } };
        }
    });
    vm.runInContext(script, context);
    return { context, token, session, local, elements, calls, logs };
}

test('dashboard reads Gmail only on demand with a bearer token and renders text safely', async () => {
    const harness = createHarness();
    assert.equal(harness.calls.length, 0);
    await harness.context.readGmail();
    assert.equal(harness.calls.length, 2);
    assert.match(harness.calls[0].url, /maxResults=5&labelIds=INBOX/);
    assert.equal(harness.calls[0].options.headers.Authorization, 'Bearer test-token');
    assert.equal(harness.elements['gmail-messages'].children[0].textContent, '<b>Subject</b> — Sender');
    assert.equal(harness.elements['read-gmail'].disabled, false);
});

test('dashboard shows the signed-in name and email after the sign-out button', () => {
    const harness = createHarness();
    assert.equal(harness.elements['account-name'].textContent, 'User');
    assert.equal(harness.elements['account-email'].textContent, 'user@example.com');
    assert.match(page, /Sign Out<\/button>\s*<div class="navbar-user">/);
    assert.equal(harness.logs[0][1].email, 'user@example.com');
    assert.equal(harness.logs[1][1].accessToken, '[REDACTED]');
    assert.doesNotMatch(JSON.stringify(harness.logs), /test-token/);
});

test('expired and wrong-account tokens are removed without contacting Gmail', async () => {
    for (const change of [{ expiresAt: 1 }, { email: 'another@example.com' }]) {
        const harness = createHarness();
        harness.session.set('oauth_google_token_v1', JSON.stringify({ ...harness.token, ...change }));
        await harness.context.readGmail();
        assert.equal(harness.calls.length, 0);
        assert.equal(harness.session.has('oauth_google_token_v1'), false);
        assert.match(harness.elements['gmail-status'].textContent, /Sign in again/);
    }
});

test('Gmail rejection reports errors and sign-out clears login information but keeps saved accounts', async () => {
    const harness = createHarness();
    harness.context.fetch = async () => ({ ok: false, status: 401 });
    await harness.context.readGmail();
    assert.match(harness.elements['gmail-status'].textContent, /expired/);
    assert.equal(harness.session.has('oauth_google_token_v1'), false);
    harness.context.logout();
    assert.equal(harness.local.has('oauth_demo_session_v1'), false);
    assert.equal(harness.local.has('oauth_demo_users_v1'), true);
    assert.equal(harness.session.has('oauth_pending_v1'), false);
    assert.equal(harness.session.has('username'), false);
    assert.equal(harness.elements['account-name'].textContent, '');
    assert.equal(harness.elements['account-email'].textContent, '');
    assert.equal(harness.elements['gmail-status'].textContent, '');
    assert.equal(harness.session.get('unrelated'), 'keep');
    assert.equal(harness.context.window.location.href, 'login.html');
});
