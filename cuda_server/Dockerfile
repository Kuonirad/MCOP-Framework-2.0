FROM python:3.12-slim

WORKDIR /app
COPY pyproject.toml /app/
COPY mcop_cuda_server /app/mcop_cuda_server

RUN pip install --no-cache-dir -e .

EXPOSE 8765
CMD ["python", "-m", "mcop_cuda_server", "--host", "0.0.0.0", "--port", "8765"]
