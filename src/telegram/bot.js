import crypto from 'node:crypto';
import { config } from '../config.js';
import { askClaude } from '../claude/client.js';
import { getSessionEmail } from '../session-store.js';
import { definitions, callTool } from '../mcp/tools.js';
import { sendTelegramMessage } from '../others/telegramAPI.js';

const MAX_HISTORY = 20;
const MAX_TOOL_ROUNDS = 6;
const HISTORY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_TOOL_RESULT_CHARS = 12000;
const LOGIN_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_PUBLIC_BASE_URL = 'https://trimble-claude-mcp-g86i.onrender.com';
const READ_ONLY_TOOLS = new Set(['get_projects', 'get_project', 'search_project']);
const SYSTEM_PROMPT = `You are a Telegram assistant for a steel/precast construction company.
Answer customer questions briefly and politely. For quotation requests, collect the customer name, project, scope/quantities, and required date, then call request_quotation. Never invent prices.
Use Trimble Connect tools to look up project and element status when appropriate. Element lifecycle stages are FABRICATED -> STORAGE YARD -> IN TRANSIT -> DELIVERED -> INSTALLED.
Only report status data returned by tools. Never reveal internal IDs, tokens, or data about projects the customer did not ask about. Keep replies concise and suitable for Telegram.`;

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
    description: 'Submit a quotation request after collecting the customer details.',
    input_schema: {
      type: 'object',
      properties: {
        customerName: { type: 'string' },
        projectName: { type: 'string' },
        scope: { type: 'string' },
        requiredDate: { type: 'string' }
      },
      required: ['customerName', 'scope']
    }
  }
];

const conversations = new Map();
const seenMessageIds = new Set();
const telegramSessions = new Map();
const loginEncryptionKey = crypto.createHash('sha256').update(config.sessionSecret).digest();

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
  while (messages.length && !(messages[0].role === 'user' && typeof messages[0].content === 'string')) {
    messages.shift();
  }
}

