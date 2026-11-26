import express from 'express';
import { randomUUID } from 'node:crypto';
import { readFile, rename, unlink, writeFile } from 'node:fs/promises';

export function createLoginRegistrationRouter(registryPath) {
  const router = express.Router();
  let pendingWrite = Promise.resolve();

  async function readRegistry() {
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    if (!Array.isArray(registry?.projects) || !registry.projects.length ||
        registry.projects.some(project => !project || typeof project.projectName !== 'string' ||
          !project.projectName.trim() || !Array.isArray(project.registeredEmails) ||
          project.registeredEmails.some(value => typeof value !== 'string'))) {
      throw new Error('Registration registry has an invalid project format.');
    }
    return registry;
  }

  router.use(express.json({ limit: '8kb' }));
  router.use((req, res, next) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }
    req.body.email = email;
    next();
  });

  router.post('/status', async (req, res) => {
    try {
      const registry = await readRegistry();
      const registered = registry.projects.some(project =>
        project.registeredEmails.some(email => email.trim().toLowerCase() === req.body.email));
      res.json({ registered });
    } catch (error) {
      console.error('Could not check project registration:', error);
      res.status(500).json({ error: 'Could not check your registration. Please try again.' });
    }
  });

  router.post('/register', async (req, res) => {
    const email = req.body.email;
    const registration = pendingWrite.then(async () => {
      const registry = await readRegistry();
      let added = 0;
      for (const project of registry.projects) {
        if (!project.registeredEmails.some(value => value.trim().toLowerCase() === email)) {
          project.registeredEmails.push(email);
          added++;
        }
      }
      if (!added) return { alreadyRegistered: true, message: 'You have registered.' };

      const temporaryPath = `${registryPath}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporaryPath, JSON.stringify(registry, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        await rename(temporaryPath, registryPath);
      } finally {
        try {
          await unlink(temporaryPath);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      return { alreadyRegistered: false, message: 'Registered in all projects.' };
    });
    pendingWrite = registration.then(() => undefined, () => undefined);
    try {
      res.json(await registration);
    } catch (error) {
      console.error('Could not save project registration:', error);
      res.status(500).json({ error: 'Could not save your registration. Please try again.' });
    }
  });
  return router;
}
