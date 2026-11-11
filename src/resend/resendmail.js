export async function sendResendMail({ to = process.env.NOTIFICATION_EMAIL, subject, text }) {
	const apiKey = process.env.RESEND_API_KEY;
	const from = process.env.RESEND_FROM_EMAIL;

	if (!apiKey || !from || !to) {
		throw new Error("Resend email not configured: set RESEND_API_KEY, RESEND_FROM_EMAIL, and NOTIFICATION_EMAIL (or pass to).");
	}
	if (typeof subject !== "string" || !subject.trim() || typeof text !== "string" || !text.trim()) {
		throw new Error("Email subject and text are required.");
	}

	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${apiKey}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify({ from, to, subject, text }),
		signal: AbortSignal.timeout(15000)
	});

	let result;
	try {
		result = await response.json();
	} catch {
		throw new Error(`Resend API returned an invalid response (HTTP ${response.status}).`);
	}
	if (!response.ok) {
		throw new Error(`Resend API error ${response.status}: ${result?.message || "Email delivery request failed"}`);
	}
	if (!result?.id) {
		throw new Error("Resend API response is missing the email ID.");
	}
	return result;
}
