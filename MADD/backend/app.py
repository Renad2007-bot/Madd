"""
نقطة تشغيل الباك-اند الموحّد لمنصة COM.
يجمع: OCR + تصنيف النصوص المسيئة + التنبؤ بالتخصص.

التشغيل:
    cd backend
    uvicorn app:app --reload --port 8000
أو:
    python app.py
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import classification
import ocr
import prediction
from config import HOST, PORT


@asynccontextmanager
async def lifespan(app: FastAPI):
    """يحمّل كل النماذج مرة واحدة عند الإقلاع."""
    print("=" * 50)
    classification.load_model()
    prediction.load_model()
    print("=" * 50)
    yield


app = FastAPI(
    title="COM Backend — OCR + Classification + Prediction",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ocr.router)
app.include_router(classification.router)
app.include_router(prediction.router)


@app.get("/")
def root():
    return {"status": "COM Backend Running ✅"}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "ocr": "ready",
        "classification": "ready" if classification.is_ready() else "not loaded",
        "prediction": "ready" if prediction.is_ready() else "not loaded",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host=HOST, port=PORT)
