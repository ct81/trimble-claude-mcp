import express from 'express';
export function createLoginRegistrationRouter(
  registryUrl = 'https://ct81.github.io/trimble-claude-mcp/pages/login/registered.json'
) {
  const router = express.Router();

  async function readRegistry() {
    const response = await fetch(registryUrl, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new Error(`Published registration registry returned HTTP ${response.status}.`);
    const registry = await response.json();
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

  router.post('/register', async (req, res) => {
    const email = req.body.email;
    try {
      const registry = await readRegistry();
      const alreadyRegistered = registry.projects.some(project =>
        project.registeredEmails.some(value => value.trim().toLowerCase() === email));
      res.set('Cache-Control', 'no-store').json({
        alreadyRegistered,
        message: alreadyRegistered ? 'You have registered.' : 'Email is not registered.'
      });
    } catch (error) {
      console.error('Could not check published project registration:', error);
      res.status(502).json({ error: 'Could not read the published registration registry. Please try again.' });
    }
  });
  return router;
}
