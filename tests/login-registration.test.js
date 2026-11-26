import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import express from 'express';
import test from 'node:test';
import { createLoginRegistrationRouter } from '../src/login-registration.js';

test('registration fills missing projects, detects duplicates, and serializes concurrent saves', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'login-registration-'));
  t.after(() => rm(directory, { recursive: true }));
  const registryPath = path.join(directory, 'registered.json');
  await writeFile(registryPath, JSON.stringify({ projects: [
    { projectName: 'SitePulse', projectId: 'one', registeredEmails: ['First@Example.com'] },
    { projectName: 'OfficePulse', projectId: 'two', registeredEmails: [] }
  ] }));
  const app = express();
  app.use('/api/login', createLoginRegistrationRouter(registryPath));
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

  assert.equal((await register(' first@example.com ')).data.alreadyRegistered, false);
  assert.equal((await register('FIRST@example.com')).data.alreadyRegistered, true);
  const saved = JSON.parse(await readFile(registryPath, 'utf8'));
  assert.deepEqual(saved.projects[0].registeredEmails, ['First@Example.com']);
  assert.deepEqual(saved.projects[1].registeredEmails, ['first@example.com']);
  assert.equal(saved.projects[0].projectId, 'one');

  const results = await Promise.all([register('second@example.com'), register('third@example.com')]);
  assert.ok(results.every(result => result.status === 200));
  const concurrent = JSON.parse(await readFile(registryPath, 'utf8'));
  for (const project of concurrent.projects) {
    assert.ok(project.registeredEmails.includes('second@example.com'));
    assert.ok(project.registeredEmails.includes('third@example.com'));
  }
  const before = await readFile(registryPath, 'utf8');
  assert.equal((await register('not-email')).status, 400);
  assert.equal(await readFile(registryPath, 'utf8'), before);
});
