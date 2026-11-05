// Real metrics from the trained YOLOv8s model (50 epochs) - shared so the
// landing page and Model Stats tab never drift out of sync or invent numbers.
export const MODEL_METRICS = {
  map50: "78.85%",
  map50_95: "52.02%",
  precision: "79.98%",
  recall: "71.36%",
};

// Custom evaluation from the ML pipeline's metrics file (yolov8s_50epochs_enhanced_metrics.json).
// Image counts are deliberately not stated here until the exact dataset split is confirmed.
export const MODEL_VALIDATION_NOTE =
  "Custom evaluation, validation split: 88.18% precision, 64.06% recall, 82.31% average IoU. " +
  "Held-out test split: 91.44% precision, 67.28% recall, 82.98% average IoU.";

// Baseline: the generic pretrained YOLOv8n (no fine-tuning), evaluated by the ML pipeline
// (pretrained_yolov8n_metrics.json). Note it is a smaller model (n) than the trained one (s).
export const BASELINE_METRICS = {
  map50: "72.80%",
  map50_95: "50.40%",
  precision: "76.70%",
  recall: "65.70%",
};
