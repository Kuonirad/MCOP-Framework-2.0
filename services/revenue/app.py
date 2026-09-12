# SPDX-License-Identifier: Apache-2.0
"""Single-instance paid report service with transactional fulfillment."""
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

import stripe
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from starlette.concurrency import run_in_threadpool

from .report import Submission, build_report

ROOT = Path(__file__).parent


class Settings:
    def __init__(self):
        self.mode = os.getenv("REVENUE_MODE", "demo")
        self.db = os.getenv("REVENUE_DB", "services/revenue/data/orders.sqlite3")
        self.url = os.getenv("REVENUE_PUBLIC_URL", "http://127.0.0.1:8080").rstrip("/")
        self.key = os.getenv("STRIPE_SECRET_KEY", "")
        self.secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
        self.amount = int(os.getenv("REVENUE_PRICE_CENTS", "2900"))
        self.currency = "cad"
        self.admin = os.getenv("REVENUE_ADMIN_TOKEN", "")
        self.support = os.getenv("REVENUE_SUPPORT_EMAIL", "")
        if self.mode not in {"demo", "test", "live"} or not 100 <= self.amount <= 100000:
            raise ValueError("Invalid mode or price (100–100000 CAD cents)")
        if self.mode != "demo":
            prefix = "sk_live_" if self.mode == "live" else "sk_test_"
            if not self.key.startswith(prefix) or not self.secret.startswith("whsec_"):
                raise ValueError("Stripe credentials must match REVENUE_MODE")
            if len(self.admin) < 32:
                raise ValueError("Configure a strong REVENUE_ADMIN_TOKEN")
        if self.mode == "live" and (not self.url.startswith("https://") or "@" not in self.support):
            raise ValueError("Live mode requires HTTPS public URL and support email")


