import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import test from 'node:test';
import { createLoginRegistrationRouter } from '../src/login-registration.js';

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
