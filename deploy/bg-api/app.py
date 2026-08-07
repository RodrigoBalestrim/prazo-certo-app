# Prazo Certo — API gratuita de remoção de fundo
# Inferência leve com ONNX Runtime (modelo u2netp) — cabe no Render free (512 MB).
# Sem rembg/scipy/opencv: só onnxruntime + Pillow + numpy.

import io
import os

import numpy as np
import uvicorn
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from PIL import Image

MODEL_PATH = os.environ.get("MODEL_PATH", "/app/u2netp.onnx")

app = FastAPI(title="Prazo Certo Background Removal", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_session = None


def get_session():
    global _session
    if _session is None:
        import onnxruntime as ort

        print(f"Carregando modelo {MODEL_PATH}...")
        _session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
        print("Modelo pronto!")
    return _session


MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def remove_background(image_bytes: bytes) -> bytes:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    original_size = img.size

    # Pré-processamento do U2Net: redimensiona p/ 320x320 e normaliza
    resized = img.resize((320, 320), Image.BILINEAR)
    x = np.asarray(resized, dtype=np.float32) / 255.0
    x = (x - MEAN) / STD
    x = x.transpose(2, 0, 1)[None, ...].astype(np.float32)  # 1,3,320,320

    session = get_session()
    input_name = session.get_inputs()[0].name
    out = session.run(None, {input_name: x})[0]  # 1,1,320,320

    mask = out[0, 0].astype(np.float32)
    mask = 1.0 / (1.0 + np.exp(-mask))  # sigmoid
    mask = np.clip(mask, 0, 1)
    mask_img = Image.fromarray((mask * 255.0).astype(np.uint8), mode="L")
    mask_img = mask_img.resize(original_size, Image.LANCZOS)

    rgba = img.convert("RGBA")
    rgba.putalpha(mask_img)

    buffer = io.BytesIO()
    rgba.save(buffer, format="PNG")
    return buffer.getvalue()


@app.get("/")
async def root():
    return {"status": "ok", "servico": "Remocao de fundo gratuita (U2-Net)"}


@app.post("/remover-fundo/")
async def remover_fundo(file: UploadFile = File(...)):
    dados = await file.read()
    if not dados:
        return {"erro": "Arquivo vazio"}

    png = remove_background(dados)
    return StreamingResponse(
        io.BytesIO(png),
        media_type="image/png",
        headers={"Content-Disposition": "attachment; filename=sem_fundo.png"},
    )


if __name__ == "__main__":
    porta = int(os.environ.get("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=porta, workers=1)
