<div align="center">

# 🛡️ VIGILANT

### _Restricted-Zone Surveillance & Automated Alert System_

[![Python](https://img.shields.io/badge/Python-FastAPI-3776AB?style=flat-square&logo=python&logoColor=white)](https://fastapi.tiangolo.com/)
[![YOLOv8](https://img.shields.io/badge/YOLOv8-Ultralytics-00599C?style=flat-square)](https://github.com/ultralytics/ultralytics)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React_19-TypeScript-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://sqlite.org/)

<p align="center">
  <b>Point a webcam at an area, draw a custom polygon zone, inspect expressions, scan for weapons, monitor crowds, and instantly flag intruders with confidence scoring, dwell-time severity ratings, and automated snapshot captures.</b>
</p>

[How It Works](#-how-it-works) •
[Features](#-features) •
[Tech Stack](#-tech-stack) •
[Project Structure](#-project-structure) •
[Getting Started](#-getting-started) •
[Configuration](#-configuration-reference) •
[Weapon Detection](#-weapon-detection) •
[SMS Alerts](#-sms-alerts-textbeedev) •
[Auth Model](#-auth-model) •
[Known Limitations](#-known-limitations)

---

</div>

VIGILANT is a restricted-zone surveillance system for a campus (or any single-camera site). Point a webcam at an area, draw a zone on top of the video, and the system flags anyone who enters it — with a confidence score, a dwell-time based severity rating, and a saved snapshot of the moment it happened. Additionally, the system inspects expressions, scans for weapons, and monitors crowd formations for elevated threat awareness.

It's a three-service stack: a Python service that runs a custom-trained YOLOv8 person model (plus an optional weapon model), a Node/Express backend that owns the zone logic, alert history and SMS notifications, and a React frontend for the live view, alert log, and model stats. Serious alerts can also be texted to your phone through [textbee.dev](https://textbee.dev).

---

## 🔄 How it works

```
 browser (camera / upload)
        │  frame every ~1.2s
        ▼
 Node backend  ──────────────►  Python inference service (YOLOv8)
        │        bounding boxes for "person" (and "weapon", if that model is present)
        │
        ├─ checks box centers against the restricted zone polygon
        ├─ tracks how long someone has continuously been inside it
        ├─ scores severity from confidence × people-in-zone × dwell time
        ├─ counts everyone in view for crowd alerts, and watches for weapons
        └─ on a new alert (rate-limited by a cooldown): saves a snapshot,
           writes a row to SQLite, and (optionally) sends an SMS
```

> [!NOTE]
> The inference service does one job — take an image, return people. Everything about _what counts as an incident_ (the zone, dwell time, severity, alert history) lives in the Node backend, which is what the frontend actually talks to.

---

## ✨ Features

- 📹 **Live detection** — real webcam capture via `getUserMedia`, streamed to the backend and drawn back as bounding boxes + the zone outline on a canvas overlay. The camera view is un-mirrored, so moving right on screen means moving right in real life (a "flip camera" button switches it back if you prefer the mirror view).
- 📤 **Upload fallback** — no camera handy? Drop in a jpg/png for a single detection pass, or an mp4 to replay it through the same detection loop. Phone photos are rotated by their EXIF orientation before detection, so people are not missed in sideways images.
- 📐 **Interactive zone editor** — click to place points, drag to reposition, undo, reset to a rectangle, or save. Any polygon, not just a box.
- ⏱️ **Severity scoring** — a person passing through the edge of the zone scores low; one or two people in the zone are always low, and with three or more people, higher confidence and longer dwell push the rating up (low → medium → high).
- 🔫 **Weapon detection** — an optional second YOLOv8 model raises an always-HIGH `weapon` alert, confirmed over consecutive frames and guarded against false alarms on blank or covered cameras. See [Weapon detection](#-weapon-detection).
- 👥 **Crowd alerts and dense counting** — a `crowd` alert fires when too many people are in view, and a tiled re-scan finds more people in packed scenes.
- 🎚️ **Live settings panel** — confidence, cooldown, crowd threshold and detection size are adjustable from the Live Feed tab while the system runs, with no restart.
- 📱 **SMS alerts** — HIGH alerts can be texted to up to several phones through textbee.dev, with an on/off switch, a test button and quota protection. See [SMS alerts](#-sms-alerts-textbeedev).
- 📜 **Alert history** — every flagged event is logged with a timestamp, type, confidence, detection count, dwell time, and a linked snapshot. Snapshots download with the right file extension (jpg, png, webp or gif, matching the real image) so they open in any viewer, and the whole history exports to CSV.
- 📊 **Model stats** — live alert breakdown plus the trained model's actual validation metrics.
- 🔑 **Single-admin auth** — a password-gated login controls who can reconfigure the zone, change settings and use SMS controls; everything else stays read-only without a login.

---

## 🛠️ Tech stack

| Layer                 | Stack                                                       |
| :-------------------- | :---------------------------------------------------------- |
| **Inference service** | Python, FastAPI, Ultralytics YOLOv8, Pillow                 |
| **Backend**           | Node.js, Express, better-sqlite3, JWT + bcrypt              |
| **Frontend**          | React 19, TypeScript, Vite, Tailwind CSS, React Three Fiber |
| **Notifications**     | textbee.dev SMS gateway (an Android phone sends the texts)  |

---

## 📂 Project structure

```text
inference-service/   FastAPI service wrapping the YOLOv8 models (main.py) and the
                     tiled dense-crowd pass (dense.py)
server/              Express API: zone logic, severity, alerts, live settings,
                     SMS notifications (src/lib/smsNotifier.js), SQLite
client/              React frontend (Live Feed, Alerts History, Model Stats,
                     settings panel)
```

---

## 🚀 Getting started

Run the three services in order — each one depends on the one before it.

### 1. Inference service

```bash
cd inference-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
```

The trained weights ship in the repo at `inference-service/models/best.pt` and load automatically. Confirm it's up:

```bash
curl http://localhost:8001/health
# { "status": "ok", "model_source": "custom", ... }
```

> [!TIP]
> If `best.pt` isn't present, the service falls back to a generic pretrained YOLOv8n so it still runs — useful for local dev without the real weights.

### 2. Backend

```bash
cd server
npm install
cp .env.example .env
```

Open `.env` and set:

- `ADMIN_PASSWORD` — the single admin password (hashed with bcrypt at startup, never compared in plaintext). Login is disabled until this is set.
- `ADMIN_JWT_SECRET` — a long random string used to sign login tokens, e.g. `openssl rand -hex 32`.

Then start it:

```bash
npm start
curl http://localhost:4000/health
```

### 3. Frontend

```bash
cd client
npm install
npm run dev
```

Opens on `http://localhost:5173`. It talks to `http://localhost:4000` by default — copy `.env.example` to `.env` and set `VITE_API_BASE` if your backend runs elsewhere.

---

## ⚙️ Configuration reference

Backend (`server/.env`):

| Variable                 | Default                 | Purpose                                             |
| :----------------------- | :---------------------- | :-------------------------------------------------- |
| `PORT`                   | `4000`                  | Port the API listens on                             |
| `INFERENCE_SERVICE_URL`  | `http://localhost:8001` | Where to reach the Python service                   |
| `CONFIDENCE_THRESHOLD`   | `0.5`                   | Minimum detection confidence to keep                |
| `ALERT_COOLDOWN_SECONDS` | `10`                    | Minimum gap between logged alerts                   |
| `DWELL_GAP_SECONDS`      | `3`                     | Missed-frame tolerance before a dwell streak resets |
| `WEAPON_CONFIDENCE_THRESHOLD` | `0.5`              | Minimum confidence for a weapon detection           |
| `WEAPON_COOLDOWN_SECONDS` | `5`                    | Minimum gap between logged weapon alerts            |
| `WEAPON_MIN_CONSECUTIVE_FRAMES` | `2`              | Frames in a row a weapon must be seen before alerting (`1` = off) |
| `CROWD_THRESHOLD`        | `4`                     | People in view that raise a crowd alert (live-adjustable) |
| `CROWD_CONFIDENCE`       | `0.35`                  | Confidence used when counting people for the crowd (live-adjustable) |
| `CROWD_MIN_CONSECUTIVE_FRAMES` | `2`               | Frames in a row the crowd must be seen before alerting |
| `INFERENCE_IMGSZ`        | `640`                   | Image size the models run at: 640, 960 or 1280 (live-adjustable) |
| `DENSE_COUNTING`         | `1`                     | `1` = tiled re-scan when a scene already has several people (live-adjustable) |
| `CORS_ORIGIN`            | `http://localhost:5173` | Allowed frontend origin                             |
| `ADMIN_PASSWORD`         | _(none)_                | Admin password — required for login                 |
| `ADMIN_JWT_SECRET`       | _(none)_                | Secret used to sign login JWTs                      |

The SMS variables (`TEXTBEE_API_KEY`, `SMS_RECIPIENTS` and friends) are listed in [SMS alerts](#-sms-alerts-textbeedev). The inference service has its own optional environment variables: `MODEL_PATH`, `WEAPON_MODEL_PATH`, `WEAPON_CLASS_NAMES`, `DENSE_TRIGGER` and `WEAPON_MAX_FRAME_FRACTION` (see [Weapon detection](#-weapon-detection)).

## 🎚️ Live settings, crowd alerts and CSV export

- **Live settings.** The Live Feed tab has a settings panel with sliders for person confidence, crowd counting confidence, weapon confidence, alert cooldown and crowd threshold, plus the detection size. Changes apply on the next frame, are saved in the database, and survive a restart. `GET /api/settings` is public; `POST /api/settings` needs the admin token (like the zone). The env values above are only the starting defaults.
- **Crowd alerts.** When `crowdThreshold` or more people are in view (anywhere in the frame, counted at the lower crowd confidence) for 2 frames in a row, a `crowd` alert is logged: MEDIUM at the threshold, HIGH at double. Weaker detections that only count towards the crowd are drawn faint on the feed.
- **Dense crowd counting.** A normal pass misses many people in packed scenes. When it already finds 8 or more, the service re-scans the frame in overlapping tiles (boxes cut off by tile borders and oversized "group boxes" are removed) and merges the results. On a test photo of about 50 people this found 14 instead of 10 (22 with the crowd confidence slider at 0.2), and it changed nothing on two normal-density photos. It cannot see people whose bodies are hidden (only heads visible), and those frames are slower. Switch it off with the checkbox if needed. The inference service reads `DENSE_TRIGGER` (default `8`) to decide how many people a frame needs before the tiled pass runs, so small groups never pay for it.
- **Faster capture.** Frames are sent one at a time as soon as the previous result returns, instead of on a fixed 1.2 s timer, so the feed runs as fast as the model allows.
- **CSV export.** The Alerts History tab has an "export csv" button (`GET /api/alerts/export.csv`) with every alert: id, timestamp, type, severity, confidence, detections, time in zone, snapshot path.
- **Snapshot downloads.** Each alert's snapshot downloads as `vigilant-alert-<id>.<ext>`, where the extension comes from the image's real format (detected from its first bytes) rather than being assumed to be `.jpg`. If a downloaded jpg will not open on Windows with "the application cannot be started", the cause is a broken default photo app on that PC, not the file; right-click it and use "Open with" another viewer or a browser.
- **Un-mirrored camera.** The live view is flipped back so left and right match real life, in both the preview and the frame sent for detection. Use the "flip camera" button in camera mode to turn it off.

## 🔫 Weapon detection

A second, separately trained YOLOv8 model detects weapons. It is **optional**: drop the weights at `inference-service/models/weapon_detection.pt` (or set `WEAPON_MODEL_PATH` / `WEAPON_MODEL_DOWNLOAD_URL`) and it switches on. Without the file, the service runs person detection only and the status bar shows "weapon detection off".

- The weapon model has one `weapon` class (guns and knives merged in the training dataset). The class is found by name, so a different class order still works; use `WEAPON_CLASS_NAMES` if your model names it differently.
- A weapon anywhere in the frame raises a `weapon` alert, always severity HIGH, with its own cooldown. It must appear in `WEAPON_MIN_CONSECUTIVE_FRAMES` consecutive frames first, to cut one-frame false alarms.
- Person detections still drive the restricted-zone logic exactly as before (`zone_intrusion` alerts).
- **Blank-camera guard.** The weapon model tends to report one box covering almost the whole frame when the image is blank, white or the camera is covered. A weapon box larger than `WEAPON_MAX_FRAME_FRACTION` of the frame (default `0.8`) is dropped, so a covered webcam no longer raises HIGH weapon alerts. Set it to `1` to turn the guard off.
- Alerts carry a `type` (`zone_intrusion`, `weapon` or `crowd`). Existing databases are upgraded automatically on startup.
- Training script and dataset layout: see the separate `weapon_training` package.

> [!NOTE]
> Inference service accepts `MODEL_PATH` and `MODEL_DOWNLOAD_URL` if you'd rather fetch weights from a remote URL (e.g. a GitHub release) instead of committing them locally.

---

## 📱 SMS alerts (textbee.dev)

VIGILANT can text you when an alert is raised, using [textbee.dev](https://textbee.dev). TextBee turns an **Android phone** (Android 7+, with the TextBee app signed in and online) into an SMS gateway, so messages go out from that phone's SIM. iPhones are not supported. It is off until you configure it.

1. Create a TextBee account, install the app on the Android phone and register the device.
2. Create an API key in the TextBee dashboard.
3. Add to `server/.env` (never commit it) and restart the backend:

```
TEXTBEE_API_KEY=your-key
SMS_RECIPIENTS=+919876543210,+919812345678
```

| Variable | Default | Meaning |
|---|---|---|
| `TEXTBEE_API_KEY` | _(off)_ | API key from the TextBee dashboard |
| `SMS_RECIPIENTS` | _(off)_ | Comma separated numbers in international format (`+` and country code) |
| `TEXTBEE_DEVICE_ID` | default device | Pick a specific phone if you registered several |
| `SMS_MIN_SEVERITY` | `HIGH` | Only alerts at or above this severity are texted (`LOW`, `MEDIUM`, `HIGH`) |
| `SMS_ALERT_TYPES` | `weapon,zone_intrusion,crowd` | Which alert types may send an SMS |
| `SMS_COOLDOWN_SECONDS` | `300` | At most one SMS per alert type in this window |
| `SMS_DAILY_LIMIT` | `40` | Maximum messages per day (each recipient counts as one); resets at midnight |

- **Mind the free plan:** 50 SMS a day and 300 a month, one per recipient. The severity filter, cooldown and daily cap exist so a noisy camera cannot use the quota in minutes. Weapon alerts are always HIGH, so the default sends those plus severe crowds and intrusions; set `SMS_MIN_SEVERITY=LOW` to text everything.
- Messages are one plain-text line, for example `VIGILANT HIGH alert: Weapon detected (72%) at 22:10.` They contain no image or link.
- SMS never slows detection: it is sent in the background and a failure (wrong key, phone offline, plan limit) only logs a warning on the server. The daily counter is kept in memory, so it restarts from zero when the backend restarts.
- In the Live Feed tab, the settings panel shows whether SMS is on and has an **SMS: on/off** switch and a **send test SMS** button (admin login needed). The switch turns automatic alert texts on or off without editing `.env`; it is remembered across restarts, and the test button still works while it is off. `GET /api/sms`, `POST /api/sms/enabled` and `POST /api/sms/test` need the admin token too.

---

## 🔐 Auth model

Kept deliberately minimal — this is a single-admin tool, not a multi-user system:

- `POST /api/auth/login` checks the password against `ADMIN_PASSWORD` and returns a JWT (~24h expiry).
- `POST /api/zone` (reconfiguring the restricted zone), `POST /api/settings` (live settings) and the SMS endpoints (`/api/sms`, `/api/sms/enabled`, `/api/sms/test`) require that token. Reading alerts, stats, the zone, the settings, and running detection are all public endpoints, since the live detection loop and history views need to work without a login.
- The frontend still gates the whole UI behind a login screen for simplicity, even though most routes don't require it server-side.

---

## ⚠️ Known limitations

- Dwell, crowd and weapon streak tracking assume a single camera stream (in-memory state, not per-session). Run one live feed at a time.
- Snapshots are kept forever; there is no automatic cleanup.
- Crowd counts are a lower bound in packed scenes. The person model was fine-tuned on a small everyday-scenes dataset, not crowd data, so it misses people whose bodies are hidden (for example only heads visible in back rows). Dense crowd counting roughly doubles what it finds, but a photo of about 50 people still gave only 14 to 22. Accuracy on this project's own footage has not been measured yet.
- Weapon detection accuracy depends entirely on the weapon model's training data (a public CCTV dataset, one merged `weapon` class). It has not yet been measured on this project's own camera footage; expect false positives and misses.
- SMS needs an Android phone that stays online with the TextBee app, and the free plan caps it at 50 texts a day and 300 a month. TextBee accepting a message does not guarantee delivery. The daily SMS counter resets when the backend restarts.
- Inference runs on the CPU unless a CUDA build of PyTorch is installed, so speed depends on the machine and the detection size setting.
- The zone editor and upload flow are covered by manual testing but not an automated browser test suite yet.
- Frontend bundle is ~1.2MB (mostly three.js) — fine for the current scale, would want code-splitting before shipping this more broadly.