export function createTelegramLoginToken(chatId) {
  if (typeof chatId !== 'string' || !/^\d{1,20}$/.test(chatId)) {
    throw new Error('A valid direct Telegram chat is required for sign-in.');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', loginEncryptionKey, iv);
  const payload = Buffer.from(JSON.stringify({
    chatId,
    expiresAt: Date.now() + LOGIN_TTL_MS
  }));
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

export function consumeTelegramLoginToken(token) {
  if (typeof token !== 'string' || !token || token.length > 1024) return undefined;
  try {
    const packed = Buffer.from(token, 'base64url');
    if (packed.length < 29 || packed.toString('base64url') !== token) return undefined;
    const decipher = crypto.createDecipheriv('aes-256-gcm', loginEncryptionKey, packed.subarray(0, 12));
    decipher.setAuthTag(packed.subarray(12, 28));
    const plaintext = Buffer.concat([
      decipher.update(packed.subarray(28)),
      decipher.final()
    ]);
    const payload = JSON.parse(plaintext.toString('utf8'));
    if (
      typeof payload.chatId !== 'string' ||
      !/^\d{1,20}$/.test(payload.chatId) ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= Date.now()
    ) return undefined;
    return payload.chatId;
  } catch {
    return undefined;
  }
}

export function setTelegramSessionId(chatId, sessionId) {
  telegramSessions.set(chatId, sessionId);
}

function telegramLoginUrl(chatId) {
  const baseUrl = (process.env.PUBLIC_BASE_URL || DEFAULT_PUBLIC_BASE_URL).replace(/\/$/, '');
  const token = createTelegramLoginToken(chatId);
  return `${baseUrl}/oauth/telegram/login?token=${encodeURIComponent(token)}`;
}

function authenticationRequiredMessage(chatId) {
  return (
    "I can't access Trimble Connect because sign-in is required. " +
    `Sign in here: ${telegramLoginUrl(chatId)}\n` +
    'After signing in, send your request again. This link expires in 24 hours and is linked to this Telegram chat.'
  );
}

function extractText(messageData) {
  return (
    messageData?.textMessageData?.textMessage ||
    messageData?.extendedTextMessageData?.text ||
    ''
  ).trim();
}

function serializeResult(result) {
  const text = typeof result === 'string' ? result : JSON.stringify(result);
  return text.length > MAX_TOOL_RESULT_CHARS
    ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}…[truncated]`
    : text;
}

async function runTool(name, input, chatId) {
  if (name === 'request_quotation') {
    const reference = `Q-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const salesChat = process.env.TELEGRAM_SALES_CHAT_ID;
    console.log('[TELEGRAM-BOT] quotation request', {
      email: getSessionEmail(telegramSessions.get(chatId)) || 'not signed in',
      reference,
      ...input
    });
    if (salesChat) {
      await sendTelegramMessage({
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
  const sessionId = telegramSessions.get(chatId);
  if (!sessionId) {
    throw Object.assign(
      new Error('Trimble Connect sign-in is required for this Telegram chat.'),
      { code: 'TRIMBLE_AUTH_REQUIRED' }
    );
  }
  return callTool(sessionId, name, input);
}

export async function generateTelegramReply(chatId, userText) {
  const history = getHistory(chatId);
  history.updatedAt = Date.now();
  history.messages.push({ role: 'user', content: userText });
  trimHistory(history.messages);
  const messages = [...history.messages];
  let finalText = '';
  let authenticationRequired = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    //const response = await askClaude(messages, BOT_TOOLS, SYSTEM_PROMPT);
    const claudeStartedAt = Date.now();

    console.log("[TELEGRAM-CLAUDE] request started", {
      chatId,
      historyMessages: messages.length,
      availableTools: BOT_TOOLS.map((tool) => tool.name),
      round: round + 1
    });

    let response;

    try {
      response = await askClaude(
        messages,
        BOT_TOOLS,
        SYSTEM_PROMPT
      );

      console.log("[TELEGRAM-CLAUDE] response received", {
        chatId,
        stopReason: response?.stop_reason || null,
        contentBlocks: response?.content?.length || 0,
        toolCalls:
          response?.content?.filter(
            (block) => block.type === "tool_use"
          ).length || 0,
        elapsedMs: Date.now() - claudeStartedAt
      });
    } catch (error) {
      console.error("[TELEGRAM-CLAUDE] request failed", {
        chatId,
        errorName: error?.name || "Error",
        errorMessage: error?.message || String(error),
        elapsedMs: Date.now() - claudeStartedAt
      });

      throw error;
    }

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
      const email = getSessionEmail(telegramSessions.get(chatId)) || 'not signed in';
      console.log('[TELEGRAM-BOT] tool call', { email, tool: use.name, input: use.input });
      try {
        const result = await runTool(use.name, use.input || {}, chatId);
        console.log("[TELEGRAM-MCP] tool completed", {
                    chatId,
                    tool: use.name,
                    success: true
                  });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: serializeResult(result)
        });
      } catch (error) {
        //console.error('[TELEGRAM-BOT] tool failed:', { email, tool: use.name, error: error.message });
        console.error("[TELEGRAM-MCP] tool failed", {
                      chatId,
                      tool: use.name,
                      errorName: error?.name || "Error",
                      errorMessage: error?.message || String(error),
                      code: error?.code || null
                    });
        if (error.code === 'TRIMBLE_AUTH_REQUIRED') {
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

export function verifyTelegramWebhook(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_TOKEN;
  if (!expected) return false;
  const provided = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// export async function handleTelegramIncomingWebhook(payload) {
//   try {
//     if (payload?.typeWebhook !== 'incomingMessageReceived') return;
//     const chatId = String(payload.senderData?.chatId || '');
//     const chatType = String(payload.senderData?.chatType || '').toLowerCase();
//     const text = extractText(payload.messageData);
//     if (!/^\d{1,20}$/.test(chatId) || !text || chatType === 'group' || chatType === 'supergroup') return;

//     const messageId = payload.idMessage;
//     if (messageId) {
//       if (seenMessageIds.has(messageId)) return;
//       seenMessageIds.add(messageId);
//       if (seenMessageIds.size > 1000) seenMessageIds.delete(seenMessageIds.values().next().value);
//     }

//     const email = getSessionEmail(telegramSessions.get(chatId)) || 'not signed in';
//     console.log('[TELEGRAM-BOT] incoming', { chatId, email, length: text.length });
//     const reply = await generateTelegramReply(chatId, text);
//     await sendTelegramMessage({ chatId, message: reply });
//   } catch (error) {
//     console.error('[TELEGRAM-BOT] failed to handle message:', error.message);
//   }
// }
export async function handleTelegramIncomingWebhook(payload) {
  const startedAt = Date.now();
  let chatId = "";
  let messageId = "";

  console.log("[TELEGRAM-WEBHOOK] handler started", {
    receivedAt: new Date().toISOString(),
    payloadType: typeof payload,
    payloadKeys:
      payload && typeof payload === "object"
        ? Object.keys(payload)
        : [],
    typeWebhook: payload?.typeWebhook || null,
    hasSenderData: Boolean(payload?.senderData),
    hasMessageData: Boolean(payload?.messageData)
  });

  try {
    // 1. Validate webhook event
    if (payload?.typeWebhook !== "incomingMessageReceived") {
      console.warn("[TELEGRAM-WEBHOOK] ignored: unexpected event type", {
        typeWebhook: payload?.typeWebhook || null,
        availableKeys:
          payload && typeof payload === "object"
            ? Object.keys(payload)
            : []
      });
      return;
    }

    // 2. Extract incoming message
    chatId = String(payload.senderData?.chatId || "");
    messageId = String(payload.idMessage || "");

    const chatType = String(
      payload.senderData?.chatType || "unknown"
    ).toLowerCase();

    const text = extractText(payload.messageData);

    console.log("[TELEGRAM-WEBHOOK] message parsed", {
      hasChatId: Boolean(chatId),
      validNumericChatId: /^\d{1,20}$/.test(chatId),
      chatType,
      hasText: Boolean(text),
      textLength: text.length,
      hasMessageId: Boolean(messageId),
      messageDataType: payload.messageData?.typeMessage || null
    });

    // 3. Validate recipient and message
    if (!/^\d{1,20}$/.test(chatId)) {
      console.warn("[TELEGRAM-WEBHOOK] ignored: invalid chat ID", {
        chatIdPresent: Boolean(chatId),
        chatIdLength: chatId.length
      });
      return;
    }

    if (!text) {
      console.warn("[TELEGRAM-WEBHOOK] ignored: message text is empty");
      return;
    }

    if (chatType === "group" || chatType === "supergroup") {
      console.warn("[TELEGRAM-WEBHOOK] ignored: group messages are disabled", {
        chatType
      });
      return;
    }

    // 4. Ignore duplicate events
    if (messageId) {
      if (seenMessageIds.has(messageId)) {
        console.warn("[TELEGRAM-WEBHOOK] ignored: duplicate message", {
          messageId
        });
        return;
      }

      seenMessageIds.add(messageId);

      if (seenMessageIds.size > 1000) {
        seenMessageIds.delete(
          seenMessageIds.values().next().value
        );
      }
    }

    const email =
      getSessionEmail(telegramSessions.get(chatId)) ||
      "not signed in";

    console.log("[TELEGRAM-BOT] incoming message accepted", {
      chatId,
      messageId: messageId || null,
      email,
      textLength: text.length
    });

    // 5. Invoke Claude and MCP workflow
    console.log("[TELEGRAM-BOT] generating reply");

    const reply = await generateTelegramReply(chatId, text);

    console.log("[TELEGRAM-BOT] reply generated", {
      replyLength: reply.length,
      elapsedMs: Date.now() - startedAt
    });

    // 6. Send reply to Telegram
    console.log("[TELEGRAM-BOT] sending reply", {
      chatId,
      replyLength: reply.length
    });

    const sendResult = await sendTelegramMessage({
      chatId,
      message: reply
    });

    console.log("[TELEGRAM-BOT] reply sent successfully", {
      chatId,
      messageId: sendResult?.idMessage || null,
      elapsedMs: Date.now() - startedAt
    });

  } catch (error) {
    console.error("[TELEGRAM-BOT] message processing failed", {
      chatId: chatId || null,
      messageId: messageId || null,
      errorName: error?.name || "Error",
      errorMessage: error?.message || String(error),
      stack: error?.stack || null,
      elapsedMs: Date.now() - startedAt
    });
  }
}