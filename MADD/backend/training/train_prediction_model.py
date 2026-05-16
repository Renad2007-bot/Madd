"""
تدريب نموذج التنبؤ بالتخصص الجامعي (RandomForest).
المدخلات : backend/training/Acadimic Dataset.csv
المخرجات : backend/models/major_model.pkl
           backend/models/scaler.pkl
           backend/models/target_encoder.pkl
           backend/models/feature_encoders.pkl

التشغيل:
    cd backend
    python training/train_prediction_model.py
"""

import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler

BASE_DIR    = Path(__file__).resolve().parent.parent
DATA_PATH   = BASE_DIR / "training" / "Acadimic Dataset.csv"
MODELS_DIR  = BASE_DIR / "models"


def main():
    if not DATA_PATH.exists():
        print(f"❌ ملف البيانات غير موجود: {DATA_PATH}")
        sys.exit(1)

    print("📂 تحميل البيانات...")
    df = pd.read_csv(DATA_PATH)
    df = df.drop_duplicates().dropna()
    print(f"   الصفوف: {len(df)}")

    TARGET_COLUMN = "Suggested_Major"
    X = df.drop(columns=[TARGET_COLUMN])
    y = df[TARGET_COLUMN]

    # ترميز المتغيرات النصية
    feature_encoders = {}
    for col in X.select_dtypes(include=["object"]).columns:
        enc = LabelEncoder()
        X[col] = enc.fit_transform(X[col])
        feature_encoders[col] = enc

    # ترميز الهدف
    target_encoder = LabelEncoder()
    y_encoded = target_encoder.fit_transform(y)

    # تطبيع البيانات
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # تقسيم التدريب والاختبار
    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
    )

    print("⏳ جاري تدريب نموذج RandomForest...")
    model = RandomForestClassifier(n_estimators=500, max_features="sqrt", random_state=42, n_jobs=-1)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    f1  = f1_score(y_test, y_pred, average="weighted")
    print(f"\n✅ الدقة: {acc:.4f} | F1: {f1:.4f}")
    print(classification_report(y_test, y_pred, target_names=target_encoder.classes_))

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(model,            MODELS_DIR / "major_model.pkl")
    joblib.dump(scaler,           MODELS_DIR / "scaler.pkl")
    joblib.dump(target_encoder,   MODELS_DIR / "target_encoder.pkl")
    joblib.dump(feature_encoders, MODELS_DIR / "feature_encoders.pkl")
    print(f"\n💾 الملفات محفوظة في: {MODELS_DIR}")


if __name__ == "__main__":
    main()
