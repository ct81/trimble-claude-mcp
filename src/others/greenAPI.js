export async function sendWhatsAppMessage(phoneNumber, message) {
  if (
    !process.env.GREEN_API_URL ||
    !process.env.GREEN_API_INSTANCE_ID ||
    !process.env.GREEN_API_TOKEN
  ) {
    throw new Error("GREEN-API configuration is missing");
  }

  const digits = String(phoneNumber ?? "").replace(/\D/g, "");
  if (!digits || !String(message ?? "").trim()) {
    const error = new Error("phoneNumber and message are required");
    error.statusCode = 400;
    throw error;
  }

  const chatId = `${digits}@c.us`;

  const endpoint =
    `${process.env.GREEN_API_URL.replace(/\/$/, "")}` +
    `/waInstance${process.env.GREEN_API_INSTANCE_ID}` +
    `/sendMessage/${process.env.GREEN_API_TOKEN}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chatId,
      message
    })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      `GREEN-API error: ${JSON.stringify(result)}`
    );
  }

  return result;
}

