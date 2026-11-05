"""
VIGILANT inference service.

A thin wrapper around trained YOLOv8 models. Does exactly one job:
receive an image, return labelled bounding boxes. All product logic
(zone checks, severity, alerts, storage) lives in the Node backend.

Two detectors:
  1. person model  (models/best.pt)              -> label "person"
  2. weapon model  (models/weapon_detection.pt)  -> label "weapon"   (optional)

If the weapon weights are not present the service still works and simply
returns person detections only; /health says so, so nothing is faked.

Run: uvicorn main:app --host 0.0.0.0 --port 8001
"""
import os
import io
import logging
import threading
import urllib.request

from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps

from dense import dense_people

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("vigilant-inference")

HERE = os.path.dirname(__file__)

# Dense-crowd counting: when the normal pass finds at least this many people, run the
# slower tiled pass (dense.py) to find more of them. Below it (small groups, the normal case),
# no extra time is spent.
DENSE_TRIGGER = int(os.environ.get("DENSE_TRIGGER", "8"))

# ---- person model -------------------------------------------------------
# Look for the real trained weights first. If MODEL_DOWNLOAD_URL is set
# (a GitHub Release asset, Hugging Face file, etc.) and the weights aren't
# present locally, download and cache them. Otherwise fall back to the
# generic pretrained YOLOv8n so the service still works either way.
CUSTOM_MODEL_PATH = os.environ.get("MODEL_PATH", os.path.join(HERE, "models", "best.pt"))
MODEL_DOWNLOAD_URL = os.environ.get("MODEL_DOWNLOAD_URL")
FALLBACK_MODEL = "yolov8n.pt"
PERSON_CLASS_ID = 0

# ---- weapon model (optional) --------------------------------------------
# Trained separately (see weapon_training/). The weapon class is looked up by
# NAME in the model's own class list, not by a hard-coded number, so a model
# trained with a different class order still works.
WEAPON_MODEL_PATH = os.environ.get("WEAPON_MODEL_PATH", os.path.join(HERE, "models", "weapon_detection.pt"))
WEAPON_MODEL_DOWNLOAD_URL = os.environ.get("WEAPON_MODEL_DOWNLOAD_URL")
WEAPON_CLASS_NAMES = [
    n.strip().lower() for n in os.environ.get("WEAPON_CLASS_NAMES", "weapon").split(",") if n.strip()
]

# The weapon model is known to report one "weapon" box covering the whole frame on blank,
# white or covered-lens images (confidence 0.6 to 0.8), which raised HIGH alerts with nobody
# in view. A real weapon in a camera view never fills the frame, so weapon boxes covering
# more than this fraction of the frame area are discarded. Set to 1 to turn the guard off.
WEAPON_MAX_FRAME_FRACTION = float(os.environ.get("WEAPON_MAX_FRAME_FRACTION", "0.8"))

app = FastAPI(title="VIGILANT Inference Service")

_infer_lock = threading.Lock()

_model = None
_model_source = None

_weapon_model = None
_weapon_status = "not_loaded_yet"  # not_loaded_yet | loaded | missing
_weapon_class_ids: list[int] = []


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


def get_weapon_model():
    """Returns the weapon model, or None if no weapon weights are available."""
    global _weapon_model, _weapon_status, _weapon_class_ids
    if _weapon_model is not None:
        return _weapon_model
    if _weapon_status == "missing":
        return None

    from ultralytics import YOLO

    if not os.path.exists(WEAPON_MODEL_PATH) and WEAPON_MODEL_DOWNLOAD_URL:
        try:
            _download_model(WEAPON_MODEL_DOWNLOAD_URL, WEAPON_MODEL_PATH)
        except Exception as exc:
            logger.error(f"Weapon model download failed ({exc})")

    if not os.path.exists(WEAPON_MODEL_PATH):
        logger.warning(f"No weapon model at {WEAPON_MODEL_PATH}; weapon detection is OFF (person detection only).")
        _weapon_status = "missing"
        return None

    model = YOLO(WEAPON_MODEL_PATH)
    ids = [int(i) for i, name in model.names.items() if str(name).lower() in WEAPON_CLASS_NAMES]
    if not ids:
        logger.error(
            f"Weapon model {WEAPON_MODEL_PATH} has classes {model.names}, none match {WEAPON_CLASS_NAMES}. "
            "Weapon detection is OFF. Set WEAPON_CLASS_NAMES to the right class name."
        )
        _weapon_status = "missing"
        return None

    logger.info(f"Loaded weapon model {WEAPON_MODEL_PATH}, weapon class ids {ids} ({model.names})")
    _weapon_model = model
    _weapon_class_ids = ids
    _weapon_status = "loaded"
    return _weapon_model


