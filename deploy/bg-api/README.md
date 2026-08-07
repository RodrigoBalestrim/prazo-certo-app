---
title: Prazo Certo Background Removal
emoji: 🎨
colorFrom: green
colorTo: green
sdk: docker
pinned: false
app_port: 7860
---

# Prazo Certo — Remoção de fundo gratuita

API gratuita de remoção de fundo (modelo U²-Net portátil via `rembg`), usada pelo app Prazo Certo.

> **Nota:** o Hugging Face agora exige assinatura PRO para Spaces com Docker. Por isso usamos o **Render** (plano gratuito, 512 MB) com o modelo `u2netp` (~4,7 MB), que cabe com folga.

## Endpoint

`POST /remover-fundo/` — envie a imagem no campo `file` (multipart) e receba o PNG com fundo transparente.

## Deploy no Render (grátis)

1. Envie a pasta `deploy/bg-api/` para o repositório GitHub do projeto (o `render.yaml` já está incluído).
2. Em [render.com](https://render.com) (login com GitHub, grátis) → **New +** → **Blueprint**.
3. Selecione o repositório `prazo-certo-app`.
4. O Render detecta o `render.yaml`, cria o serviço e faz o build automaticamente.
5. A URL fica em `https://prazo-certo-bg-api.onrender.com` — use como `BG_API_URL` no Supabase.

## Testar

```bash
curl -X POST https://prazo-certo-bg-api.onrender.com/remover-fundo/ \
  -F "file=@foto.jpg" -o sem_fundo.png
```
