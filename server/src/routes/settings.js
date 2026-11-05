import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getSettings, updateSettings, settingLimits } from "../lib/liveSettings.js";

export const settingsRouter = Router();

// Reading is public (like the zone), so the live feed can show current values.
settingsRouter.get("/", (req, res) => {
  res.json({ settings: getSettings(), limits: settingLimits() });
});

// Writing needs the admin token (like reconfiguring the zone).
settingsRouter.post("/", requireAuth, (req, res) => {
  const result = updateSettings(req.body);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ settings: result.settings, limits: settingLimits() });
});
