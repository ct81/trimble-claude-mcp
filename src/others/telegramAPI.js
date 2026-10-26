export async function sendTelegramMessage({
  chatId,
  chatid,
  message
}) {
  if (
    !process.env.GREEN_API_URL ||
    !process.env.GREEN_API_TELEGRAM_INSTANCE_ID ||
    !process.env.GREEN_API_TELEGRAM_TOKEN
  ) {
    throw new Error("GREEN-API configuration is missing");
  }

  const resolvedChatId = String(
    chatId ?? chatid ?? ""
  ).trim();

  const text = String(message ?? "").trim();

  if (!resolvedChatId || !text) {
    const error = new Error(
      "chatId and message are required"
    );
    error.statusCode = 400;
    throw error;
  }

  const baseUrl = process.env.GREEN_API_URL.replace(
    /\/+$/,
    ""
  );

  const endpoint =
    `${baseUrl}/waInstance` +
    `${process.env.GREEN_API_TELEGRAM_INSTANCE_ID}` +
    `/sendMessage/${process.env.GREEN_API_TELEGRAM_TOKEN}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chatId: resolvedChatId,
      message: text
    })
  });

  const raw = await response.text();

  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    result = { raw };
  }

  if (!response.ok) {
    throw new Error(
      `GREEN-API Telegram error: ${JSON.stringify(result)}`
    );
  }

  return result;
}