import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config.js";

export const authRouter = Router();

// Hashed once at startup so the plaintext ADMIN_PASSWORD is never compared directly.
const adminPasswordHash = config.adminPassword ? bcrypt.hashSync(config.adminPassword, 10) : null;

authRouter.post("/login", (req, res) => {
  const { password } = req.body || {};

  if (typeof password !== "string" || !password) {
    return res.status(400).json({ error: "password is required" });
  }
  if (!adminPasswordHash) {
    return res.status(500).json({ error: "ADMIN_PASSWORD is not configured on the server" });
  }
  if (!bcrypt.compareSync(password, adminPasswordHash)) {
    return res.status(401).json({ error: "incorrect password" });
  }

  const token = jwt.sign({ role: "admin" }, config.jwtSecret, { expiresIn: "24h" });
  res.json({ token });
});
