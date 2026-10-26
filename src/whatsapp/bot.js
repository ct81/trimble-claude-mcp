import crypto from 'node:crypto';
import { askClaude } from '../claude/client.js';
import { sendWhatsAppMessage } from '../others/greenAPI.js';
import { definitions, callTool } from '../mcp/tools.js';

const MAX_HISTORY = 20;
const MAX_TOOL_ROUNDS = 6;
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TOOL_RESULT_CHARS = 12000;
const WHATSAPP_LOGIN_TTL_MS = 10 * 60 * 1000;
const MAX_WHATSAPP_LOGIN_TOKENS = 10000;
const DEFAULT_PUBLIC_BASE_URL = 'https://trimble-claude-mcp-g86i.onrender.com';

// Read-only Trimble Connect tools the bot may call.
const READ_ONLY_TOOLS = new Set(['get_projects', 'get_project', 'search_project']);

const SYSTEM_PROMPT = `You are the WhatsApp assistant for a steel/precast construction company.
You help customers with:
1. Customer service: answer general questions politely and briefly.
2. Quotations: collect name, project, scope/quantities and required date, then call request_quotation. Never invent prices.
3. Construction questions: use the Trimble Connect tools to look up project and element status.
Element lifecycle stages, in order: FABRICATED -> STORAGE YARD -> IN TRANSIT -> DELIVERED -> INSTALLED.
Only report status data returned by tools; if you cannot find it, say so and offer to forward to the team.
Never reveal internal IDs, tokens or data about projects the customer did not ask about.
Keep replies short and suited to WhatsApp (plain text, no markdown tables).`;

const BOT_TOOLS = [
  ...definitions
    .filter((tool) => READ_ONLY_TOOLS.has(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    })),
  {
    name: 'request_quotation',
    description:
      'Submit a quotation request to the sales team once the customer has provided the details.',
    input_schema: {
      type: 'object',
      properties: {
        customerName: { type: 'string' },
        projectName: { type: 'string' },
        scope: { type: 'string', description: 'Work scope, quantities, drawings.' },
        requiredDate: { type: 'string' }
      },
      required: ['customerName', 'scope']
    }
  }
];

const conversations = new Map();
const seenMessageIds = new Set();
const whatsappLoginTokens = new Map();
const whatsappSessions = new Map();

function getHistory(chatId) {
  const entry = conversations.get(chatId);
  if (!entry || Date.now() - entry.updatedAt > HISTORY_TTL_MS) {
    const fresh = { messages: [], updatedAt: Date.now() };
    conversations.set(chatId, fresh);
    return fresh;
  }
  return entry;
}

function trimHistory(messages) {
  while (messages.length > MAX_HISTORY) messages.shift();
  // History must start with a plain user message (not a tool_result).
  while (
    messages.length &&
    !(messages[0].role === 'user' && typeof messages[0].content === 'string')
  ) {
    messages.shift();
  }
}

export function createWhatsAppLoginToken(chatId) {
  if (
    typeof chatId !== 'string' ||
    !chatId ||
    chatId.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(chatId) ||
    chatId.endsWith('@g.us')
  ) {
    throw new Error('A valid direct WhatsApp chat is required for sign-in.');
  }

  const now = Date.now();
  for (const [token, entry] of whatsappLoginTokens) {
    if (entry.expiresAt <= now) whatsappLoginTokens.delete(token);
  }
  if (whatsappLoginTokens.size >= MAX_WHATSAPP_LOGIN_TOKENS) {
    throw new Error('Too many pending WhatsApp sign-ins. Try again later.');
  }

  const token = crypto.randomBytes(32).toString('base64url');
  whatsappLoginTokens.set(token, {
    chatId,
    expiresAt: now + WHATSAPP_LOGIN_TTL_MS
  });
  return token;
}

export function consumeWhatsAppLoginToken(token) {
  if (typeof token !== 'string' || !token) return undefined;
  const entry = whatsappLoginTokens.get(token);
  whatsappLoginTokens.delete(token);
  return entry?.expiresAt > Date.now() ? entry.chatId : undefined;
}

export function setWhatsAppSessionId(chatId, sessionId) {
  whatsappSessions.set(chatId, sessionId);
}

export function getWhatsAppSessionId(chatId) {
  return whatsappSessions.get(chatId);
}

function trimbleLoginUrl(chatId) {
  const baseUrl = (
    process.env.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL
  ).replace(/\/$/, '');
  const token = createWhatsAppLoginToken(chatId);
  return `${baseUrl}/oauth/whatsapp/login?token=${encodeURIComponent(token)}`;
}

