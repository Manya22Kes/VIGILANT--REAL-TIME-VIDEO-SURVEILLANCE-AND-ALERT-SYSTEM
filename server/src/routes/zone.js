import { Router } from "express";
import { statements } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const zoneRouter = Router();

zoneRouter.get("/", (req, res) => {
  const row = statements.getSetting.get("restricted_zone");
  res.json({ zone: JSON.parse(row.value) });
});

zoneRouter.post("/", requireAuth, (req, res) => {
  const { zone } = req.body;

  if (!Array.isArray(zone) || zone.length < 3) {
    return res.status(400).json({ error: "zone must be an array of at least 3 {x, y} points" });
  }
  for (const point of zone) {
    const { x, y } = point;
    if (typeof x !== "number" || typeof y !== "number" || x < 0 || x > 1 || y < 0 || y > 1) {
      return res.status(400).json({
        error: "each point must have numeric x, y between 0 and 1 (fraction of frame size)",
      });
    }
  }

  statements.setSetting.run({ key: "restricted_zone", value: JSON.stringify(zone) });
  res.json({ zone });
});
