
import express from "express";
import crypto from "node:crypto";
import { sendResendMail } from "../resend/resendmail.js";

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
const MAX_LINE_IMAGE_BYTES = 20 * 1024 * 1024;
const issueMenus = new Map();
const ISSUE_MENU_TTL_MS = 10 * 60 * 1000;
const MAX_ISSUE_MENUS = 1000;

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

async function getLineImageAttachment(messageId) {
    if (!LINE_CHANNEL_ACCESS_TOKEN || !messageId) {
        throw new Error("LINE access token or message ID is missing.");
    }

    const response = await fetch(
        `https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`,
        {
            headers: { "Authorization": `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
            signal: AbortSignal.timeout(15000)
        }
    );
    if (!response.ok) {
        throw new Error(`LINE image download failed (HTTP ${response.status}).`);
    }
    if (Number(response.headers.get("content-length")) > MAX_LINE_IMAGE_BYTES) {
        await response.body?.cancel();
        throw new Error("LINE image exceeds the 20 MB attachment limit.");
    }
    if (!response.body) {
        throw new Error("LINE image download returned an empty body.");
    }

    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of response.body) {
        totalBytes += chunk.length;
        if (totalBytes > MAX_LINE_IMAGE_BYTES) {
            throw new Error("LINE image exceeds the 20 MB attachment limit.");
        }
        chunks.push(chunk);
    }
    if (!totalBytes) {
        throw new Error("LINE image download returned an empty body.");
    }

    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp" };
    const extension = extensions[contentType] || "bin";
    return {
        filename: `line-image.${extension}`,
        content: Buffer.concat(chunks).toString("base64"),
        content_type: extensions[contentType] ? contentType : "application/octet-stream"
    };
}

async function sendLineMessageEmail(incoming) {

    if (
        !process.env.RESEND_API_KEY ||
        !process.env.RESEND_FROM_EMAIL ||
        !process.env.NOTIFICATION_EMAIL
    ) {
        console.warn("Email notification not configured: set RESEND_API_KEY, RESEND_FROM_EMAIL, and NOTIFICATION_EMAIL.");
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

    let attachments;
    let imageError;
    if (incoming.messageType === "image") {
        try {
            attachments = [await getLineImageAttachment(incoming.messageId)];
        } catch (error) {
            imageError = error.message;
            console.error("LINE image download failed:", imageError);
        }
    }

    const mailOptions = {

        to: process.env.NOTIFICATION_EMAIL,

        subject: "New LINE Message - ChesBot",

        text: imageError ? `${emailContent}\nImage attachment unavailable: ${imageError}` : emailContent,

        attachments
    };

    await sendResendMail(mailOptions);

    console.log("LINE notification email accepted by Resend.");
}

// =====================================================
// 6. SEND REPLY TO LINE
// =====================================================

async function replyToLine(replyToken, message, quickReply) {

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
                    text: String(message).slice(0, 5000),
                    ...(quickReply && { quickReply })
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

            const source = event.source || {};
            const menuKey = JSON.stringify([source.type, source.groupId || source.roomId || null, source.userId || null]);
            const text = typeof incoming.messageText === "string" ? incoming.messageText.trim().toLowerCase() : "";
            const state = issueMenus.get(menuKey);
            const activeState = state?.expiresAt > Date.now() ? state.stage : null;

            if (text === "trimble log issue") {
                issueMenus.delete(menuKey);
                if (issueMenus.size >= MAX_ISSUE_MENUS) issueMenus.delete(issueMenus.keys().next().value);
                issueMenus.set(menuKey, { stage: "menu", expiresAt: Date.now() + ISSUE_MENU_TTL_MS });
                if (event.replyToken) {
                    await replyToLine(event.replyToken, "Please choose an option:", {
                        items: [
                            { type: "action", action: { type: "message", label: "1. Log an issue", text: "Log an issue" } },
                            { type: "action", action: { type: "message", label: "2. Maybe later", text: "Maybe later" } }
                        ]
                    });
                }
                continue;
            }

            if (text === "maybe later" || (activeState === "menu" && (text === "2" || text === "2. maybe later"))) {
                issueMenus.delete(menuKey);
                if (event.replyToken) await replyToLine(event.replyToken, "Okay, maybe later.");
                continue;
            }

            if (activeState === "menu" && (text === "log an issue" || text === "1" || text === "1. log an issue")) {
                issueMenus.set(menuKey, { stage: "issue", expiresAt: Date.now() + ISSUE_MENU_TTL_MS });
                if (event.replyToken) await replyToLine(event.replyToken, "Please send the issue details or an image.");
                continue;
            }

            if (activeState !== "issue") {
                issueMenus.delete(menuKey);
                continue;
            }
            issueMenus.delete(menuKey);

            // STEP 2: Send email notification

            void sendLineMessageEmail(incoming).catch(emailError => {
                console.error(
                    "Email notification failed:",
                    emailError.message
                );
            });

            // STEP 3: Process text messages only

            if (event.message?.type !== "text") {
                if (event.replyToken) await replyToLine(event.replyToken, "Your issue message has been received.");
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

export default router;
