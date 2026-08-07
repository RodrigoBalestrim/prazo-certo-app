FROM python:3.11-slim

WORKDIR /app

# libgomp para onnxruntime
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pré-baixa o modelo u2netp na BUILD (evita download lento/falho em runtime)
RUN python -c "from rembg import new_session; new_session('u2netp')"

COPY app.py .

EXPOSE 8000

CMD ["python", "app.py"]
