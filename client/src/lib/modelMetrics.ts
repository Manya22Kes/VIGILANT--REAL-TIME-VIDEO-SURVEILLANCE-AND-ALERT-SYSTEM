// Real metrics from the trained YOLOv8s model (50 epochs) - shared so the
// landing page and Model Stats tab never drift out of sync or invent numbers.
export const MODEL_METRICS = {
  map50: "78.85%",
  map50_95: "52.02%",
  precision: "79.98%",
  recall: "71.36%",
};

export const MODEL_VALIDATION_NOTE =
  "Validation set (1,206 images): 88.18% precision, 64.06% recall, 82.31% average IoU. " +
  "Test set (750 images): 91.44% precision, 67.28% recall, 82.98% average IoU.";
