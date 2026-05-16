import easyocr
import arabic_reshaper
from bidi.algorithm import get_display
import cv2
import re
import numpy as np

# 1. تهيئة المحرك
reader = easyocr.Reader(['ar', 'en'])

def fix(text):
    if not text: return ""
    text = re.sub(r'[a-zA-Z]', '', str(text))
    return get_display(arabic_reshaper.reshape(text.strip()))

def clean_name(text):
    text = re.sub(r'[^\u0600-\u06FF\s]', '', text)
    mapping = {"الكمائيات": "الكفايات", "التعتية": "التقنية", "الرذمية": "الرقمية"}
    for wrong, right in mapping.items():
        text = text.replace(wrong, right)
    return text.strip()

def process_masari_final_complete(image_path):
    img = cv2.imread(image_path)
    if img is None: return
    h, w, _ = img.shape

    # تحسين الصورة لرفع دقة الأرقام الصغيرة
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    resized = cv2.resize(gray, None, fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC)
    
    # تحديد المناطق: (المواد والدرجات ثابتة تماماً كما طلبتِ)
    table_roi = resized[int(h*2.5*0.20):int(h*2.5*0.93), int(w*2.5*0.30):int(w*2.5*0.62)]
    
    # منطقة السجل النهائي: تم توسيعها يساراً (0.45) لتشمل كافة الخانات بدقة
    summary_roi = resized[int(h*2.5*0.42):int(h*2.5*0.85), int(w*2.5*0.45):int(w*2.5*0.98)]

    table_raw = reader.readtext(table_roi)
    summary_raw = reader.readtext(summary_roi)

    extracted_data = []
    confidences = []
    
    # --- كود المواد والدرجات (الضابط والمثبت) ---
    lines = {}
    for (bbox, text, prob) in table_raw:
        y_center = int((bbox[0][1] + bbox[2][1]) / 2)
        found = False
        for ly in lines.keys():
            if abs(ly - y_center) < 30:
                lines[ly].append((bbox[0][0], text, prob))
                found = True
                break
        if not found: lines[y_center] = [(bbox[0][0], text, prob)]

    for y in sorted(lines.keys()):
        row = sorted(lines[y], key=lambda x: x[0], reverse=True)
        full_text = " ".join([item[1] for item in row])
        score = re.findall(r'\b(100|[1-9]?[0-9])\b', full_text)
        name = clean_name(re.sub(r'\d+', '', full_text))
        if len(name) > 3 and score:
            extracted_data.append(f"{name} : {score[0]}")
            confidences.append(np.mean([item[2] for item in row]))

    # --- طباعة النتائج ---
    print(f"--- {fix('مشروع مساري - التقرير الشامل')} ---")
    sections = [("الترم الأول", 7), ("الترم الثاني", 8), ("الترم الثالث", 8)]
    current_pos = 0
    for title, count in sections:
        print(f"\n{fix(title)}")
        for _ in range(count):
            if current_pos < len(extracted_data):
                print(fix(extracted_data[current_pos]))
                current_pos += 1

    # --- معالجة السجل النهائي (التعديل الحاسم للسلوك والمواظبة) ---
    print(f"\n{fix('السجل النهائي للدرجات')}")
    
    # مسميات البحث مع كلمات بديلة لزيادة دقة الربط
    target_configs = [
        {"key": "تطوع", "label": "ساعات تطوع"},
        {"key": "تراكمي", "label": "معدل تراكمي"},
        {"key": "مواظب", "label": "مواظبة"}, # البحث عن جذر الكلمة أضمن
        {"key": "موزونة", "label": "درجات موزونة"},
        {"key": "عام", "label": "تقدير عام"}
    ]

    summary_items = []
    for (bbox, text, prob) in summary_raw:
        y_center = (bbox[0][1] + bbox[2][1]) / 2
        summary_items.append({'text': text, 'y': y_center, 'prob': prob})

    results = {}
    for config in target_configs:
        key = config["key"]
        label = config["label"]
        found_val = "---"
        
        for item in summary_items:
            if key in item['text']:
                # البحث في نطاق أفقي واسع جداً (نفس مستوى السطر)
                line_candidates = []
                for other in summary_items:
                    if abs(other['y'] - item['y']) < 35: # رفع السماحية الرأسية قليلاً
                        # محاولة استخراج رقم أو تقدير نصي
                        matches = re.findall(r'\d+\.?\d*|ممتاز مرتفع|ممتاز|جيد جداً|جيد', other['text'])
                        if matches:
                            line_candidates.append({'val': matches[0], 'prob': other['prob']})
                
                if line_candidates:
                    # نأخذ القيمة الأوضح (الأعلى دقة) في السطر
                    best_match = max(line_candidates, key=lambda x: x['prob'])
                    found_val = best_match['val']
                    confidences.append(best_match['prob'])
                break
        results[label] = found_val

    # طباعة السجل النهائي بالترتيب
    display_order = ["ساعات تطوع", "معدل تراكمي", "مواظبة", "درجات موزونة", "تقدير عام"]
    for label in display_order:
        print(fix(f"{label} : {results[label]}"))

    # --- حساب الدقة النهائية ---
    if confidences:
        acc = (sum(confidences) / len(confidences)) * 100
        print(f"\n{'-'*40}\nOVERALL OCR ACCURACY: {acc:.2f}%\n{'-'*40}")

process_masari_final_complete('test.jpg')