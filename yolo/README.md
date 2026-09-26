# YOLO Detection Service

FastAPI + Ultralytics YOLO11n. Powers the live box-count camera at `/box-count`.

Maintained by [Rohit Arabale](https://github.com/rohit-arabale) as part of [TradePilot](https://github.com/rohit-arabale/tradepilot).

## Run locally (no Docker)

```bash
cd yolo
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

First run downloads `yolo11n.pt` (~6 MB).

## Run via Docker

From the repo root:

```bash
docker compose up yolo --build
```

## Endpoints

- `GET  /health` — `{ status, model_loaded }`
- `POST /detect` — `{ image: base64, conf_threshold? }` → `{ detections, total_objects, class_counts, image_shape }`
- `POST /detect-and-crop` — same input, returns base64 crops of every detection
- `POST /crop` — crop a specific bbox out of an image

The Vite dev server proxies `/yolo/*` → `http://localhost:8000`, so frontend code calls `fetch("/yolo/detect", …)` with no CORS dance.
