import { Router } from "express";
import { config } from "../config.js";

export const systemRouter = Router();

systemRouter.get("/", async (req, res) => {
  let inferenceStatus = { reachable: false, model_source: null, weapon_model: null };
  try {
    const r = await fetch(`${config.inferenceServiceUrl}/health`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      const data = await r.json();
      inferenceStatus = { reachable: true, model_source: data.model_source, weapon_model: data.weapon_model ?? null };
    }
  } catch {
    // inference service unreachable - reported as-is below
  }

  res.json({
    server: "ok",
    inference: inferenceStatus,
  });
});
