
const express = require("express");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

const router = express.Router();

// =====================================================
// 1. LINE CONFIGURATION
// =====================================================

const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
const LINE_CHANNEL_ACCESS_TOKEN =
    process.env.LINE_CHANNEL_ACCESS_TOKEN;

const LINE_REPLY_API =
    "https://api.line.me/v2/bot/message/reply";

// =====================================================
// 2. EMAIL CONFIGURATION
// =====================================================

const emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,

    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// =====================================================
// 3. VERIFY LINE WEBHOOK SIGNATURE
// =====================================================

function verifyLineSignature(rawBody, signature) {

    if (
        !LINE_CHANNEL_SECRET ||
        !signature ||
        !Buffer.isBuffer(rawBody)
    ) {
        return false;
    }

    const hash = crypto
        .createHmac("sha256", LINE_CHANNEL_SECRET)
        .update(rawBody)
        .digest("base64");

    const received = Buffer.from(signature, "utf8");
    const expected = Buffer.from(hash, "utf8");

    return (
        received.length === expected.length &&
        crypto.timingSafeEqual(received, expected)
    );
}

// =====================================================
// 4. CAPTURE INCOMING LINE MESSAGE
// =====================================================

async function saveIncomingMessage(event) {

    const message = event.message || {};
    const source = event.source || {};

    const incoming = {

        platform: "LINE",

        channelId: LINE_CHANNEL_ID,

        userId: source.userId || "Unknown",

        groupId: source.groupId || null,

        roomId: source.roomId || null,

        sourceType: source.type || "Unknown",

        messageId: message.id || null,

        messageType: message.type || "Unknown",

        messageText: message.text || null,

        timestamp: event.timestamp
            ? new Date(event.timestamp)
            : new Date(),

        receivedAt: new Date()
    };

    console.log("================================");
    console.log("NEW LINE MESSAGE");
    console.log(incoming);
    console.log("================================");

    // TODO:
    // Save incoming object into MSSQL / Firebase.

    return incoming;
}

// =====================================================
// 5. SEND EMAIL NOTIFICATION
// =====================================================

async function sendLineMessageEmail(incoming) {

    if (
        !process.env.SMTP_USER ||
        !process.env.SMTP_PASS ||
        !process.env.NOTIFICATION_EMAIL
    ) {
        console.warn("Email notification not configured.");
        return;
    }

    const messageText =
        incoming.messageText ||
        `[${incoming.messageType} message]`;

    const emailContent = `
NEW LINE MESSAGE RECEIVED
=========================

Platform: LINE

User ID:
${incoming.userId}

Source Type:
${incoming.sourceType}

Message ID:
${incoming.messageId || "Unknown"}

Message Type:
${incoming.messageType}

Message:
${messageText}

Received At:
${incoming.timestamp.toLocaleString("en-SG", {
    timeZone: "Asia/Singapore"
})}

=========================
RoachHarbor LINE Notification
`;

    const mailOptions = {

        from: process.env.SMTP_USER,

        to: process.env.NOTIFICATION_EMAIL,

        subject: "New LINE Message - ChesBot",

        text: emailContent
    };

    await emailTransporter.sendMail(mailOptions);

    console.log("LINE notification email sent successfully.");
}

// =====================================================
// 6. SEND REPLY TO LINE
// =====================================================

async function replyToLine(replyToken, message) {

    if (!LINE_CHANNEL_ACCESS_TOKEN) {
        throw new Error("LINE access token is missing.");
    }

    const response = await fetch(LINE_REPLY_API, {

        method: "POST",

        headers: {

            "Content-Type": "application/json",

            "Authorization":
                `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`
        },

        body: JSON.stringify({

            replyToken,

            messages: [
                {
                    type: "text",
                    text: String(message).slice(0, 5000)
                }
            ]
        })
    });

    const result = await response.text();

    if (!response.ok) {

        throw new Error(
            `LINE Reply API error ${response.status}: ${result}`
        );
    }

    console.log("LINE reply sent successfully.");

    return result;
}

// =====================================================
// 7. ROACHHARBOR AI PROCESSOR
// =====================================================

async function processRoachHarborMessage(text, userId) {

    console.log("Processing LINE message with AI.");

    console.log("User ID:", userId);

    console.log("Message:", text);

    // TEMPORARY TEST RESPONSE
    //
    // Replace this section with your existing
    // Claude AI / RoachHarbor MCP processing function.

    return `Hello! Welcome to ChesBot.

Your message:
${text}

Your message has been received successfully.

RoachHarbor AI integration is ready.`;
}

// =====================================================
// 8. PROCESS INCOMING EVENTS
// =====================================================

async function processEvents(events) {

    for (const event of events) {

        try {

            if (event.type !== "message") {
                continue;
            }

            // STEP 1: Capture message

            const incoming =
                await saveIncomingMessage(event);

            // STEP 2: Send email notification

            try {

                await sendLineMessageEmail(incoming);

            } catch (emailError) {

                console.error(
                    "Email notification failed:",
                    emailError.message
                );

                // Continue chatbot processing
            }

            // STEP 3: Process text messages only

            if (event.message?.type !== "text") {
                continue;
            }

            // STEP 4: Process through AI

            const aiResponse =
                await processRoachHarborMessage(
                    incoming.messageText,
                    incoming.userId
                );

            // STEP 5: Reply to LINE

            if (event.replyToken) {

                await replyToLine(
                    event.replyToken,
                    aiResponse
                );
            }

        } catch (error) {

            console.error(
                "LINE event processing error:",
                error.message
            );
        }
    }
}

// =====================================================
// 9. LINE WEBHOOK
// POST /api/line/webhook
// =====================================================

router.post(
    "/webhook",

    express.raw({
        type: "application/json"
    }),

    (req, res) => {

        try {

            const signature =
                req.get("x-line-signature");

            const rawBody = req.body;

            // Verify original LINE request

            if (
                !verifyLineSignature(rawBody, signature)
            ) {

                console.warn(
                    "Invalid LINE webhook signature."
                );

                return res
                    .status(401)
                    .send("Invalid signature");
            }

            // Parse JSON after verification

            const body = JSON.parse(
                rawBody.toString("utf8")
            );

            const events = body.events || [];

            console.log(
                `LINE webhook received: ${events.length} event(s)`
            );

            // Respond to LINE immediately

            res.status(200).send("OK");

            // Process messages asynchronously

            if (events.length > 0) {

                setImmediate(() => {

                    processEvents(events).catch(error => {

                        console.error(
                            "LINE background processing error:",
                            error
                        );

                    });

                });
            }

        } catch (error) {

            console.error(
                "LINE webhook error:",
                error.message
            );

            if (!res.headersSent) {

                res.status(400).send("Bad request");

            }
        }
    }
);

// =====================================================
// 10. EXPORT
// =====================================================

module.exports = router;
