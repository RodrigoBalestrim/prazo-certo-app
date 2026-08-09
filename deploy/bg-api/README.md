---
title: Prazo Certo Background Removal
emoji: 🎨
colorFrom: green
colorTo: green
sdk: docker
pinned: false
app_port: 8000
---

# Prazo Certo — Remoção de fundo gratuita

API gratuita de remoção de fundo usada pelo app Prazo Certo.

Pipeline baseada no projeto [nadermx/backgroundremover](https://github.com/nadermx/backgroundremover):

- Modelo U²-Net leve (`u2netp`, ~4,7 MB) via ONNX Runtime
- Sigmoid único na saída (corrige o bug do fundo semitransparente)
- Pós-processamento com scikit-image: remove objetos pequenos, fecha buracos, morfologia
- Suavização de borda (feathering) — alpha limpo, sem serrilhado

Roda de graça no Render (512 MB).

## Endpoint

`POST /remover-fundo/` — envie a imagem no campo `file` (multipart) e receba o PNG com fundo transparente.

## Deploy no Render (grátis)

1. Envie a pasta `deploy/bg-api/` para o repositório GitHub do projeto (o `render.yaml` já está incluído).
2. Em [render.com](https://render.com) (login com GitHub, grátis) → **New +** → **Blueprint**.
3. Selecione o repositório `prazo-certo-app`.
4. O Render detecta o `render.yaml`, cria o serviço e faz o build automaticamente.
5. A URL fica em `https://prazo-certo-app.onrender.com` — use como `BG_API_URL` no Supabase.

## Testar

```bash
curl -X POST https://prazo-certo-app.onrender.com/remover-fundo/ \
  -F "file=@foto.jpg" -o sem_fundo.png
```