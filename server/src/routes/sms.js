import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { smsStatus, smsConfigured, sendSms, setSmsEnabled } from "../lib/smsNotifier.js";

export const smsRouter = Router();

// Setup summary for the UI. Never includes the API key or the phone numbers.
smsRouter.get("/", requireAuth, (req, res) => {
  res.json(smsStatus());
});

// Turns automatic SMS alerts on or off (the switch in the settings panel). Admin only.
smsRouter.post("/enabled", requireAuth, (req, res) => {
  if (typeof req.body?.enabled !== "boolean") {
    return res.status(400).json({ error: "body must be { \"enabled\": true or false }" });
  }
  setSmsEnabled(req.body.enabled);
  res.json(smsStatus());
});

// Sends a test message to the configured recipients so setup can be checked without
// waiting for a real alert. Admin only; counts towards the daily limit.
smsRouter.post("/test", requireAuth, async (req, res) => {
  if (!smsConfigured()) {
    return res.status(400).json({ error: "SMS is not configured: set TEXTBEE_API_KEY and SMS_RECIPIENTS in server/.env and restart" });
  }
  const status = smsStatus();
  if (status.sentToday + status.recipients > status.dailyLimit) {
    return res.status(429).json({ error: `daily SMS limit reached (${status.sentToday}/${status.dailyLimit})` });
  }
  const result = await sendSms("VIGILANT test message: SMS alerts are working.");
  if (!result.ok) {
    return res.status(502).json({ error: `textbee: ${result.status || "could not connect"} ${result.detail}` });
  }
  res.json({ ok: true, recipients: status.recipients, detail: result.detail });
});
