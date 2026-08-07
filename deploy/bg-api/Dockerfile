FROM python:3.11-slim

WORKDIR /app

# libgomp para onnxruntime
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pré-baixa o modelo u2netp.onnx (~4,7 MB) na build
RUN python -c "import urllib.request; urllib.request.urlretrieve('https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx', '/app/u2netp.onnx')"

COPY app.py .

EXPOSE 8000

CMD ["python", "app.py"]
