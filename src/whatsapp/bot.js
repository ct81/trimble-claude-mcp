import crypto from 'node:crypto';
import { askClaude } from '../claude/client.js';
import { sendWhatsAppMessage } from '../others/greenAPI.js';
import { definitions, callTool } from '../mcp/tools.js';
import { getLatestSessionId } from '../session-store.js';

const MAX_HISTORY = 20;
const MAX_TOOL_ROUNDS = 6;
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TOOL_RESULT_CHARS = 12000;

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

function resolveTrimbleSessionId() {
  return (
    process.env.WHATSAPP_TRIMBLE_SESSION_ID ||
    getLatestSessionId((data) => Boolean(data?.trimble?.access_token))
  );
}

let lastLoginAlertAt = 0;
const LOGIN_ALERT_INTERVAL_MS = 30 * 60 * 1000;

// The login link goes to staff only: whoever signs in becomes the Trimble account used for all customers.
async function notifyStaffToLogin() {
  const staffChat = process.env.WHATSAPP_SALES_CHAT_ID;
  if (!staffChat || Date.now() - lastLoginAlertAt < LOGIN_ALERT_INTERVAL_MS) return;
  lastLoginAlertAt = Date.now();
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  try {
    await sendWhatsAppMessage({
      chatId: staffChat,
      message:
        'WhatsApp bot: Trimble Connect is not connected. Open this link in a normal browser and sign in:\n' +
        `${base}/oauth/login`
    });
  } catch (error) {
    console.error('[WHATSAPP-BOT] failed to send login alert:', error.message);
  }
}

async function runTool(name, input) {
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
  const sessionId = resolveTrimbleSessionId();
  if (!sessionId) {
    await notifyStaffToLogin();
    throw new Error('Trimble Connect is not connected. A staff member must sign in first.');
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
        const result = await runTool(use.name, use.input || {});
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: serializeResult(result)
        });
      } catch (error) {
        console.error('[WHATSAPP-BOT] tool failed:', use.name, error.message);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          is_error: true,
          content: error.message
        });
      }
    }
    messages.push({ role: 'user', content: toolResults });
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
