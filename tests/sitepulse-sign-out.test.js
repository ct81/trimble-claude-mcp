import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('SitePulse sign-out clears login state and redirects to its login page', () => {
    const page = readFileSync(new URL('../pages/sitepulse/sitepulse.html', import.meta.url), 'utf8');
    assert.match(page, /<span>Alex Chen<\/span>\s*<button type="button" id="btn-sign-out">Sign out<\/button>/);
    const script = page.match(/<script id="sign-out-script">([\s\S]*?)<\/script>/);
    assert.ok(script);
    const local = new Map([['oauth_demo_session_v1', 'session'], ['oauth_demo_users_v1', 'accounts']]);
    const session = new Map([
        ['oauth_google_token_v1', 'google'], ['oauth_outlook_token_v1', 'outlook'],
        ['oauth_pending_v1', 'pending'], ['username', 'name'], ['unrelated', 'keep']
    ]);
    let click;
    let destination;
    vm.runInNewContext(script[1], {
        document: { getElementById: () => ({ addEventListener: (_event, handler) => { click = handler; } }) },
        localStorage: { removeItem: key => local.delete(key) },
        sessionStorage: { removeItem: key => session.delete(key) },
        location: { replace: url => { destination = url; } }
    });
    click();
    assert.equal(local.has('oauth_demo_session_v1'), false);
    assert.equal(local.get('oauth_demo_users_v1'), 'accounts');
    assert.deepEqual([...session.keys()], ['unrelated']);
    assert.equal(destination, './login.html');
});