@contextmanager
def database(settings):
    conn = sqlite3.connect(settings.db, timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        with conn:
            yield conn
    finally:
        conn.close()


def initialize(settings):
    Path(settings.db).parent.mkdir(parents=True, exist_ok=True)
    with database(settings) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.executescript('''
          CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, payload TEXT NOT NULL,
            amount INTEGER NOT NULL, currency TEXT NOT NULL, mode TEXT NOT NULL,
            status TEXT NOT NULL, session_id TEXT UNIQUE, report TEXT,
            created INTEGER NOT NULL, paid_at INTEGER);
          CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, received INTEGER NOT NULL);
          CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL);
        ''')


def authorize(db, order_id, token):
    row = db.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
    if not row or not hmac.compare_digest(row["token_hash"], hashlib.sha256(token.encode()).hexdigest()):
        raise HTTPException(404, "Order not found")
    return row


def fulfill(settings, order_id):
    # Reports are bounded local computation; transaction prevents concurrent deliveries.
    # A crash rolls back, leaving the paid order available for automatic retry.
    with database(settings) as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
        if row and row["status"] == "paid":
            report = build_report(Submission.model_validate_json(row["payload"]))
            db.execute("UPDATE orders SET status='complete', report=? WHERE id=?",
                       (json.dumps(report), order_id))


def accept_payment(settings, event):
    if event["type"] not in {"checkout.session.completed", "checkout.session.async_payment_succeeded"}:
        return
    session = event["data"]["object"]
    if session.get("payment_status") != "paid":
        return
    order_id = session.get("client_reference_id")
    with database(settings) as db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT * FROM orders WHERE id=?", (order_id,)).fetchone()
        if not row:
            raise HTTPException(400, "Unknown order")
        if (settings.mode == "demo" or row["mode"] != settings.mode
                or bool(event.get("livemode")) != (settings.mode == "live")
                or session.get("id") != row["session_id"]
                or session.get("amount_total") != row["amount"]
                or session.get("currency") != row["currency"]
                or session.get("mode") != "payment"):
            raise HTTPException(400, "Payment does not match order")
        db.execute("INSERT OR IGNORE INTO events VALUES (?, ?)", (event["id"], int(time.time())))
        db.execute("UPDATE orders SET status='paid', paid_at=? WHERE id=? AND status='pending'",
                   (int(time.time()), order_id))
    fulfill(settings, order_id)


def create_app(settings=None):
    settings = settings or Settings()
    initialize(settings)
    app = FastAPI(title="MCOP Workflow Reports", docs_url=None, redoc_url=None)

    @app.middleware("http")
    async def protections(request, call_next):
        # Bound actual streamed bytes, including requests without Content-Length.
        if request.method == "POST":
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 750_000:
                    return JSONResponse({"detail": "Request too large"}, status_code=413)
            request._body = bytes(body)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'"
        return response

    @app.get("/")
    def home():
        return FileResponse(ROOT / "static/index.html")

    @app.get("/app.js")
    def javascript():
        return FileResponse(ROOT / "static/app.js", media_type="application/javascript")

    @app.get("/style.css")
    def stylesheet():
        return FileResponse(ROOT / "static/style.css", media_type="text/css")

    @app.get("/api/catalog")
    def catalog():
        return {"name": "MCOP Workflow Report", "amount": settings.amount,
                "currency": settings.currency, "mode": settings.mode, "support": settings.support}

    @app.get("/api/sample")
    def sample():
        return json.loads((ROOT / "sample.json").read_text())

    @app.get("/health")
    def health():
        with database(settings) as db:
            db.execute("SELECT 1")
        return {"status": "ok", "mode": settings.mode}

    @app.post("/api/orders")
    def order(data: Submission, request: Request):
        # Durable per-peer/hour throttle. Never trust arbitrary forwarded headers.
        peer = request.client.host if request.client else "unknown"
        bucket = f"{int(time.time()) // 3600}:{hashlib.sha256(peer.encode()).hexdigest()}"
        with database(settings) as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("DELETE FROM rate_limits WHERE key < ?", (f"{int(time.time()) // 3600}:",))
            db.execute("INSERT INTO rate_limits VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1", (bucket,))
            count = db.execute("SELECT count FROM rate_limits WHERE key=?", (bucket,)).fetchone()[0]
        if count > 20:
            raise HTTPException(429, "Order limit reached; please try later")
        order_id, token = secrets.token_hex(16), secrets.token_urlsafe(32)
        with database(settings) as db:
            db.execute("INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                       (order_id, hashlib.sha256(token.encode()).hexdigest(), data.model_dump_json(),
                        settings.amount, settings.currency, settings.mode, "pending", None, None, int(time.time()), None))
        return {"id": order_id, "token": token}

    @app.post("/api/orders/{order_id}/checkout")
    def checkout(order_id: str, request: Request):
        token = request.headers.get("Authorization", "").removeprefix("Bearer ")
        with database(settings) as db:
            row = authorize(db, order_id, token)
        if row["mode"] != settings.mode:
            raise HTTPException(409, "Order mode mismatch")
        if row["status"] != "pending":
            raise HTTPException(409, "Order already paid")
        if settings.mode == "demo":
            with database(settings) as db:
                db.execute("UPDATE orders SET status='paid' WHERE id=? AND status='pending'", (order_id,))
            fulfill(settings, order_id)
            return {"url": settings.url + "/#order=" + order_id, "demo": True}
        try:
            session = stripe.checkout.Session.create(
                api_key=settings.key, idempotency_key="mcop-report-" + order_id,
                mode="payment", payment_method_types=["card"], client_reference_id=order_id,
                line_items=[{"price_data": {"currency": row["currency"], "unit_amount": row["amount"],
                             "product_data": {"name": "MCOP Workflow Report"}}, "quantity": 1}],
                success_url=settings.url + "/#order=" + order_id,
                cancel_url=settings.url + "/#order=" + order_id)
        except stripe.StripeError as exc:
            raise HTTPException(502, "Checkout unavailable; retry this order") from exc
        with database(settings) as db:
            db.execute("UPDATE orders SET session_id=? WHERE id=?", (session.id, order_id))
        return {"url": session.url, "demo": False}

    @app.post("/api/stripe/webhook")
    async def webhook(request: Request):
        if settings.mode == "demo":
            raise HTTPException(503, "Payments disabled")
        try:
            event = stripe.Webhook.construct_event(await request.body(), request.headers.get("Stripe-Signature", ""), settings.secret)
        except (ValueError, stripe.SignatureVerificationError) as exc:
            raise HTTPException(400, "Invalid webhook") from exc
        await run_in_threadpool(accept_payment, settings, event.to_dict())
        return {"received": True}

    @app.get("/api/orders/{order_id}")
    def result(order_id: str, request: Request):
        token = request.headers.get("Authorization", "").removeprefix("Bearer ")
        with database(settings) as db:
            row = authorize(db, order_id, token)
        if row["status"] == "paid":
            fulfill(settings, order_id)
            with database(settings) as db:
                row = authorize(db, order_id, token)
        return {"id": order_id, "status": row["status"], "mode": row["mode"],
                "report": json.loads(row["report"]) if row["report"] else None}

    @app.get("/api/admin/metrics")
    def metrics(request: Request):
        token = request.headers.get("Authorization", "").removeprefix("Bearer ")
        if not settings.admin or not hmac.compare_digest(token, settings.admin):
            raise HTTPException(404, "Not found")
        with database(settings) as db:
            rows = db.execute("SELECT mode,status,COUNT(*) AS orders,SUM(CASE WHEN paid_at IS NOT NULL THEN amount ELSE 0 END) AS gross_cents FROM orders GROUP BY mode,status").fetchall()
        return {"currency": settings.currency, "groups": [dict(r) for r in rows],
                "note": "Gross checkout receipts before fees, refunds, taxes and expenses; not profit or bank payouts."}

    return app
