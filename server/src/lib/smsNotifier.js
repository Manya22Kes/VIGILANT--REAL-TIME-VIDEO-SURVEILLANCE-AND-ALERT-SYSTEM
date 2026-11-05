import { config } from "../config.js";
import { statements } from "../db.js";

// Sends an SMS through textbee.dev when an alert is raised.
//
// Design rules:
//  - Never slow down or break detection: notifyAlert() is fire-and-forget and swallows errors.
//  - Protect the free plan (50 SMS/day, 300/month, one per recipient): only alerts at or above
//    SMS_MIN_SEVERITY and of an allowed type are sent, at most one per alert type per
//    SMS_COOLDOWN_SECONDS, and never more than SMS_DAILY_LIMIT messages a day.
//  - Messages are plain ASCII under 160 characters so each one is a single SMS segment.

const SEVERITY_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3 };
const RETRY_AFTER_FAILURE_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;
const E164 = /^\+[1-9]\d{6,14}$/;

const sms = config.sms;
const recipients = sms.recipients.filter((n) => E164.test(n));
const rejectedRecipients = sms.recipients.filter((n) => !E164.test(n));

// On/off switch controlled from the UI (admin). Saved in the settings table so it survives
// restarts. With nothing saved yet it is on, so an existing setup keeps working.
const ENABLED_KEY = "sms_enabled";
let enabled = loadEnabled();

function loadEnabled() {
  try {
    const row = statements.getSetting.get(ENABLED_KEY);
    return row ? row.value !== "false" : true;
  } catch {
    return true;
  }
}

export function setSmsEnabled(value) {
  enabled = Boolean(value);
  statements.setSetting.run({ key: ENABLED_KEY, value: String(enabled) });
  return enabled;
}

const lastSentAt = new Map(); // alert type -> ms timestamp of last (attempted) send
let sentDay = localDay();
let sentToday = 0; // SMS messages counted today (one per recipient); resets at local midnight

function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function rollDay() {
  const today = localDay();
  if (today !== sentDay) {
    sentDay = today;
    sentToday = 0;
  }
}

const mask = (n) => (n.length <= 6 ? "***" : `${n.slice(0, 3)}${"*".repeat(n.length - 6)}${n.slice(-3)}`);

export function smsConfigured() {
  return Boolean(sms.apiKey) && recipients.length > 0;
}

export function smsStatus() {
  rollDay();
  return {
    configured: smsConfigured(),
    enabled,
    recipients: recipients.length,
    minSeverity: sms.minSeverity,
    alertTypes: sms.alertTypes,
    cooldownSeconds: sms.cooldownSeconds,
    sentToday,
    dailyLimit: sms.dailyLimit,
  };
}

export function formatAlertMessage(alert) {
  const time = new Date(alert.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const conf = `${Math.round(alert.confidence * 100)}%`;
  let what;
  if (alert.type === "weapon") what = `Weapon detected (${conf})`;
  else if (alert.type === "crowd") what = `Crowd: ${alert.num_detections} people in view`;
  else what = `Person in restricted zone, ${alert.num_detections} detected, ${Math.round(alert.time_in_zone)}s (${conf})`;
  return `VIGILANT ${alert.severity} alert: ${what} at ${time}.`;
}

// Calls the TextBee API. Resolves to { ok, status, detail } and never throws.
export async function sendSms(message) {
  if (!smsConfigured()) return { ok: false, status: 0, detail: "SMS is not configured" };
  const body = { recipients, message };
  if (sms.deviceId) body.deviceId = sms.deviceId;
  try {
    const res = await fetch(`${sms.baseUrl}/gateway/send-sms`, {
      method: "POST",
      headers: { "x-api-key": sms.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.ok) {
      sentToday += recipients.length;
      return { ok: true, status: res.status, detail: "accepted by textbee (delivery needs the phone online)" };
    }
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.message || j?.error || JSON.stringify(j);
    } catch {
      detail = res.statusText;
    }
    return { ok: false, status: res.status, detail: String(detail).slice(0, 200) };
  } catch (err) {
    return { ok: false, status: 0, detail: err.name === "TimeoutError" ? "textbee did not answer in time" : err.message };
  }
}

// Called for every alert that was just logged. Decides whether to text it.
export function notifyAlert(alert) {
  try {
    if (!smsConfigured() || !enabled) return;
    if ((SEVERITY_RANK[alert.severity] ?? 0) < (SEVERITY_RANK[sms.minSeverity] ?? SEVERITY_RANK.HIGH)) return;
    if (!sms.alertTypes.includes(alert.type)) return;

    rollDay();
    const now = Date.now();
    if (now - (lastSentAt.get(alert.type) ?? 0) < sms.cooldownSeconds * 1000) return;
    if (sentToday + recipients.length > sms.dailyLimit) {
      console.warn(`[sms] daily limit reached (${sentToday}/${sms.dailyLimit}); not texting ${alert.type} alert #${alert.id}`);
      return;
    }

    // Reserve the cooldown before the (slow) request so frames that arrive meanwhile don't send again.
    lastSentAt.set(alert.type, now);
    sendSms(formatAlertMessage(alert)).then((r) => {
      if (r.ok) {
        console.log(`[sms] ${alert.type} alert #${alert.id} sent to ${recipients.length} recipient(s)`);
      } else {
        console.warn(`[sms] ${alert.type} alert #${alert.id} NOT sent: ${r.status || "error"} ${r.detail}`);
        // Allow a retry soon after a failure, except when textbee says a plan limit was hit.
        if (r.status !== 429) lastSentAt.set(alert.type, Date.now() - Math.max(0, sms.cooldownSeconds * 1000 - RETRY_AFTER_FAILURE_MS));
      }
    });
  } catch (err) {
    console.warn(`[sms] unexpected error: ${err.message}`);
  }
}

// Startup summary (never prints the API key or full numbers).
if (smsConfigured()) {
  console.log(
    `SMS alerts ${enabled ? "ON" : "SWITCHED OFF (UI switch)"} via textbee.dev -> ${recipients.map(mask).join(", ")} | types: ${sms.alertTypes.join("/")} | min severity: ${sms.minSeverity} | cooldown ${sms.cooldownSeconds}s | daily cap ${sms.dailyLimit}`,
  );
} else if (sms.apiKey || sms.recipients.length) {
  console.warn("SMS alerts are OFF: set both TEXTBEE_API_KEY and at least one valid SMS_RECIPIENTS number.");
}
if (rejectedRecipients.length) {
  console.warn(`SMS_RECIPIENTS ignored (use international format like +919876543210): ${rejectedRecipients.map(mask).join(", ")}`);
}
if (!(sms.minSeverity in SEVERITY_RANK)) {
  console.warn(`SMS_MIN_SEVERITY "${sms.minSeverity}" is not LOW, MEDIUM or HIGH; using HIGH.`);
}
