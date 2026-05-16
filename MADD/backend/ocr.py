"""
استخراج النص من الصور (OCR) باستخدام Tesseract.
يوفّر راوتر فيه /upload-ocr.
"""

import io
import platform

import pytesseract
from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image, ImageEnhance

from config import TESSERACT_CMD_WINDOWS

router = APIRouter(tags=["ocr"])

if platform.system() == "Windows":
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD_WINDOWS


def preprocess_image(image: Image.Image) -> Image.Image:
    """تحسين الصورة قبل OCR: تكبير + تدرّج رمادي + تباين وحدة."""
    if image.mode != "RGB":
        image = image.convert("RGB")
    w, h = image.size
    image = image.resize((w * 2, h * 2), Image.LANCZOS)
    image = image.convert("L")
    image = ImageEnhance.Contrast(image).enhance(2.0)
    image = ImageEnhance.Sharpness(image).enhance(2.0)
    return image


@router.post("/upload-ocr")
async def ocr_process(file: UploadFile = File(...)):
    try:
        image_data = await file.read()
        image = Image.open(io.BytesIO(image_data))
        image = preprocess_image(image)
        config = r"--oem 3 --psm 6"
        text_ar = pytesseract.image_to_string(image, lang="ara", config=config)
        text_en = pytesseract.image_to_string(image, lang="eng", config=config)
        combined = (text_ar + " " + text_en).strip()
        return {"extracted_text": combined}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"فشل استخراج النص: {e}")
