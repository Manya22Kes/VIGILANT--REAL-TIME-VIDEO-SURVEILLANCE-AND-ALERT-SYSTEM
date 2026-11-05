"""
Dense-crowd person counting.

A normal YOLO pass misses many people in packed scenes (small, partly hidden, far
away). This runs the model again on overlapping tiles of the frame and merges the
results. It is only used when the normal pass already finds several people, so
ordinary scenes pay no extra time.

Care taken so tiling does not invent people:
  - boxes cut off by an interior tile border are dropped (they are fragments)
  - the full-image pass is kept, so large/near people stay whole
  - overlapping duplicates are merged with NMS
  - "group boxes" that swallow 2+ smaller person boxes are dropped

Limit: it still cannot see people whose bodies are hidden (only heads visible in
the back rows), because the model was trained on whole-body people.
"""
import torch
import torchvision


def _inter_over_area(a, b):
    """Area of the overlap of a and b, divided by the area of a."""
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    return ix * iy / max((a[2] - a[0]) * (a[3] - a[1]), 1e-6)


def _area(b):
    return (b[2] - b[0]) * (b[3] - b[1])


def dense_people(model, image, conf, imgsz=640, person_class=0, tile=3, overlap=0.3, edge_px=4, iou=0.5):
    """Returns (boxes, scores) for people in a PIL image, using tiled detection."""
    W, H = image.size
    boxes, scores = [], []

    full = model(image, conf=conf, imgsz=imgsz, classes=[person_class], verbose=False)[0]
    for b, s in zip(full.boxes.xyxy.tolist(), full.boxes.conf.tolist()):
        boxes.append(b)
        scores.append(s)

    tw = W / (tile - (tile - 1) * overlap)
    th = H / (tile - (tile - 1) * overlap)
    sx = (W - tw) / (tile - 1)
    sy = (H - th) / (tile - 1)
    for i in range(tile):
        for j in range(tile):
            x0, y0 = int(round(j * sx)), int(round(i * sy))
            x1, y1 = int(x0 + tw), int(y0 + th)
            cw, ch = x1 - x0, y1 - y0
            res = model(image.crop((x0, y0, x1, y1)), conf=conf, imgsz=imgsz, classes=[person_class], verbose=False)[0]
            for b, s in zip(res.boxes.xyxy.tolist(), res.boxes.conf.tolist()):
                cut = (
                    (b[0] <= edge_px and x0 > 0)
                    or (b[2] >= cw - edge_px and x1 < W)
                    or (b[1] <= edge_px and y0 > 0)
                    or (b[3] >= ch - edge_px and y1 < H)
                )
                if cut:
                    continue
                boxes.append([b[0] + x0, b[1] + y0, b[2] + x0, b[3] + y0])
                scores.append(s)

    if not boxes:
        return [], []
    keep = torchvision.ops.nms(torch.tensor(boxes), torch.tensor(scores), iou).tolist()
    boxes = [boxes[k] for k in keep]
    scores = [scores[k] for k in keep]

    final = [
        i
        for i, b in enumerate(boxes)
        if sum(1 for k, a in enumerate(boxes) if k != i and _area(a) < 0.6 * _area(b) and _inter_over_area(a, b) > 0.85) < 2
    ]
    return [boxes[i] for i in final], [scores[i] for i in final]
