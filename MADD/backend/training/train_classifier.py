"""
تدريب نموذج تصنيف النصوص المسيئة بالعربية.
المدخلات : backend/training/Arabic.csv
المخرجات : backend/models/arabic_classifier.pkl

التشغيل:
    cd backend
    python training/train_classifier.py
"""

import re
import sys
from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

BASE_DIR   = Path(__file__).resolve().parent.parent
DATA_PATH  = BASE_DIR / "training" / "Arabic.csv"
MODEL_PATH = BASE_DIR / "models" / "arabic_classifier.pkl"


def clean(text: str) -> str:
    text = str(text)
    text = re.sub(r"http\S+|@\w+|#", "", text)
    text = re.sub(r"[إأآا]", "ا", text)
    text = re.sub(r"ى", "ي", text)
    text = re.sub(r"ة", "ه", text)
    text = re.sub(r"(.)\1{2,}", r"\1\1", text)
    return re.sub(r"\s+", " ", text).strip()


def main():
    if not DATA_PATH.exists():
        print(f"❌ ملف البيانات غير موجود: {DATA_PATH}")
        sys.exit(1)

    print("📂 تحميل البيانات...")
    df = pd.read_csv(DATA_PATH).dropna(subset=["tweet", "label"])
    df["label_bin"] = (df["label"].str.strip() == "offensive").astype(int)
    df["clean"]     = df["tweet"].apply(clean)

    print(f"   المجموع: {len(df)} | not: {(df.label_bin==0).sum()} | offensive: {(df.label_bin==1).sum()}")

    X_train, X_test, y_train, y_test = train_test_split(
        df["clean"], df["label_bin"],
        test_size=0.2, random_state=42, stratify=df["label_bin"]
    )

    model = Pipeline([
        ("tfidf", TfidfVectorizer(
            ngram_range=(1, 3),
            max_features=50000,
            sublinear_tf=True,
            analyzer="char_wb",
            min_df=2,
        )),
        ("clf", LogisticRegression(
            C=5.0,
            max_iter=1000,
            class_weight="balanced",
            solver="lbfgs",
        )),
    ])

    print("⏳ جاري التدريب...")
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    print(f"\n✅ الدقة الكلية: {accuracy_score(y_test, y_pred):.1%}")
    print(classification_report(y_test, y_pred, target_names=["not", "offensive"]))

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    print(f"💾 النموذج محفوظ في: {MODEL_PATH}")


if __name__ == "__main__":
    main()