function isTrimbleAuthenticationError(error) {
  return error?.statusCode === 401 ||
    /\bTrimble API 401\b|\bTrimble refresh failed\b|\bNo Trimble (?:access )?token\b|invalid_token|unauthorized/i
      .test(error?.message || '');
}

function authenticationRequiredMessage(chatId) {
  return (
    "I can't access Trimble Connect because sign-in is required. " +
    `Tap this link to sign in: ${trimbleLoginUrl(chatId)}\n` +
    'After signing in, send your request again. This sign-in is linked to this WhatsApp chat.'
  );
}

async function runTool(name, input, chatId) {
  if (name === 'request_quotation') {
    const reference = `Q-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const salesChat = process.env.WHATSAPP_SALES_CHAT_ID;
    console.log('[WHATSAPP-BOT] quotation request', { reference, ...input });
    if (salesChat) {
      await sendWhatsAppMessage({
        chatId: salesChat,
        message:
          `New quotation request ${reference}\n` +
          `Customer: ${input.customerName}\n` +
          `Project: ${input.projectName || '-'}\n` +
          `Scope: ${input.scope}\n` +
          `Required date: ${input.requiredDate || '-'}`
      });
    }
    return { success: true, reference };
  }

  if (!READ_ONLY_TOOLS.has(name)) throw new Error(`Tool not allowed: ${name}`);
  const sessionId = getWhatsAppSessionId(chatId);
  if (!sessionId) {
    throw Object.assign(
      new Error('Trimble Connect sign-in is required for this WhatsApp chat.'),
      { code: 'TRIMBLE_AUTH_REQUIRED' }
    );
  }
  return callTool(sessionId, name, input);
}

function serializeResult(result) {
  const text = typeof result === 'string' ? result : JSON.stringify(result);
  return text.length > MAX_TOOL_RESULT_CHARS
    ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}…[truncated]`
    : text;
}

export async function generateReply(chatId, userText) {
  const history = getHistory(chatId);
  history.updatedAt = Date.now();
  history.messages.push({ role: 'user', content: userText });
  trimHistory(history.messages);

  const messages = [...history.messages];
  let finalText = '';
  let authenticationRequired = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await askClaude(messages, BOT_TOOLS, SYSTEM_PROMPT);
    messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter((block) => block.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !toolUses.length) {
      finalText = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();
      break;
    }

    const toolResults = [];
    for (const use of toolUses) {
      console.log('[WHATSAPP-BOT] tool call', { tool: use.name, input: use.input });
      try {
        const result = await runTool(use.name, use.input || {}, chatId);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: serializeResult(result)
        });
      } catch (error) {
        console.error('[WHATSAPP-BOT] tool failed:', use.name, error.message);
        if (
          error.code === 'TRIMBLE_AUTH_REQUIRED' ||
          isTrimbleAuthenticationError(error)
        ) {
          authenticationRequired = true;
          finalText ||= authenticationRequiredMessage(chatId);
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          is_error: true,
          content: error.message
        });
      }
    }
    messages.push({ role: 'user', content: toolResults });
    if (authenticationRequired) break;
  }

  finalText ||= "Sorry, I couldn't complete that request. Our team will follow up with you.";
  history.messages.push({ role: 'assistant', content: finalText });
  trimHistory(history.messages);
  return finalText;
}

function extractText(messageData) {
  return (
    messageData?.textMessageData?.textMessage ||
    messageData?.extendedTextMessageData?.text ||
    ''
  ).trim();
}

export function verifyWebhook(req) {
  const expected = process.env.WHATSAPP_WEBHOOK_TOKEN;
  if (!expected) return false;
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Handles a GREEN-API webhook payload; never throws.
export async function handleIncomingWebhook(payload) {
  try {
    if (payload?.typeWebhook !== 'incomingMessageReceived') return;
    const chatId = payload.senderData?.chatId;
    const text = extractText(payload.messageData);
    if (!chatId || !text) return;
    // Ignore group chats; the bot serves direct customer conversations.
    if (chatId.endsWith('@g.us')) return;

    const messageId = payload.idMessage;
    if (messageId) {
      if (seenMessageIds.has(messageId)) return;
      seenMessageIds.add(messageId);
      if (seenMessageIds.size > 1000) seenMessageIds.delete(seenMessageIds.values().next().value);
    }

    console.log('[WHATSAPP-BOT] incoming', { chatId, length: text.length });
    const reply = await generateReply(chatId, text);
    await sendWhatsAppMessage({ chatId, message: reply });
  } catch (error) {
    console.error('[WHATSAPP-BOT] failed to handle message:', error.message);
  }
}
