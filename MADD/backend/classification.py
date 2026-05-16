"""
نموذج تصنيف النصوص المسيئة بالعربية.
طبقتان: قائمة كلمات صريحة + نموذج TF-IDF/LogisticRegression.
"""

import re
from pathlib import Path

import joblib
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import MODELS_DIR

router = APIRouter(tags=["classification"])

_model = None

# كلمات مفردة مسيئة
_OFFENSIVE_WORDS = {
    "غبي","غبية","غبيه","احمق","احمقه","حمار","حماره","كلب","كلبه",
    "خنزير","خنزيره","حقير","حقيره","قذر","قذره","فاشل","فاشله",
    "متخلف","متخلفه","وقح","وقحه","سافل","سافله","نذل","نذله",
    "ابله","ابلهه","معتوه","بليد","بليده","تافه","تافهه","مجنون","مجنونه",
    "اخرس","اخرسي","اسكت","اسكتي","اكرهك","اكرهج",
    "لعنه","لعنة","ملعون","ملعونه","العن","يلعن",
}

# عبارات متعددة الكلمات
_OFFENSIVE_PHRASES = [
    "روح من وجهي","روحي من وجهي",
    "ما تستاهل","ما تستاهلين","لا تستاهل","لا تستاهلين",
    "لا خير فيك","لا خير فيج","لا خير فيه","لا خير فيها",
]

# كلمات دالة على محتوى إيجابي — تمنع النموذج من إصدار حكم خاطئ
_SAFE_WORDS = {
    "شكرا","شكراً","شكرًا","مشكور","مشكوره","جزاك","بارك",
    "ماشاءالله","ما شاء الله","الله يوفق","الله يسعد","مبروك","مبارك",
    "ممتاز","امتياز","رائع","رائعه","رائعة","جميل","جميله","احسنت",
    "نجحت","نجح","تفوق","تميز","اعجبني","احببت","يسعدني","سعيد",
}

def _contains_keyword(text: str) -> bool:
    words = set(re.findall(r'[؀-ۿ]+', text))
    if words & _OFFENSIVE_WORDS:
        return True
    return any(phrase in text for phrase in _OFFENSIVE_PHRASES)

def _is_safe(text: str) -> bool:
    words = set(re.findall(r'[؀-ۿ]+', text))
    return bool(words & _SAFE_WORDS)


def _clean(text: str) -> str:
    text = str(text)
    text = re.sub(r"http\S+|@\w+|#", "", text)
    text = re.sub(r"[إأآا]", "ا", text)
    text = re.sub(r"ى", "ي", text)
    text = re.sub(r"ة", "ه", text)
    text = re.sub(r"(.)\1{2,}", r"\1\1", text)
    return re.sub(r"\s+", " ", text).strip()


def load_model() -> bool:
    global _model
    model_path = MODELS_DIR / "arabic_classifier.pkl"
    if not model_path.exists():
        print(f"❌ ملف نموذج التصنيف غير موجود: {model_path}")
        return False
    try:
        print("⏳ جاري تحميل نموذج التصنيف...")
        _model = joblib.load(model_path)
        print("✅ نموذج التصنيف جاهز!")
        return True
    except Exception as e:
        print(f"❌ خطأ في تحميل نموذج التصنيف: {e}")
        _model = None
        return False


class TextRequest(BaseModel):
    text: str


@router.post("/classify")
async def classify(req: TextRequest):
    cleaned = _clean(req.text)

    # Layer 1: explicit keyword list (always active, no model needed)
    keyword_hit = _contains_keyword(cleaned)

    if _model is None:
        # Keyword-only mode when model isn't loaded — still useful
        return {
            "label": "offensive" if keyword_hit else "not",
            "is_offensive": keyword_hit,
            "confidence": 0.90 if keyword_hit else 0.60,
            "scores": {"not": 0.10 if keyword_hit else 0.60, "offensive": 0.90 if keyword_hit else 0.40},
            "keyword_triggered": keyword_hit,
            "mode": "keyword_only",
        }

    # Layer 2: ML model
    proba = _model.predict_proba([cleaned])[0]
    model_offensive = proba[1]

    safe = _is_safe(cleaned) and not keyword_hit
    threshold = 0.95 if safe else 0.70
    is_offensive = bool(keyword_hit or (model_offensive >= threshold))
    confidence = float(max(proba)) if not keyword_hit else max(float(proba[1]), 0.85)

    return {
        "label": "offensive" if is_offensive else "not",
        "is_offensive": is_offensive,
        "confidence": round(float(confidence), 4),
        "scores": {
            "not": round(float(proba[0]), 4),
            "offensive": round(float(proba[1]), 4),
        },
        "keyword_triggered": bool(keyword_hit),
        "mode": "ml_model",
    }


def is_ready() -> bool:
    return _model is not None
