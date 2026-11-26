import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const page = readFileSync(new URL('../pages/login/login.html', import.meta.url), 'utf8');
const start = page.indexOf('  async function handleSignup(');
const end = page.indexOf('  async function handleLogin(', start);
assert.ok(start >= 0 && end > start);

test('signup waits for the published registry check and stops on duplicates or lookup failures', async () => {
  for (const outcome of ['success', 'duplicate', 'failure']) {
    const messages = [];
    let saved = false;
    let redirected = false;
    let submitted;
    const button = { disabled: false };
    const fields = {
      '#suName': { value: 'Test' }, '#suEmail': { value: ' TEST@example.com ' },
      '#suPass': { value: 'test-password' }, '#suPass2': { value: 'test-password' },
      '#signupForm': { querySelector: () => button }
    };
    const context = vm.createContext({
      $: id => fields[id], EMAIL_RE: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
      clearMsg() {}, getUsers: () => ({}), randHex: () => 'test-salt',
      hashPassword: async () => 'test-hash',
      saveUsers() { saved = true; }, setSession() {},
      renderApp() { redirected = true; }, setTimeout: callback => callback(),
      console: { error() {} }, showMsg: message => messages.push(message),
      fetch: async (url, options) => {
        assert.equal(url, 'https://trimble-claude-mcp-g86i.onrender.com/api/login/register');
        assert.equal(saved, false);
        submitted = JSON.parse(options.body);
        return {
          ok: outcome !== 'failure', headers: { get: () => 'application/json' },
          json: async () => outcome === 'failure'
            ? { error: 'Could not check your registration.' }
            : { alreadyRegistered: outcome === 'duplicate' }
        };
      }
    });
    vm.runInContext(page.slice(start, end), context);
    await context.handleSignup({ preventDefault() {} });
    assert.deepEqual(submitted, { email: 'test@example.com' });
    assert.equal(saved, outcome === 'success');
    assert.equal(redirected, outcome === 'success');
    assert.equal(button.disabled, false);
    if (outcome === 'duplicate') assert.match(messages.at(-1), /You have registered/);
    if (outcome === 'failure') assert.match(messages.at(-1), /Could not check/);
  }
});
