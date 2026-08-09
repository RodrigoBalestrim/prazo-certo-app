# Prazo Certo - API gratuita de remoção de fundo
# Pipeline reconstruída no padrão do projeto nadermx/backgroundremover:
#   - Modelo U^2-Net leve (u2netp) via ONNX Runtime
#   - Sigmoid ÚNICO na saída (o ONNX do rembg já vem com sigmoid; aplicar
#     sigmoid de novo comprime a máscara para ~0.5-0.73 e o fundo fica
#     semitransparente - era esse o bug do "fundo não foi removido")
#   - Pós-processamento com scikit-image (igual ao nadermx):
#       remove objetos pequenos, fecha buracos, abre/fecha morfológico
#   - Suavização de borda (feathering) para alpha sem serrilhado
# Inferência leve: cabe no Render free (512 MB).

import io
import os

import numpy as np
import uvicorn
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from PIL import Image
from scipy.ndimage import gaussian_filter
from skimage import morphology

MODEL_PATH = os.environ.get("MODEL_PATH", "/app/u2netp.onnx")

app = FastAPI(title="Prazo Certo Background Removal", version="3.0.0")

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
THRESHOLD = 0.4


def _post_process(mask: np.ndarray) -> np.ndarray:
    """Pós-processamento no estilo nadermx/backgroundremover (scikit-image)."""
    binary = mask > THRESHOLD

    # Remove manchas pequenas fora do produto e buracos dentro dele
    binary = morphology.remove_small_objects(binary, min_size=300)
    binary = morphology.remove_small_holes(binary, area_threshold=300)

    # Fecha e abre morfológico: borda contínua sem pontas soltas
    binary = morphology.binary_closing(binary, footprint=morphology.disk(2))
    binary = morphology.binary_opening(binary, footprint=morphology.disk(1))

    # Feathering: desfoca a borda do alpha para não ficar serrilhado
    soft = gaussian_filter(binary.astype(np.float32), sigma=1.2)
    return np.clip(soft, 0.0, 1.0).astype(np.float32)


def remove_background(image_bytes: bytes) -> bytes:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    original_size = img.size

    # Pré-processamento U2-Net: 320x320 + normalização
    resized = img.resize((320, 320), Image.BILINEAR)
    x = np.asarray(resized, dtype=np.float32) / 255.0
    x = (x - MEAN) / STD
    x = x.transpose(2, 0, 1)[None, ...].astype(np.float32)  # 1,3,320,320

    session = get_session()
    input_name = session.get_inputs()[0].name
    out = np.squeeze(session.run(None, {input_name: x})[0]).astype(np.float32)
    if out.ndim != 2:
        out = out[0]

    # O u2netp.onnx do rembg já retorna sigmoid (0..1).
    # Só aplica sigmoid de novo se a saída for logit bruto (fora de [0,1]).
    if out.min() < -0.01 or out.max() > 1.01:
        out = 1.0 / (1.0 + np.exp(-out))

    mask = _post_process(out)
    mask_img = Image.fromarray((mask * 255.0).astype(np.uint8), mode="L")
    mask_img = mask_img.resize(original_size, Image.LANCZOS)

    rgba = img.convert("RGBA")
    rgba.putalpha(mask_img)

    buffer = io.BytesIO()
    rgba.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


@app.get("/")
async def root():
    return {"status": "ok", "servico": "Remocao de fundo gratuita (U2-Net + nadermx pipeline)"}


@app.post("/remover-fundo/")
async def remover_fundo(file: UploadFile = File(...)):
    dados = await file.read()
    if not dados:
        return {"erro": "Arquivo vazio"}

    try:
        png = remove_background(dados)
    except Exception as exc:  # noqa: BLE001
        return {"erro": f"Falha ao processar: {exc}"}

    return StreamingResponse(
        io.BytesIO(png),
        media_type="image/png",
        headers={"Content-Disposition": "attachment; filename=sem_fundo.png"},
    )


if __name__ == "__main__":
    porta = int(os.environ.get("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=porta, workers=1)