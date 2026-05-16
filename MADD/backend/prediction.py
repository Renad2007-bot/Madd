"""
نموذج التنبؤ بالتخصص الجامعي المناسب (RandomForest من scikit-learn).
يحمّل ملفات .pkl محلياً من backend/models/
يوفّر راوتر فيه /recommend-major.
"""

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Literal

from config import MODELS_DIR

router = APIRouter(tags=["prediction"])

# تتعبّى عند الإقلاع. لو فشل التحميل تبقى None.
_major_model = None
_scaler = None
_target_encoder = None
_feature_encoders = None


def load_model() -> bool:
    """يحمّل ملفات نموذج التنبؤ من backend/models/. يرجّع True لو نجح."""
    global _major_model, _scaler, _target_encoder, _feature_encoders

    required = ["major_model.pkl", "scaler.pkl", "target_encoder.pkl", "feature_encoders.pkl"]
    missing = [f for f in required if not (MODELS_DIR / f).exists()]
    if missing:
        print(f"❌ ملفات نموذج التنبؤ ناقصة في backend/models/: {missing}")
        return False

    try:
        import joblib

        print("⏳ جاري تحميل نموذج التنبؤ...")
        _major_model = joblib.load(MODELS_DIR / "major_model.pkl")
        _scaler = joblib.load(MODELS_DIR / "scaler.pkl")
        _target_encoder = joblib.load(MODELS_DIR / "target_encoder.pkl")
        _feature_encoders = joblib.load(MODELS_DIR / "feature_encoders.pkl")
        print("✅ نموذج التنبؤ جاهز!")
        return True
    except Exception as e:
        print(f"❌ خطأ في تحميل ملفات نموذج التنبؤ: {e}")
        _major_model = _scaler = _target_encoder = _feature_encoders = None
        return False


class StudentRequest(BaseModel):
    Math: float = Field(..., ge=0, le=100, examples=[85])
    Biology: float = Field(..., ge=0, le=100, examples=[70])
    Physics: float = Field(..., ge=0, le=100, examples=[90])
    Chemistry: float = Field(..., ge=0, le=100, examples=[75])
    English: float = Field(..., ge=0, le=100, examples=[88])
    Digital_Technology: float = Field(..., ge=0, le=100, examples=[95])
    Critical_Thinking: float = Field(..., ge=0, le=100, examples=[92])
    Linguistic_Competencies: float = Field(..., ge=0, le=100, examples=[80])
    Holy_Quran: float = Field(..., ge=0, le=100, examples=[85])
    Ecology: float = Field(..., ge=0, le=100, examples=[70])
    Vocational_Education: float = Field(..., ge=0, le=100, examples=[75])
    Social_Studies: float = Field(..., ge=0, le=100, examples=[72])
    Hadith: float = Field(..., ge=0, le=100, examples=[78])
    Physical_Health: float = Field(..., ge=0, le=100, examples=[80])
    Financial_Literacy: float = Field(..., ge=0, le=100, examples=[85])
    Statistics: float = Field(..., ge=0, le=100, examples=[90])
    GPA: float = Field(..., ge=0, le=5, examples=[4.5])
    Grade_Level: int = Field(..., ge=1, le=3, examples=[3])
    Attendance_Behavior: Literal["Average", "Excellent", "Good", "Weak"] = Field(
        ..., examples=["Good"]
    )
    Interest: Literal[
        "AI", "Accounting", "Architecture", "Business", "Cybersecurity",
        "Data Analysis", "Engineering", "Healthcare", "Islamic Studies",
        "Law", "Marketing", "Programming", "Robotics", "Scientific Research",
    ] = Field(..., examples=["AI"])


@router.post("/recommend-major")
async def recommend_major(student: StudentRequest):
    if _major_model is None:
        raise HTTPException(
            status_code=503,
            detail="نموذج التنبؤ غير محمّل. تأكدي من وجود ملفات .pkl في backend/models/",
        )

    student_df = pd.DataFrame([student.model_dump()])
    for col, encoder in _feature_encoders.items():
        student_df[col] = encoder.transform(student_df[col])

    student_scaled = _scaler.transform(student_df)
    probabilities = _major_model.predict_proba(student_scaled)
    top3_indices = np.argsort(probabilities[0])[-3:][::-1]
    top3_majors = _target_encoder.inverse_transform(top3_indices)
    top3_scores = probabilities[0][top3_indices]

    recommendations = [
        {
            "rank": i + 1,
            "major": top3_majors[i],
            "confidence": round(float(top3_scores[i]) * 100, 2),
        }
        for i in range(3)
    ]

    return {
        "student_interest": student.Interest,
        "top_3_recommendations": recommendations,
    }


def is_ready() -> bool:
    return _major_model is not None
