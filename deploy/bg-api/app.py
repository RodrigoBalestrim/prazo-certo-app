# Prazo Certo — API gratuita de remoção de fundo
# Modelo U²-Net portátil (u2netp) + ONNX Runtime: cabe no plano gratuito
# do Render (512 MB de RAM).

import os
from io import BytesIO

import uvicorn
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from PIL import Image
from rembg import remove, new_session

app = FastAPI(title="Prazo Certo Background Removal", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modelo carregado somente na primeira chamada — evita timeout e OOM no
# startup do Render (instancia gratuita de 512 MB).
_session = None


def get_session():
    global _session
    if _session is None:
        print("Baixando/carregando modelo u2netp...")
        _session = new_session("u2netp")
        print("Modelo pronto!")
    return _session


@app.get("/")
async def root():
    return {"status": "ok", "servico": "Remocao de fundo gratuita (U2-Net portatil)"}


@app.post("/remover-fundo/")
async def remover_fundo(file: UploadFile = File(...)):
    dados = await file.read()
    if not dados:
        return {"erro": "Arquivo vazio"}

    entrada = Image.open(BytesIO(dados)).convert("RGB")
    saida = remove(entrada, session=get_session())
    buffer = BytesIO()
    saida.save(buffer, format="PNG")
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="image/png",
        headers={"Content-Disposition": "attachment; filename=sem_fundo.png"},
    )


if __name__ == "__main__":
    porta = int(os.environ.get("PORT", 8000))
    uvicorn.run("app:app", host="0.0.0.0", port=porta, workers=1)
