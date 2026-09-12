# MCOP Workflow Reports

A runnable first revenue product for KullAILABS: a customer uploads structured AI workflow logs, pays once, and automatically receives a diagnostic report with MCOP integrity receipts. The reference price is **CAD $29**, configurable in integer cents. This is an unvalidated offer and price, not a claim of market demand or future earnings.

## What is implemented

- Customer storefront, sample input, JSON import, explicit service terms, recovery-file download, and private report delivery.
- Stripe hosted one-time checkout. Prices come from the server; the browser cannot set them.
- Verified raw-body Stripe webhooks; order/session, amount, currency, environment, and payment-status checks before fulfillment.
- Durable SQLite orders, transactional single delivery, Stripe idempotency keys, restart recovery worker, and authenticated metrics.
- Real imports of the existing MCOP Python encoder, Stigmergy memory, Holographic Etch, canonical digest, reasoning sessions, and receipt verifier. No copied or simulated MCOP algorithms.
- No paid model calls: the diagnostic rules run locally. Per-report operating costs still include hosting, payment processing, support, and customer acquisition.

## Start the free local demo

From the repository root (Python 3.12 tested):

```bash
python3 -m venv .venv-revenue
. .venv-revenue/bin/activate
python -m pip install -r services/revenue/requirements.txt
PYTHONPATH=mcop_package:. python -m uvicorn services.revenue.app:create_app --factory --host 127.0.0.1 --port 8080 --no-proxy-headers
```

Open http://127.0.0.1:8080. Load sample data, accept the terms, and generate a free report. Save the recovery download; it contains the private access token. The sample has three events, US $0.18 total submitted cost, one failed event costing US $0.075, two events without evidence, and one repeated task. These are fixture values, not customer results.

The native service defaults to `services/revenue/data/orders.sqlite3`, excluded from Git. Run the worker with the same environment and database:

```bash
PYTHONPATH=mcop_package:. python -m services.revenue.worker
```

## Test the checkout integration

1. Set `REVENUE_MODE=test`, your Stripe test secret key, a webhook signing secret, and a random `REVENUE_ADMIN_TOKEN` of at least 32 characters. Store secrets outside Git; do not paste them into issues or chat.
2. Forward Stripe events to `http://127.0.0.1:8080/api/stripe/webhook` using your Stripe development setup. Use the signing secret belonging to that endpoint/CLI listener.
3. Subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Card checkout is enabled; unpaid events do not deliver reports.
4. Complete a Stripe test checkout, return in the same browser, and download the report. Re-send the event: the same stored report should remain.
5. Stop/restart the API and worker and confirm the report remains available. Keep a copy of its root and verify the downloaded file:

```bash
PYTHONPATH=mcop_package:. python -m services.revenue.verify path/to/report.json --root YOUR_SAVED_ROOT
```

The visible summary/findings are bound to receipts. The optional independently retained root prevents accepting a fully replaced bundle. The verifier does not attest the truth of input logs, the report title, or supplemental triad metadata.

