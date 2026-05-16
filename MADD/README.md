# COM — منصة "مدّ" الطلابية

منصة طلابية فيها واجهة ويب + باك-اند ذكاء اصطناعي:
- **OCR**: استخراج النص من صور كشوف الدرجات.
- **التصنيف (Classification)**: كشف النصوص المسيئة بالعربية (نموذج AraBERT).
- **التنبؤ (Prediction)**: ترشيح أنسب 3 تخصصات جامعية للطالب (نموذج RandomForest).

## هيكل المشروع

```
COM/
├── index.html, dashboard.html, login.html, register.html, map2.html   ← الواجهة
├── css/ , js/ , frontend/js/                                          ← أصول الواجهة
└── backend/                          ← الباك-اند الموحّد (Python / FastAPI)
    ├── app.py                        ← نقطة التشغيل — تجمع كل الراوترات
    ├── config.py                     ← المسارات والإعدادات
    ├── classification.py             ← نموذج تصنيف النصوص المسيئة + /classify
    ├── prediction.py                 ← نموذج التنبؤ بالتخصص + /recommend-major
    ├── ocr.py                        ← استخراج النص من الصور + /upload-ocr
    ├── requirements.txt
    ├── models/                       ← ملفات النماذج المدرَّبة (لا تُرفع للريبو)
    │   └── arabert_offensive_model/  ← مجلد نموذج التصنيف
    └── training/                     ← نوتبوكات التدريب والبيانات
```

## التشغيل خطوة بخطوة

### 1) تثبيت المتطلبات
```bash
cd backend
python -m venv venv
source venv/bin/activate          # على ويندوز: venv\Scripts\activate
pip install -r requirements.txt
```

لـ OCR لازم تثبتين برنامج Tesseract نفسه (مو حزمة بايثون فقط):
- **لينكس**: `sudo apt install tesseract-ocr tesseract-ocr-ara`
- **ويندوز**: نزّلي Tesseract وعدّلي `TESSERACT_CMD_WINDOWS` في `config.py` لو تغيّر مكان التثبيت.

### 2) وضع ملفات النماذج المدرَّبة

**نموذج التصنيف** — انسخي ملف الأوزان المدرَّب إلى:
```
backend/models/arabert_offensive_model/
├── config.json              ✅ موجود في الريبو
├── tokenizer.json           ✅ موجود في الريبو
├── tokenizer_config.json    ✅ موجود في الريبو
└── model.safetensors        ⬅️ انسخيه أنتِ (ملف الأوزان)
```
ملاحظة: `vocab.txt` غير مطلوب — هذا النموذج يستخدم `tokenizer.json` وهو مكتفٍ بذاته.
بدون `model.safetensors` النموذج ما يشتغل — السيرفر يقوم لكن `/classify` يرجّع خطأ 503.

**نموذج التنبؤ** — ملفات `.pkl` تتحمّل تلقائياً من Google Drive أول مرة تشغّلين السيرفر.
لو عندك الملفات محلياً، حطيها مباشرة في `backend/models/`:
`major_model.pkl`, `scaler.pkl`, `target_encoder.pkl`, `feature_encoders.pkl`.
لإعادة توليدها درّبي النموذج من `backend/training/Prediction_Model.ipynb`.

> مهم: ملفات `.pkl` مدرَّبة على `scikit-learn 1.6.1` — لا تغيّري نسخة scikit-learn
> (مثبّتة في `requirements.txt`) وإلا تطلع تحذيرات ونتائج غير موثوقة.

### 3) تشغيل السيرفر
```bash
cd backend
python app.py
```
السيرفر يشتغل على `http://localhost:8000` (نفس المنفذ اللي تناديه الواجهة).

تحققي من الحالة:
```bash
curl http://localhost:8000/health
```
لو طلع `"classification": "ready"` و `"prediction": "ready"` فالنماذج اتحمّلت صح.

## نقاط الـ API

| المسار | الطريقة | الوظيفة |
|--------|---------|---------|
| `/health` | GET | حالة السيرفر وكل نموذج |
| `/upload-ocr` | POST (ملف صورة) | استخراج نص من صورة |
| `/classify` | POST `{"text": "..."}` | تصنيف نص: مسيء / غير مسيء |
| `/recommend-major` | POST (درجات الطالب) | ترشيح أنسب 3 تخصصات |
