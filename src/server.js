import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { authorizationUrl, exchangeCode, requireSession } from './oauth/oauth.js';
import { handleMcp } from './mcp/http.js';

const app = express();
app.set('trust proxy', 1);
app.use(cors({origin: config.extensionOrigin === '*' ? true : config.extensionOrigin, credentials:true}));
app.use(express.json({limit:'2mb'}));
app.use(cookieParser());

app.get('/health', (_, res) => res.json({status:'ok',service:'trimble-connect-mcp'}));
app.get('/oauth/login', (_, res) => { try { res.redirect(authorizationUrl()); } catch (e) { res.status(500).json({error:e.message}); } });
app.get('/oauth/callback', async (req, res) => {
  try {
    const sessionId = await exchangeCode(req.query.code, req.query.state);
    res.cookie('mcp_session', sessionId, {httpOnly:true, secure:config.sessionSecret && config.extensionOrigin.startsWith('https://'), sameSite:'lax', maxAge:7*24*3600*1000});
    res.redirect('/auth/success');
  } catch (e) { res.status(400).send(`<h1>OAuth failed</h1><pre>${escapeHtml(e.message)}</pre>`); }
});
app.get('/auth/success', (_, res) => res.send('<h2>Trimble authentication successful.</h2><p>You can close this window and return to Claude.</p>'));
app.get('/auth/status', requireSession, (req,res) => res.json({authenticated:true}));
app.post('/mcp', requireSession, handleMcp);

app.listen(config.port, () => console.log(`Trimble Claude MCP listening on ${config.port}`));
function escapeHtml(s){return String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\\':'&#39;'}[c]));}