Stripe implementation references: [fulfillment](https://docs.stripe.com/checkout/fulfillment) and [raw-body signature verification](https://docs.stripe.com/webhooks/signature).

## Deploy a single persistent instance

```bash
cp services/revenue/.env.example services/revenue/.env
# Edit the file with your environment settings.
docker compose -f services/revenue/compose.yaml up --build -d
```

Compose includes API and recovery worker, restart policies, and a shared persistent volume. The host port is bound to loopback. Put your HTTPS reverse proxy in front of it. This container workflow is supplied but has not been executed in the authoring environment.

Before accepting real payments:

- Configure your own activated Stripe account and payout destination in Stripe. This service cannot create customers or guarantee payouts.
- Set `REVENUE_MODE=live`, matching live credentials, HTTPS `REVENUE_PUBLIC_URL`, and a working `REVENUE_SUPPORT_EMAIL`. Register the live webhook endpoint. The service refuses incomplete live configuration.
- Review the offer, price, service terms, privacy handling, refund process, and any applicable tax requirements. Automatic tax calculation is **not implemented**; do not represent it as included. Obtain suitable advice for your sales situation.
- Use one persistent host with local SQLite storage, not ephemeral serverless storage or a network-mounted SQLite database. Keep private encrypted backups, monitor `/health` and worker logs, and protect the database with filesystem permissions.
- Configure an edge request limit and per-client rate limiting. Built-in order creation is capped at 20 orders per peer IP/hour. Behind a proxy this becomes a shared limit; the app deliberately ignores forwarded headers. Protect against oversized/slow connections at the proxy too.
- Test recovery from a real backup and an end-to-end Stripe test payment before switching modes. Keep test and live databases separate.

No public deployment, Stripe-account configuration, real payment, payout, paid advertising, or outreach was performed as part of this implementation.

## Operations and explicit limits

`GET /api/admin/metrics` requires `Authorization: Bearer <REVENUE_ADMIN_TOKEN>`. It separates demo, test, and live totals. Gross collected checkout amounts exclude payment fees, refunds, disputes, taxes, and operating expenses; **they are not profit or payout totals**. Use Stripe for refunds, disputes, receipts, accounting reconciliation, and payout status. Refunded report access is not automatically revoked.

The recovery worker retries committed paid orders every 30 seconds. Webhook delivery retries and authenticated customer polling also recover fulfillment. Orders whose Checkout session expired must be recreated; the current product has no subscription renewals or recurring billing. If a checkout session is created remotely but the API crashes before recording its ID, repeat checkout on the same order to recover using its idempotency key, then retry the webhook.

Customer data persists until the operator deletes it; there is no automatic retention policy in v1. Honor deletion requests by securely deleting the matching order and managing backup retention; do not put client data into Git. Configure disk monitoring and regular cleanup of abandoned unpaid orders. Recovery files are bearer credentials; anyone with a file can read that report. There is no email delivery, account recovery, or marketing subscription. The browser uses text-only rendering, a restrictive content-security policy, no-referrer headers, and no third-party scripts.

This is a rules-based report, not an LLM or semantic audit. It cannot prove that an answer is factual. MCOP hash-based encoding is used for provenance, not semantic similarity; repeated-task detection is exact string comparison. Memory is isolated per order rather than shared across customers. GPU, ARC challenge, research branches, and unrelated provider adapters are not executed during paid fulfillment.

## Tests

```bash
python -m pip install pytest
PYTHONPATH=mcop_package:. python -m pytest services/revenue/tests mcop_package/tests/test_flagship_triad.py mcop_package/tests/parity/test_reasoning_receipts_parity.py -q
```

Tests cover real MCOP diagnostics and tampering, private access, persistence, checkout idempotency and server pricing, forged/stale signatures, unpaid/mismatched events, concurrent duplicates, post-payment crashes, automatic recovery, input limits, throttling, admin isolation, and live configuration. Stripe network calls are mocked; signed webhook tests use the real Stripe SDK. A live processor round trip still needs your test account.

## First customers and economics

Target an initial narrow use case: agencies and developers who already export structured AI workflow execution logs and need a repeatable report for internal review or client handoff. The local demo is the sales demonstration. Before advertising, run a pilot with willing users, compare the report to their existing tools, and ask whether the output is worth paying for. No market research establishes demand for this particular offer yet.

The code automates conversion and fulfillment after a buyer arrives. It does not automatically generate qualified traffic. Publish the offer through your existing channels or a GitHub README link after deployment; pursue outreach only when you choose the recipients and authorize sending. A custom integration service can be a separate manual offer if buyers cannot produce the schema. Do not advertise that as automated delivery.

Track actual visits → valid submissions → paid orders → successful downloads, refunds, and support minutes. v1 stores orders and gross receipts; visit/download analytics and conversion attribution are future work. Evaluate collected revenue minus processor fees, refunds, hosting, support time, and acquisition costs. CAD $29 × 10 sales = CAD $290 gross **only if those ten purchases occur**; this is arithmetic, not a forecast. Stop buying traffic if unit economics do not work.
