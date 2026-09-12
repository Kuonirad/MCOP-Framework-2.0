FROM python:3.12-slim
WORKDIR /app
COPY services/revenue/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt
COPY mcop_package/mcop /app/mcop_package/mcop
COPY services/revenue/*.py services/revenue/sample.json /app/services/revenue/
COPY services/revenue/static /app/services/revenue/static
ENV PYTHONPATH=/app/mcop_package:/app PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 REVENUE_DB=/data/orders.sqlite3
RUN useradd --uid 10001 --create-home mcop && mkdir /data && chown mcop /data
USER mcop
EXPOSE 8080
CMD ["python", "-m", "uvicorn", "services.revenue.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8080", "--no-proxy-headers"]
