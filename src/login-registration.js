import express from 'express';
import { sendResendMail } from './resend/resendmail.js';

function getAdminEmail() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  if (!adminEmail || adminEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(adminEmail)) {
    throw new Error('Set ADMIN_EMAIL to a valid request recipient.');
  }
  return adminEmail;
}

export function createLoginRegistrationRouter(
  registryUrl = 'https://ct81.github.io/trimble-claude-mcp/pages/login/registered.json',
  sendMail = sendResendMail
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

  router.post('/demo-request', async (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const solution = typeof req.body.solution === 'string' ? req.body.solution.trim() : '';
    const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
    if (!name || name.length > 200 || /[\r\n]/.test(name)) {
      return res.status(400).json({ error: 'Enter your name (up to 200 characters, on one line).' });
    }
    if (!solution || solution.length > 200 || /[\r\n]/.test(solution)) {
      return res.status(400).json({ error: 'Choose a valid solution.' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ error: 'Keep your message to 5000 characters or fewer.' });
    }
    try {
      await sendMail({
        to: getAdminEmail(),
        subject: `Demo request: ${solution}`,
        text: `A user requested a demo.\n\nName: ${name}\nEmail: ${req.body.email}\nSolution: ${solution}\n\nMessage:\n${message || '(none)'}`
      });
      res.set('Cache-Control', 'no-store').json({ sent: true });
    } catch (error) {
      console.error('Could not send demo request:', error);
      res.status(502).json({ error: 'Could not send your demo request. Please try again later.' });
    }
  });

  router.post('/signup', async (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    if (!name || name.length > 200 || /[\r\n]/.test(name)) {
      return res.status(400).json({ error: 'Enter your full name (up to 200 characters, on one line).' });
    }
    try {
      await sendMail({
        to: getAdminEmail(),
        subject: 'New account request',
        text: `A user requested an account.\n\nFull name: ${name}\nEmail: ${req.body.email}`
      });
      res.set('Cache-Control', 'no-store').json({ sent: true });
    } catch (error) {
      console.error('Could not send account request:', error);
      res.status(502).json({ error: 'Could not send your account request. Please try again later.' });
    }
  });
  return router;
}
