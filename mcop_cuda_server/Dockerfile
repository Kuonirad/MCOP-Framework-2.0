FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY mcop_cuda_server/ /app/mcop_cuda_server/
COPY mcop_package/ /app/mcop_package/

RUN pip install --upgrade pip && \
    pip install ./mcop_package && \
    pip install --no-deps -e ./mcop_cuda_server || true && \
    pip install fastapi uvicorn[standard]

EXPOSE 8765

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=2).status == 200 else 1)" || exit 1

ENV MCOP_CUDA_HOST=0.0.0.0 \
    MCOP_CUDA_PORT=8765

CMD ["python", "-m", "mcop_cuda_server", "--host", "0.0.0.0", "--port", "8765"]
