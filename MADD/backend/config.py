"""
إعدادات ومسارات مشروع الباك-اند.
كل المسارات مطلقة (absolute) عشان تشتغل من أي مكان تشغّل منه الأمر.
"""

import os
from pathlib import Path

# مجلد backend/
BASE_DIR = Path(__file__).resolve().parent

# مجلد النماذج: backend/models/
MODELS_DIR = BASE_DIR / "models"

# نموذج تصنيف النصوص المسيئة (AraBERT).
# ضعي مجلد النموذج المدرَّب كامل هنا:
#   backend/models/arabert_offensive_model/
#   ├── config.json
#   ├── model.safetensors   ← ملف الأوزان (مطلوب)
#   ├── tokenizer.json
#   ├── tokenizer_config.json
#   └── vocab.txt           ← قاموس التوكنايزر (مطلوب)
# يمكن تغيير المسار عبر متغيّر البيئة CLASSIFICATION_MODEL_PATH.
CLASSIFICATION_MODEL_PATH = Path(
    os.getenv("CLASSIFICATION_MODEL_PATH", MODELS_DIR / "arabert_offensive_model")
)

# مسار Tesseract على ويندوز (يُتجاهل على لينكس/ماك).
TESSERACT_CMD_WINDOWS = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# منفذ تشغيل السيرفر — الواجهة تنادي http://localhost:8000
HOST = "0.0.0.0"
PORT = 8000
