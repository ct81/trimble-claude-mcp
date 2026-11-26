import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import cors from 'cors';
import express from 'express';
import test from 'node:test';
import { createLoginRegistrationRouter } from '../src/login-registration.js';

  test('signup emails the administrator with validated name and email and surfaces Resend failure', async t => {
    const previousAdminEmail = process.env.ADMIN_EMAIL;
    process.env.ADMIN_EMAIL = 'admin@example.com';
    t.after(() => {
      if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = previousAdminEmail;
    });
    const messages = [];
    let fail = false;
    const app = express();
    app.use('/api/login', createLoginRegistrationRouter(undefined, async message => {
      if (fail) throw new Error('Resend unavailable');
      messages.push(message);
      return { id: 'test-email-id' };
    }));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    }));
    const signup = async body => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/login/signup`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      return { status: response.status, data: await response.json() };
    };
    const accepted = await signup({ name: ' Test User ', email: ' USER@example.com ' });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.data.sent, true);
    assert.deepEqual(messages, [{
      to: 'admin@example.com', subject: 'New account request',
      text: 'A user requested an account.\n\nFull name: Test User\nEmail: user@example.com'
    }]);
    for (const body of [
      { name: '', email: 'user@example.com' },
      { name: 'Test\nUser', email: 'user@example.com' },
      { name: 'User', email: 'not-email' }
    ]) assert.equal((await signup(body)).status, 400);
    assert.equal(messages.length, 1);
    fail = true;
    const rejected = await signup({ name: 'User', email: 'user@example.com' });
    assert.equal(rejected.status, 502);
    assert.equal(rejected.data.sent, undefined);
    fail = false;
    delete process.env.ADMIN_EMAIL;
    assert.equal((await signup({ name: 'User', email: 'user@example.com' })).status, 502);
    assert.equal(messages.length, 1);
  });

  test('demo requests email the administrator and reject invalid fields or delivery failures', async t => {
    const previousAdminEmail = process.env.ADMIN_EMAIL;
    process.env.ADMIN_EMAIL = 'admin@example.com';
    t.after(() => {
      if (previousAdminEmail === undefined) delete process.env.ADMIN_EMAIL;
      else process.env.ADMIN_EMAIL = previousAdminEmail;
    });
    const messages = [];
    let fail = false;
    const app = express();
    app.use('/api/login', createLoginRegistrationRouter(undefined, async message => {
      if (fail) throw new Error('Resend unavailable');
      messages.push(message);
      return { id: 'test-email-id' };
    }));
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    }));
    const request = async body => {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/login/demo-request`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      return { status: response.status, data: await response.json() };
    };
    const accepted = await request({
      name: ' Test User ', email: ' USER@example.com ', solution: ' SitePulse ', message: ' Please contact me. '
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.data.sent, true);
    assert.deepEqual(messages, [{
      to: 'admin@example.com', subject: 'Demo request: SitePulse',
      text: 'A user requested a demo.\n\nName: Test User\nEmail: user@example.com\nSolution: SitePulse\n\nMessage:\nPlease contact me.'
    }]);
    for (const body of [
      { name: '', email: 'user@example.com', solution: 'SitePulse' },
      { name: 'Test\nUser', email: 'user@example.com', solution: 'SitePulse' },
      { name: 'User', email: 'user@example.com', solution: 'SitePulse\nOther' },
      { name: 'User', email: 'user@example.com', solution: 'SitePulse', message: 'x'.repeat(5001) },
      { name: 'User', email: 'not-email', solution: 'SitePulse' }
    ]) assert.equal((await request(body)).status, 400);
    assert.equal(messages.length, 1);
    fail = true;
    const rejected = await request({ name: 'User', email: 'user@example.com', solution: 'SitePulse' });
    assert.equal(rejected.status, 502);
    assert.equal(rejected.data.sent, undefined);
    fail = false;
    delete process.env.ADMIN_EMAIL;
    assert.equal((await request({ name: 'User', email: 'user@example.com', solution: 'SitePulse' })).status, 502);
    assert.equal(messages.length, 1);
  });

  test('login API preflight allows GitHub Pages and preserves other route CORS policy', async t => {
    const source = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
    const start = source.indexOf('const openCors =');
    const end = source.indexOf("app.get('/home.html'", start);
    assert.ok(start >= 0 && end > start);
    const app = express();
    vm.runInNewContext(source.slice(start, end), { app, cors, config: { extensionOrigin: 'http://localhost:5000' } });
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    t.after(() => new Promise(resolve => {
      server.close(resolve);
      server.closeAllConnections();
    }));
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const origin of ['https://ct81.github.io', 'http://localhost:5000']) {
      const response = await fetch(base + '/api/login/signup', {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }
      });
      assert.equal(response.status, 204);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
      assert.match(response.headers.get('access-control-allow-headers'), /content-type/i);
    }
    const other = await fetch(base + '/other', { method: 'OPTIONS', headers: { Origin: 'https://ct81.github.io' } });
    assert.equal(other.headers.get('access-control-allow-origin'), 'http://localhost:5000');
  });
test('registration checks the published registry without adding emails and surfaces upstream failures', async t => {
  const registry = { projects: [
    { projectName: 'SitePulse', projectId: 'one', registeredEmails: ['First@Example.com'] },
    { projectName: 'OfficePulse', projectId: 'two', registeredEmails: [] }
  ] };
  let upstreamStatus = 200;
  let upstreamBody = registry;
  let reads = 0;
  const upstream = express();
  upstream.get('/registered.json', (_req, res) => {
    reads++;
    res.status(upstreamStatus).json(upstreamBody);
  });
  const registryServer = upstream.listen(0, '127.0.0.1');
  await once(registryServer, 'listening');
  t.after(() => new Promise(resolve => {
    registryServer.close(resolve);
    registryServer.closeAllConnections();
  }));
  const app = express();
  app.use('/api/login', createLoginRegistrationRouter(
    `http://127.0.0.1:${registryServer.address().port}/registered.json`
  ));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const request = async (endpoint, email) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/login/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email })
    });
    return { status: response.status, data: await response.json() };
  };
  const register = email => request('register', email);

  const original = JSON.stringify(registry);
  assert.equal((await register(' first@example.com ')).data.alreadyRegistered, true);
  assert.equal((await register('FIRST@example.com')).data.alreadyRegistered, true);
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await register('missing@example.com');
    assert.equal(result.status, 200);
    assert.equal(result.data.alreadyRegistered, false);
  }
  assert.equal(JSON.stringify(registry), original);
  const before = reads;
  assert.equal((await register('not-email')).status, 400);
  assert.equal(reads, before);
  upstreamStatus = 404;
  assert.equal((await register('first@example.com')).status, 502);
  upstreamStatus = 200;
  upstreamBody = { projects: [{ projectName: 'Broken' }] };
  const malformed = await register('first@example.com');
  assert.equal(malformed.status, 502);
  assert.match(malformed.data.error, /Could not read/);
  assert.equal(malformed.data.alreadyRegistered, undefined);
});
