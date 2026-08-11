# Prazo Certo - API gratuita de remoção de fundo
# Pipeline reconstruída no padrão do projeto nadermx/backgroundremover:
#   - Modelo U^2-Net leve (u2netp) via ONNX Runtime (mesmos pesos do u2netp.pth)
#   - Pré-processamento: 320x320 + (x/255 - mean)/std (igual data_loader.ToTensorLab)
#   - Inferência: pega a saída d1 e aplica normalização MIN-MAX (função norm_pred
#     do nadermx) - NÃO usa sigmoid nem threshold fixo. Isso é o que faz o corte
#     funcionar: o ponto mais forte vira 255 (opaco) e o mais fraco vira 0.
#   - Cutout direto (naive_cutout): máscara vira canal alfa, sem morfologia.
# Inferência leve: cabe no Render free (512 MB).
#
# SEGURANÇA:
#   - Exige API key (BG_API_KEY) em Authorization: Bearer <chave>
#   - Limita tamanho do upload, valida magic bytes da imagem e bloqueia
#     "decompression bombs" via PIL MAX_IMAGE_PIXELS.
#   - Rate limit simples por IP.

import base64
import io
import os
import time

import numpy as np
import uvicorn
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from PIL import Image

MODEL_PATH = os.environ.get("MODEL_PATH", "/app/u2netp.onnx")
API_KEY = os.environ.get("BG_API_KEY", "")  # se vazio, endpoint fica bloqueado
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", 10 * 1024 * 1024))  # 10 MB
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("ALLOW_ORIGIN", "").split(",")
    if o.strip()
]

# Proteção contra bomba de descompressão (imagens gigantes com poucos bytes)
Image.MAX_IMAGE_PIXELS = int(os.environ.get("MAX_IMAGE_PIXELS", 16_000_000))

# Rate limit simples em memória (por IP): MAX_REQUESTS a cada WINDOW_SECONDS
RATE_LIMIT = {"max": int(os.environ.get("RATE_LIMIT_MAX", 10)), "window": int(os.environ.get("RATE_LIMIT_WINDOW", 60))}
_hits: dict[str, list[float]] = {}

app = FastAPI(title="Prazo Certo Background Removal", version="3.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or [],
    allow_methods=["POST"],
    allow_headers=["Authorization", "Content-Type"],
)

MAGIC = {
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG\r\n\x1a\n",
    "image/webp": b"RIFF",
}


def _client_ip(request):
    if request.client is None:
        return "unknown"
    return request.client.host


def _check_rate_limit(ip: str) -> None:
    now = time.time()
    _hits.setdefault(ip, [])
    _hits[ip] = [t for t in _hits[ip] if now - t < RATE_LIMIT["window"]]
    if len(_hits[ip]) >= RATE_LIMIT["max"]:
        raise HTTPException(status_code=429, detail="Muitas requisições. Tente novamente em instantes.")
    _hits[ip].append(now)


def _authorize(authorization: str | None) -> None:
    if not API_KEY:
        raise HTTPException(status_code=503, detail="Serviço não configurado (BG_API_KEY ausente).")
    if authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="Não autorizado.")


def _validate_image(dados: bytes) -> bytes:
    if not dados:
        raise HTTPException(status_code=400, detail="Arquivo vazio")
    if len(dados) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"Arquivo acima do limite ({MAX_UPLOAD_BYTES // (1024*1024)} MB)")
    header = dados[:16]
    mime = None
    for kind, magic in MAGIC.items():
        if header.startswith(magic):
            mime = kind
            break
    if mime is None:
        raise HTTPException(status_code=415, detail="Formato não permitido (use JPEG, PNG ou WebP).")
    return dados

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
def _norm_pred(out: np.ndarray) -> np.ndarray:
    """Equivalente ao norm_pred do nadermx: normalização min-max."""
    lo = float(out.min())
    hi = float(out.max())
    if hi - lo < 1e-6:
        hi = lo + 1.0
    return (out - lo) / (hi - lo)


def _predict_mask(img: Image.Image) -> Image.Image:
    """Retorna máscara L (0-255) no tamanho original, pipeline nadermx."""
    original_size = img.size
    resized = img.resize((320, 320), Image.BILINEAR)
    x = np.asarray(resized, dtype=np.float32) / 255.0
    x = (x - MEAN) / STD
    x = x.transpose(2, 0, 1)[None, ...].astype(np.float32)  # 1,3,320,320

    session = get_session()
    input_name = session.get_inputs()[0].name
    out = np.squeeze(session.run(None, {input_name: x})[0]).astype(np.float32)
    if out.ndim != 2:
        out = out[0]

    mask = _norm_pred(out)
    mask_img = Image.fromarray((mask * 255.0).astype(np.uint8), mode="L")
    return mask_img.resize(original_size, Image.LANCZOS)


def remove_background(image_bytes: bytes) -> bytes:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    mask = _predict_mask(img)

    # naive_cutout: aplica a máscara como canal alfa
    rgba = img.convert("RGBA")
    rgba.putalpha(mask)

    buffer = io.BytesIO()
    rgba.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


@app.get("/")
async def root():
    return {"status": "ok", "servico": "Remocao de fundo (U2-Net + nadermx pipeline)"}


@app.post("/remover-fundo/")
async def remover_fundo(request: Request, file: UploadFile = File(...)):
    _check_rate_limit(_client_ip(request))
    _authorize(request.headers.get("authorization"))
    dados = _validate_image(await file.read())
    try:
        png = remove_background(dados)
    except Exception as exc:  # noqa: BLE001
        return {"erro": f"Falha ao processar: {exc}"}
    return StreamingResponse(
        io.BytesIO(png),
        media_type="image/png",
        headers={"Content-Disposition": "attachment; filename=sem_fundo.png"},
    )


@app.post("/debug/")
async def debug(request: Request, file: UploadFile = File(...)):
    _check_rate_limit(_client_ip(request))
    _authorize(request.headers.get("authorization"))
    dados = _validate_image(await file.read())
    """Diagnóstico: estatísticas da máscara + preview em base64 (256px)."""
    dados = await file.read()
    if not dados:
        return {"erro": "Arquivo vazio"}

    try:
        img = Image.open(io.BytesIO(dados)).convert("RGB")
        mask = _predict_mask(img)

        arr = np.asarray(mask, dtype=np.float32) / 255.0
        stats = {
            "tamanho_original": list(img.size),
            "mask_min": float(arr.min()),
            "mask_max": float(arr.max()),
            "mask_media": float(arr.mean()),
            "pct_opaco_gt_0.5": float((arr > 0.5).mean() * 100.0),
            "pct_transparente_lt_0.1": float((arr < 0.1).mean() * 100.0),
        }

        preview = mask.resize((256, 256), Image.LANCZOS)
        buf = io.BytesIO()
        preview.save(buf, format="PNG")
        preview_b64 = base64.b64encode(buf.getvalue()).decode()

        return JSONResponse(content={"stats": stats, "mask_preview_png": preview_b64})
    except Exception as exc:  # noqa: BLE001
        return {"erro": f"Falha ao processar: {exc}"}


if __name__ == "__main__":
    porta = int(os.environ.get("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=porta, workers=1)
