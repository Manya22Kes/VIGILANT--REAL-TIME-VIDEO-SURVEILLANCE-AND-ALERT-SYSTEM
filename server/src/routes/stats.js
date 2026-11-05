import { Router } from "express";
import { statements } from "../db.js";

export const statsRouter = Router();

statsRouter.get("/", (req, res) => {
  const total = statements.countAll.get().count;
  const bySeverity = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const row of statements.countBySeverity.all()) {
    bySeverity[row.severity] = row.count;
  }
  const byType = { zone_intrusion: 0, weapon: 0, crowd: 0 };
  for (const row of statements.countByType.all()) {
    byType[row.type] = row.count;
  }
  res.json({ total, bySeverity, byType });
});
