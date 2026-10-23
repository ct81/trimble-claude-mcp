export async function sendWhatsAppMessage({ chatId, chatid, phoneNumber, message }) {
  if (
    !process.env.GREEN_API_URL ||
    !process.env.GREEN_API_INSTANCE_ID ||
    !process.env.GREEN_API_TOKEN
  ) {
    console.error("[GREEN-API] configuration missing", {
      hasUrl: Boolean(process.env.GREEN_API_URL),
      hasInstanceId: Boolean(process.env.GREEN_API_INSTANCE_ID),
      hasToken: Boolean(process.env.GREEN_API_TOKEN)
    });
    throw new Error("GREEN-API configuration is missing");
  }

  const target = String(chatId ?? chatid ?? "").trim(); //120363404024548828@g.us
  const digits = String(phoneNumber ?? "").replace(/\D/g, "");
  const resolvedChatId = target || (digits ? `${digits}@c.us` : "");
  if (!resolvedChatId || !String(message ?? "").trim()) {
    console.error("[GREEN-API] invalid request", {
      hasChatId: Boolean(resolvedChatId),
      hasMessage: Boolean(String(message ?? "").trim())
    });
    const error = new Error("chatId (or phoneNumber) and message are required");
    error.statusCode = 400;
    throw error;
  }

  const endpoint =
    `${process.env.GREEN_API_URL.replace(/\/$/, "")}` +
    `/waInstance${process.env.GREEN_API_INSTANCE_ID}` +
    `/sendMessage/${process.env.GREEN_API_TOKEN}`;

  console.log("[GREEN-API] sending", {
    instanceId: process.env.GREEN_API_INSTANCE_ID,
    chatId: resolvedChatId,
    source: target ? "chatId" : "phoneNumber",
    messageLength: String(message).length
  });

  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chatId: resolvedChatId,
      message
    })
    });
  } catch (error) {
    console.error("[GREEN-API] network error", error.message);
    throw error;
  }

  const raw = await response.text();
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    result = { raw };
  }

  console.log("[GREEN-API] response", {
    status: response.status,
    ms: Date.now() - startedAt,
    body: result
  });

  if (!response.ok) {
    throw new Error(
      `GREEN-API error: ${JSON.stringify(result)}`
    );
  }

  return result;
}

