import { Router } from "express";
import { statements } from "../db.js";

export const alertsRouter = Router();

alertsRouter.get("/", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const alerts = statements.listAlerts.all({ limit, offset });
  res.json({ alerts, total: statements.countAll.get().count });
});

alertsRouter.get("/:id", (req, res) => {
  const alert = statements.getAlert.get(req.params.id);
  if (!alert) return res.status(404).json({ error: "not found" });
  res.json({ alert });
});
