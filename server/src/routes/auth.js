import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export const authRouter = Router();

// Hashed once at startup so the plaintext ADMIN_PASSWORD is never compared directly.
const adminPasswordHash = config.adminPassword ? bcrypt.hashSync(config.adminPassword, 10) : null;

// Basic brute-force protection: after 10 wrong passwords from one address, block that
// address for 15 minutes. Successful logins clear the count.
const MAX_FAILED_LOGINS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const failedLogins = new Map(); // ip -> { count, resetAt }

function isBlocked(ip) {
  const entry = failedLogins.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    failedLogins.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILED_LOGINS;
}

function recordFailure(ip) {
  const entry = failedLogins.get(ip);
  if (!entry || Date.now() > entry.resetAt) {
    failedLogins.set(ip, { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

authRouter.post("/login", (req, res) => {
  const { password } = req.body || {};

  if (isBlocked(req.ip)) {
    return res.status(429).json({ error: "too many failed attempts, try again later" });
  }

  if (typeof password !== "string" || !password) {
    return res.status(400).json({ error: "password is required" });
  }
  if (!adminPasswordHash) {
    return res.status(500).json({ error: "ADMIN_PASSWORD is not configured on the server" });
  }
  if (!bcrypt.compareSync(password, adminPasswordHash)) {
    recordFailure(req.ip);
    return res.status(401).json({ error: "incorrect password" });
  }
  failedLogins.delete(req.ip);

  const token = jwt.sign({ role: "admin" }, config.jwtSecret, { expiresIn: "24h" });
  res.json({ token });
});
