from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
from PIL import Image
import io
import base64
import cv2
from ultralytics import YOLO
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="TradePilot - YOLO Detection Service")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load YOLO model
MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "yolo11n.pt")
model = None


@app.on_event("startup")
async def load_model():
    global model
    try:
        logger.info(f"[DIAG] Loading YOLO model from {MODEL_PATH}")
        model = YOLO(MODEL_PATH)
        logger.info(f"[DIAG] YOLO model loaded successfully. Classes: {list(model.names.values())[:10]}...")
    except Exception as e:
        logger.error(f"[DIAG] Failed to load YOLO model: {e}")
        raise


class DetectionRequest(BaseModel):
    image: str  # base64 encoded
    conf_threshold: float = 0.5


class Detection(BaseModel):
    class_name: str
    confidence: float
    bbox: List[float]  # [x1, y1, x2, y2]
    center: List[float]  # [cx, cy]


class DetectionResponse(BaseModel):
    detections: List[Detection]
    total_objects: int
    class_counts: dict
    image_shape: List[int]


class CropRequest(BaseModel):
    image: str
    bbox: List[float]  # [x1, y1, x2, y2]


class HealthCheck(BaseModel):
    status: str
    model_loaded: bool


@app.get("/health", response_model=HealthCheck)
async def health_check():
    return HealthCheck(status="healthy", model_loaded=model is not None)


@app.post("/detect", response_model=DetectionResponse)
async def detect_objects(request: DetectionRequest):
    """Detect objects in image using YOLO"""
    try:
        logger.info(f"[DIAG] /detect called, image data length: {len(request.image)}, conf_threshold: {request.conf_threshold}")
        # Decode image
        image_data = base64.b64decode(
            request.image.split(",")[1] if "," in request.image else request.image
        )
        image = Image.open(io.BytesIO(image_data))
        image_array = np.array(image)
        logger.info(f"[DIAG] Image decoded: shape={image_array.shape}")

        # Run inference
        results = model(image_array, conf=request.conf_threshold)

        detections = []
        class_counts = {}

        for result in results:
            boxes = result.boxes
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                conf = float(box.conf[0])
                cls = int(box.cls[0])
                class_name = model.names[cls]

                # Calculate center
                cx = (x1 + x2) / 2
                cy = (y1 + y2) / 2

                detections.append(
                    Detection(
                        class_name=class_name,
                        confidence=conf,
                        bbox=[x1, y1, x2, y2],
                        center=[cx, cy],
                    )
                )

                class_counts[class_name] = class_counts.get(class_name, 0) + 1

        logger.info(f"[DIAG] /detect result: {len(detections)} objects, classes: {class_counts}")
        return DetectionResponse(
            detections=detections,
            total_objects=len(detections),
            class_counts=class_counts,
            image_shape=list(image_array.shape[:2]),
        )

    except Exception as e:
        logger.error(f"[DIAG] Detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/detect-and-crop")
async def detect_and_crop(request: DetectionRequest):
    """Detect objects and return cropped regions"""
    try:
        # Decode image
        image_data = base64.b64decode(
            request.image.split(",")[1] if "," in request.image else request.image
        )
        image = Image.open(io.BytesIO(image_data))
        image_array = np.array(image)

        # Run inference
        results = model(image_array, conf=request.conf_threshold)

        cropped_regions = []

        for result in results:
            boxes = result.boxes
            for i, box in enumerate(boxes):
                x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

                # Crop region
                crop = image_array[y1:y2, x1:x2]

                # Convert to base64
                crop_pil = Image.fromarray(crop)
                buffer = io.BytesIO()
                crop_pil.save(buffer, format="JPEG")
                crop_base64 = base64.b64encode(buffer.getvalue()).decode()

                cropped_regions.append(
                    {
                        "id": i,
                        "class_name": model.names[int(box.cls[0])],
                        "confidence": float(box.conf[0]),
                        "bbox": [x1, y1, x2, y2],
                        "image": f"data:image/jpeg;base64,{crop_base64}",
                    }
                )

        return {"regions": cropped_regions, "total": len(cropped_regions)}

    except Exception as e:
        logger.error(f"Crop error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/crop")
async def crop_region(request: CropRequest):
    """Crop a specific region from image"""
    try:
        # Decode image
        image_data = base64.b64decode(
            request.image.split(",")[1] if "," in request.image else request.image
        )
        image = Image.open(io.BytesIO(image_data))
        image_array = np.array(image)

        x1, y1, x2, y2 = map(int, request.bbox)
        crop = image_array[y1:y2, x1:x2]

        # Convert to base64
        crop_pil = Image.fromarray(crop)
        buffer = io.BytesIO()
        crop_pil.save(buffer, format="JPEG")
        crop_base64 = base64.b64encode(buffer.getvalue()).decode()

        return {
            "image": f"data:image/jpeg;base64,{crop_base64}",
            "bbox": [x1, y1, x2, y2],
        }

    except Exception as e:
        logger.error(f"Crop error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
