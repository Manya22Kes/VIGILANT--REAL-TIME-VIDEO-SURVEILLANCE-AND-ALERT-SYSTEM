"""
VIGILANT inference service.

A thin wrapper around the trained YOLOv8 model. Does exactly one job:
receive an image, return bounding boxes for detected people. All product
logic (zone checks, severity, alerts, storage) lives in the Node backend.

Run: uvicorn main:app --host 0.0.0.0 --port 8001
"""
import os
import io
import logging
import urllib.request

import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.responses import JSONResponse
from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vigilant-inference")

# Look for the real trained weights first. If MODEL_DOWNLOAD_URL is set
# (a GitHub Release asset, Hugging Face file, etc.) and the weights aren't
# present locally, download and cache them. Otherwise fall back to the
# generic pretrained YOLOv8n so the service still works either way.
CUSTOM_MODEL_PATH = os.environ.get("MODEL_PATH", os.path.join(os.path.dirname(__file__), "models", "best.pt"))
MODEL_DOWNLOAD_URL = os.environ.get("MODEL_DOWNLOAD_URL")
FALLBACK_MODEL = "yolov8n.pt"
PERSON_CLASS_ID = 0

app = FastAPI(title="VIGILANT Inference Service")

_model = None
_model_source = None


def _download_model(url: str, dest_path: str):
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    tmp_path = dest_path + ".partial"
    logger.info(f"Downloading model weights from {url}")
    urllib.request.urlretrieve(url, tmp_path)
    os.replace(tmp_path, dest_path)
    logger.info(f"Saved model weights to {dest_path}")


def get_model():
    global _model, _model_source
    if _model is not None:
        return _model

    from ultralytics import YOLO

    if not os.path.exists(CUSTOM_MODEL_PATH) and MODEL_DOWNLOAD_URL:
        try:
            _download_model(MODEL_DOWNLOAD_URL, CUSTOM_MODEL_PATH)
        except Exception as exc:
            logger.error(f"Model download failed ({exc}); will fall back to pretrained")

    if os.path.exists(CUSTOM_MODEL_PATH):
        logger.info(f"Loading custom trained model from {CUSTOM_MODEL_PATH}")
        _model = YOLO(CUSTOM_MODEL_PATH)
        _model_source = "custom"
    else:
        logger.warning(
            f"No custom model found at {CUSTOM_MODEL_PATH} and no working MODEL_DOWNLOAD_URL. "
            f"Falling back to generic pretrained {FALLBACK_MODEL}."
        )
        _model = YOLO(FALLBACK_MODEL)
        _model_source = "fallback_pretrained"
    return _model


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_source": _model_source or "not_loaded_yet",
        "model_path_checked": CUSTOM_MODEL_PATH,
    }


@app.post("/detect")
async def detect(
    file: UploadFile = File(...),
    confidence: float = Query(0.5, ge=0.0, le=1.0),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        raw = await file.read()
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not decode image: {exc}")

    model = get_model()
    frame = np.array(image)  # RGB, HxWx3

    results = model(frame, conf=confidence, classes=[PERSON_CLASS_ID], verbose=False)
    result = results[0]

    detections = []
    for box in result.boxes:
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        detections.append({
            "confidence": round(float(box.conf[0].item()), 4),
            "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
        })

    return JSONResponse({
        "detections": detections,
        "count": len(detections),
        "image_width": image.width,
        "image_height": image.height,
        "model_source": _model_source,
    })
