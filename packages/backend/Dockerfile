FROM python:3.11

WORKDIR /app

# Install build dependencies for torch/transformers + ffmpeg for audio processing + nodejs for yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ffmpeg \
    nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install PyTorch CPU-only first (avoids downloading ~2GB of NVIDIA CUDA libs)
RUN pip install --no-cache-dir --timeout 120 \
    torch==2.1.1+cpu --index-url https://download.pytorch.org/whl/cpu

# Copy and install remaining requirements (torch already satisfied, will be skipped)
COPY requirements.txt .
RUN pip install --no-cache-dir --timeout 120 -r requirements.txt

# Copy app code
COPY ./app /app/app

# Run the app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
