from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os
# استيراد دالتك من ملف main
from main import process_masari_final_complete 

app = FastAPI()

# هذا السطر هو "السر" اللي يخلي الواجهة تضبط وتتصل بالكود
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # يسمح لأي واجهة HTML تتصل فيه
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/extract")
async def extract_api(file: UploadFile = File(...)):
    # حفظ الصورة اللي جت من الواجهة
    with open("temp_image.jpg", "wb") as f:
        f.write(await file.read())
    
    # تشغيل كودك حق مساري
    result = process_masari_final_complete("temp_image.jpg")
    
    return result

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=7860)