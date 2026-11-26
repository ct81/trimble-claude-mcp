import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const page = readFileSync(new URL('../pages/landing/buildtheimpossible.html', import.meta.url), 'utf8');
const start = page.indexOf("$('f').onsubmit=async e=>{");
const end = page.indexOf('\n};\nshow(0', start);
assert.ok(start >= 0 && end > start);
const handler = page.slice(start, end + 3);

test('landing page inline scripts parse', () => {
  for (const [, attributes, source] of page.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc=/.test(attributes) && !/type=["']application\/json/i.test(attributes)) {
      assert.doesNotThrow(() => new vm.Script(source));
    }
  }
});

test('demo form submits to the server and reports success or delivery errors', async () => {
  for (const outcome of ['success', 'failure']) {
    const button = { disabled: false, textContent: 'Send request' };
    const status = {
      textContent: '',
      classes: new Set(),
      classList: {
        add(name) { status.classes.add(name); },
        remove(name) { status.classes.delete(name); }
      }
    };
    const form = { onsubmit: null };
    let submitted;
    const context = {
      DEMO_REQUEST_API: 'https://trimble-claude-mcp-g86i.onrender.com/api/login/demo-request',
      FormData: class {
        get(key) {
          return { name: 'Test User', email: 'user@example.com', sol: 'SitePulse', msg: 'Please contact me.' }[key];
        }
      },
      $: id => ({ f: form, sendRequest: button, formStatus: status })[id],
      fetch: async (url, options) => {
        assert.equal(url, context.DEMO_REQUEST_API);
        submitted = JSON.parse(options.body);
        return {
          ok: outcome === 'success',
          json: async () => outcome === 'success'
            ? { sent: true }
            : { error: 'Could not send your demo request. Please try again later.' }
        };
      }
    };
    vm.runInNewContext(handler, context);
    await form.onsubmit({ preventDefault() {} });
    assert.deepEqual(submitted, {
      name: 'Test User', email: 'user@example.com', solution: 'SitePulse', message: 'Please contact me.'
    });
    if (outcome === 'success') {
      assert.equal(button.disabled, true);
      assert.equal(button.textContent, 'Request sent');
      assert.equal(status.textContent, 'Your demo request has been sent.');
    } else {
      assert.equal(button.disabled, false);
      assert.equal(button.textContent, 'Send request');
      assert.match(status.textContent, /Could not send your demo request/);
      assert.equal(status.classes.has('error'), true);
    }
  }
});
