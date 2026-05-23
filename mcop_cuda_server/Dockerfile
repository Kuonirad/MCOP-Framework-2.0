# OpenSSF Scorecard requires the base image to be pinned by digest.
# Refresh with: docker buildx imagetools inspect python:3.12-slim
FROM python:3.14-slim@sha256:c845af9399020c7e562969a13689e929074a10fd057acd1b1fad06a2fb068e97 AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Hash-pinned bootstrap (pip itself) and runtime deps satisfy OpenSSF
# Scorecard's Pinned-Dependencies check. Regenerate the lock files via:
#   python -m piptools compile --allow-unsafe --generate-hashes \
#     -o .github/requirements/pip-bootstrap.txt \
#     .github/requirements/pip-bootstrap.in
#   python -m piptools compile --allow-unsafe --generate-hashes \
#     -o .github/requirements/cuda-server-runtime.txt \
#     .github/requirements/cuda-server-runtime.in
COPY .github/requirements/pip-bootstrap.txt /tmp/pip-bootstrap.txt
COPY .github/requirements/cuda-server-runtime.txt /tmp/cuda-server-runtime.txt

RUN python -m pip install --no-cache-dir --require-hashes --no-deps -r /tmp/pip-bootstrap.txt && \
    python -m pip install --no-cache-dir --require-hashes -r /tmp/cuda-server-runtime.txt

COPY mcop_cuda_server/ /app/mcop_cuda_server/
COPY mcop_package/ /app/mcop_package/

# Expose the in-repo ``mcop`` package via PYTHONPATH instead of pip-installing
# it. This eliminates the last unpinned ``pip install`` from the image (the
# previous ``pip install --no-deps ./mcop_package`` step was flagged by OSSF
# Scorecard's Pinned-Dependencies check because a local source path cannot
# carry a sha256 hash, and ``--require-hashes`` is incompatible with editable
# / local-source installs). Runtime third-party deps are still installed via
# ``--require-hashes`` from /tmp/cuda-server-runtime.txt above; this step
# only adds the in-repo Python source to the import path, mirroring how
# ``mcop_cuda_server`` itself is already exposed (no pip install, imported
# directly from the WORKDIR copy via ``python -m mcop_cuda_server``).
ENV PYTHONPATH=/app:/app/mcop_package

EXPOSE 8765

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8765/health', timeout=2).status == 200 else 1)" || exit 1

ENV MCOP_CUDA_HOST=0.0.0.0 \
    MCOP_CUDA_PORT=8765

CMD ["python", "-m", "mcop_cuda_server", "--host", "0.0.0.0", "--port", "8765"]
