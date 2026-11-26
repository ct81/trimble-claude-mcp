import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function harness(options = {}) {
    const page = readFileSync(new URL('../pages/sitepulse/sitepulse.html', import.meta.url), 'utf8');
    assert.match(page, /<span id="profile-name"><\/span>\s*<button type="button" id="btn-sign-out">Sign out<\/button>/);
    const script = page.match(/<script id="sign-out-script">([\s\S]*?)<\/script>/);
    assert.ok(script);
    const user = { id: 'user', email: 'user@example.com', provider: 'google', name: options.name ?? 'Alex Chen' };
    const accounts = JSON.stringify({ user });
    const local = new Map([['oauth_demo_session_v1', JSON.stringify({ userId: user.id, email: user.email, provider: user.provider, at: Date.now() })],
        ['oauth_demo_users_v1', accounts]]);
    const session = new Map([
        ['sitepulse_login_v1', JSON.stringify(user)],
        ['oauth_google_token_v1', JSON.stringify({ accessToken: 'test-token', email: user.email, expiresAt: Date.now() + 3600000 })],
        ['oauth_outlook_token_v1', 'outlook'],
        ['oauth_pending_v1', 'pending'], ['username', 'name'], ['unrelated', 'keep']
    ]);
    let click;
    let destination;
    const events = {};
    const body = { hidden: true };
    const elements = {
        'profile-name': {},
        'profile-avatar': {},
        'btn-sign-out': { addEventListener: (_event, handler) => { click = handler; } }
    };
    if (options.noSession) local.delete('oauth_demo_session_v1');
    if (options.noApproval) session.delete('sitepulse_login_v1');
    if (options.expired) session.set('oauth_google_token_v1', JSON.stringify({ accessToken: 'test', email: user.email, expiresAt: 1 }));
    if (options.malformed) local.set('oauth_demo_session_v1', '{broken');
    vm.runInNewContext(script[1], {
        document: { body, getElementById: id => elements[id] },
        window: { addEventListener: (event, handler) => { events[event] = handler; } },
        console: { error() {} },
        localStorage: { getItem: key => local.get(key) ?? null, removeItem: key => local.delete(key) },
        sessionStorage: { getItem: key => session.get(key) ?? null, removeItem: key => session.delete(key) },
        location: { replace: url => { destination = url; } }
    });
    return { local, session, accounts, body, events, elements, click, get destination() { return destination; } };
}

test('SitePulse displays the logged-in name and first/last initials', () => {
    for (const [name, displayName, initials] of [
        ['  Jane   Mary Doe  ', 'Jane   Mary Doe', 'JD'],
        ['Alex', 'Alex', 'A'],
        ['', 'user@example.com', 'U'],
        ['<b> Test', '<b> Test', '<T']
    ]) {
        const state = harness({ name });
        assert.equal(state.elements['profile-name'].textContent, displayName);
        assert.equal(state.elements['profile-avatar'].textContent, initials);
    }
});

test('SitePulse sign-out clears login state and redirects to its login page', () => {
    const state = harness();
    assert.equal(state.body.hidden, false);
    state.click();
    assert.equal(state.body.hidden, true);
    assert.equal(state.local.has('oauth_demo_session_v1'), false);
    assert.equal(state.local.get('oauth_demo_users_v1'), state.accounts);
    assert.deepEqual([...state.session.keys()], ['unrelated']);
    assert.equal(state.destination, './login.html');
});

test('SitePulse blocks absent login approval, expired tokens, and invalid sessions', () => {
    for (const options of [{ noSession: true }, { noApproval: true }, { expired: true }, { malformed: true }]) {
        const state = harness(options);
        assert.equal(state.body.hidden, true);
        assert.equal(state.destination, './login.html');
    }
});

test('SitePulse rechecks login on Back navigation and sign-out in another tab', () => {
    for (const event of ['pageshow', 'storage']) {
        const state = harness();
        state.local.delete('oauth_demo_session_v1');
        state.events[event]({ key: 'oauth_demo_session_v1' });
        assert.equal(state.body.hidden, true);
        assert.equal(state.destination, './login.html');
    }
});