def _boxes_to_detections(result, label: str):
    out = []
    for box in result.boxes:
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        out.append({
            "label": label,
            "confidence": round(float(box.conf[0].item()), 4),
            "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
        })
    return out


def _drop_frame_filling(detections, width: int, height: int):
    limit = WEAPON_MAX_FRAME_FRACTION * width * height
    return [d for d in detections if (d["bbox"][2] - d["bbox"][0]) * (d["bbox"][3] - d["bbox"][1]) <= limit]


@app.get("/health")
def health():
    if _weapon_status == "not_loaded_yet":
        # Don't load the model just to answer a health check; report whether weights exist.
        weapon_status = "available" if os.path.exists(WEAPON_MODEL_PATH) else "missing"
    else:
        weapon_status = _weapon_status
    return {
        "status": "ok",
        "model_source": _model_source or "not_loaded_yet",
        "model_path_checked": CUSTOM_MODEL_PATH,
        "weapon_model": weapon_status,
        "weapon_model_path_checked": WEAPON_MODEL_PATH,
    }


@app.post("/detect")
def detect(
    file: UploadFile = File(...),
    confidence: float = Query(0.5, ge=0.0, le=1.0),
    weapon_confidence: float = Query(0.5, ge=0.0, le=1.0),
    imgsz: int = Query(640, ge=320, le=1280),
    dense: int = Query(0, ge=0, le=1),
):
    # A plain `def` (not `async def`) makes FastAPI run this in a worker thread, so a slow
    # detection (for example a dense-crowd pass) does not freeze /health. The lock keeps
    # two requests from using the same model at the same time.
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        raw = file.file.read()
        # Phone photos store rotation in EXIF; browsers show them upright, so apply it here too
        # or the returned boxes would not line up with the picture the user sees.
        image = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not decode image: {exc}")

    with _infer_lock:
        model = get_model()
        # Pass the PIL image itself: ultralytics reads PIL images as RGB. (A raw numpy array
        # is read as BGR, which would feed the models colour-swapped frames.)
        frame = image

        person_result = model(frame, conf=confidence, imgsz=imgsz, classes=[PERSON_CLASS_ID], verbose=False)[0]
        detections = _boxes_to_detections(person_result, "person")

        dense_pass = False
        if dense and len(detections) >= DENSE_TRIGGER:
            boxes, scores = dense_people(model, image, confidence, imgsz=imgsz, person_class=PERSON_CLASS_ID)
            detections = [
                {"label": "person", "confidence": round(float(s), 4), "bbox": [round(v, 1) for v in b]}
                for b, s in zip(boxes, scores)
            ]
            dense_pass = True

        weapon_model = get_weapon_model()
        if weapon_model is not None:
            weapon_result = weapon_model(frame, conf=weapon_confidence, imgsz=imgsz, classes=_weapon_class_ids, verbose=False)[0]
            detections += _drop_frame_filling(_boxes_to_detections(weapon_result, "weapon"), image.width, image.height)

    return JSONResponse({
        "detections": detections,
        "count": len(detections),
        "image_width": image.width,
        "image_height": image.height,
        "model_source": _model_source,
        "weapon_model": _weapon_status,
        "dense_pass": dense_pass,
    })
