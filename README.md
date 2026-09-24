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
[Auth Model](#-auth-model) •
[Known Limitations](#-known-limitations)

---

</div>

VIGILANT is a restricted-zone surveillance system for a campus (or any single-camera site). Point a webcam at an area, draw a zone on top of the video, and the system flags anyone who enters it — with a confidence score, a dwell-time based severity rating, and a saved snapshot of the moment it happened. Additionally, the system inspects expressions, scans for weapons, and monitors crowd formations for elevated threat awareness.

It's a three-service stack: a Python service that runs a custom-trained YOLOv8 model, a Node/Express backend that owns the zone logic and alert history, and a React frontend for the live view, alert log, and model stats.

---

## 🔄 How it works

```
 browser (camera / upload)
        │  frame every ~1.2s
        ▼
 Node backend  ──────────────►  Python inference service (YOLOv8)
        │        bounding boxes for "person"
        │
        ├─ checks box centers against the restricted zone polygon
        ├─ tracks how long someone has continuously been inside it
        ├─ scores severity from confidence × people-in-zone × dwell time
        └─ on a new alert (rate-limited by a cooldown): saves a snapshot
           and writes a row to SQLite
```

> [!NOTE]
> The inference service does one job — take an image, return people. Everything about _what counts as an incident_ (the zone, dwell time, severity, alert history) lives in the Node backend, which is what the frontend actually talks to.

---

## ✨ Features

- 📹 **Live detection** — real webcam capture via `getUserMedia`, streamed to the backend and drawn back as bounding boxes + the zone outline on a canvas overlay.
- 📤 **Upload fallback** — no camera handy? Drop in a jpg/png for a single detection pass, or an mp4 to replay it through the same detection loop.
- 📐 **Interactive zone editor** — click to place points, drag to reposition, undo, reset to a rectangle, or save. Any polygon, not just a box.
- ⏱️ **Severity scoring** — a person passing through the edge of the zone scores low; someone lingering scores progressively higher (low → medium → high).
- 📜 **Alert history** — every flagged event is logged with a timestamp, confidence, detection count, dwell time, and a linked snapshot.
- 📊 **Model stats** — live alert breakdown plus the trained model's actual validation metrics.
- 🔑 **Single-admin auth** — a password-gated login controls who can reconfigure the zone; everything else stays read-only without a login.

---

## 🛠️ Tech stack

| Layer                 | Stack                                                       |
| :-------------------- | :---------------------------------------------------------- |
| **Inference service** | Python, FastAPI, Ultralytics YOLOv8                         |
| **Backend**           | Node.js, Express, better-sqlite3, JWT + bcrypt              |
| **Frontend**          | React 19, TypeScript, Vite, Tailwind CSS, React Three Fiber |

---

## 📂 Project structure

```text
inference-service/   FastAPI service wrapping the YOLOv8 model
server/              Express API: zone logic, severity, alerts, SQLite
client/              React frontend
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
| `CORS_ORIGIN`            | `http://localhost:5173` | Allowed frontend origin                             |
| `ADMIN_PASSWORD`         | _(none)_                | Admin password — required for login                 |
| `ADMIN_JWT_SECRET`       | _(none)_                | Secret used to sign login JWTs                      |

> [!NOTE]
> Inference service accepts `MODEL_PATH` and `MODEL_DOWNLOAD_URL` if you'd rather fetch weights from a remote URL (e.g. a GitHub release) instead of committing them locally.

---

## 🔐 Auth model

Kept deliberately minimal — this is a single-admin tool, not a multi-user system:

- `POST /api/auth/login` checks the password against `ADMIN_PASSWORD` and returns a JWT (~24h expiry).
- Only `POST /api/zone` (reconfiguring the restricted zone) requires that token. Reading alerts, stats, the zone, and running detection are all public endpoints, since the live detection loop and history views need to work without a login.
- The frontend still gates the whole UI behind a login screen for simplicity, even though most routes don't require it server-side.

---

## ⚠️ Known limitations

- Dwell tracking assumes a single camera stream (in-memory state, not per-session).
- The zone editor and upload flow are covered by manual testing but not an automated browser test suite yet.
- Frontend bundle is ~1.2MB (mostly three.js) — fine for the current scale, would want code-splitting before shipping this more broadly.
