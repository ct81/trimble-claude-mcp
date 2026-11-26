import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const page = readFileSync(new URL('../pages/login/login.html', import.meta.url), 'utf8');
const start = page.indexOf('  async function handleSignup(');
const end = page.indexOf('  /* ═══════════════ RENDER', start);
assert.ok(start >= 0 && end > start);

test('signup sends only name and email, creates no session, and reports delivery failures', async () => {
  assert.doesNotMatch(page, /id="(?:loginForm|liPass|suPass|suPass2)"/);
  for (const outcome of ['success', 'unconfirmed', 'failure']) {
    const messages = [];
    let saved = false;
    let redirected = false;
    let submitted;
    let reset = false;
    const button = { disabled: false };
    const fields = {
      '#suName': { value: 'Test' }, '#suEmail': { value: ' TEST@example.com ' },
      '#signupForm': { querySelector: () => button, reset() { reset = true; } }
    };
    const context = vm.createContext({
      AbortSignal, $: id => fields[id], EMAIL_RE: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
      clearMsg() {},
      saveUsers() { saved = true; }, setSession() { saved = true; },
      renderApp() { redirected = true; }, setTimeout: callback => callback(),
      console: { error() {} }, showMsg: message => messages.push(message),
      fetch: async (url, options) => {
        assert.equal(url, 'https://trimble-claude-mcp-g86i.onrender.com/api/login/signup');
        assert.equal(saved, false);
        submitted = JSON.parse(options.body);
        return {
          ok: outcome !== 'failure', headers: { get: () => 'application/json' },
          json: async () => outcome === 'failure'
            ? { error: 'Could not send your account request.' }
            : { sent: outcome === 'success' }
        };
      }
    });
    vm.runInContext(page.slice(start, end), context);
    await context.handleSignup({ preventDefault() {} });
    assert.deepEqual(submitted, { email: 'test@example.com', name: 'Test' });
    assert.equal(saved, false);
    assert.equal(redirected, false);
    assert.equal(button.disabled, false);
    assert.equal(reset, outcome === 'success');
    if (outcome === 'success') assert.match(messages.at(-1), /sent.*approval/);
    if (outcome === 'unconfirmed') assert.match(messages.at(-1), /did not confirm/);
    if (outcome === 'failure') assert.match(messages.at(-1), /Could not send/);
  }
});
