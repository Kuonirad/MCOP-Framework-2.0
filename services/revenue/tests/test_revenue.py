# SPDX-License-Identifier: Apache-2.0
import asyncio
import httpx
import hashlib
import hmac
import json
import time
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from mcop.reasoning_receipts import verify_receipt

from services.revenue import app as service
from services.revenue.report import Submission, build_report

class TestClient:
    """Exercise the actual ASGI stack without network calls."""
    __test__ = False

    def __init__(self, app):
        self.app = app

    def request(self, method, path, **kwargs):
        async def run():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test") as client:
                return await client.request(method, path, **kwargs)
        return asyncio.run(run())

    def get(self, path, **kwargs):
        return self.request("GET", path, **kwargs)

    def post(self, path, **kwargs):
        return self.request("POST", path, **kwargs)


SAMPLE = {"title": "Test", "events": [
    {"task": "a", "status": "error", "cost_microusd": 10, "latency_ms": 11000, "evidence_count": 0},
    {"task": "a", "status": "ok", "cost_microusd": 20, "latency_ms": 20, "evidence_count": 1}]}


@pytest.fixture
def setup(tmp_path, monkeypatch):
    monkeypatch.setenv("REVENUE_MODE", "demo")
    monkeypatch.setenv("REVENUE_DB", str(tmp_path / "orders.sqlite3"))
    settings = service.Settings()
    client = TestClient(service.create_app(settings))
    return settings, client


def new_order(client):
    response = client.post('/api/orders', json=SAMPLE)
    assert response.status_code == 200, response.text
    order = response.json()
    return order, {"Authorization": "Bearer " + order['token']}


def payment_order(setup):
    settings, client = setup
    settings.mode = 'test'
    order, headers = new_order(client)
    with service.database(settings) as db:
        db.execute("UPDATE orders SET session_id='cs_test_1' WHERE id=?", (order['id'],))
    event = {"id": "evt_1", "type": "checkout.session.completed", "livemode": False,
             "data": {"object": {"id": "cs_test_1", "client_reference_id": order['id'],
                      "payment_status": "paid", "mode": "payment", "amount_total": settings.amount,
                      "currency": "cad"}}}
    return settings, client, order, headers, event


def test_real_core_math_receipts_and_tampering():
    report = build_report(Submission.model_validate(SAMPLE))
    assert report['summary']['total_cost_microusd'] == 30
    assert report['summary']['failed_run_cost_microusd'] == 10
    assert report['summary']['repeated_task_count'] == 1
    assert len(report['mcop']['memory_root']) == 64
    assert all(verify_receipt(r).valid for r in report['provenance']['receipts'])
    assert report['provenance']['root'] == build_report(Submission.model_validate(SAMPLE))['provenance']['root']
    receipt = report['provenance']['receipts'][1]
    receipt['claim']['total_cost_microusd'] = 999
    assert not verify_receipt(receipt).valid


def test_demo_delivery_access_and_restart(setup):
    settings, client = setup
    order, headers = new_order(client)
    url = '/api/orders/' + order['id']
    assert client.get(url).status_code == 404
    assert client.post(url+'/checkout', headers=headers).status_code == 200
    result = TestClient(service.create_app(settings)).get(url, headers=headers).json()
    assert result['status'] == 'complete'
    assert result['report']['provenance']['receipts']
    assert client.post(url+'/checkout', headers=headers).status_code == 409
    assert client.get(url).headers['referrer-policy'] == 'no-referrer'


@pytest.mark.parametrize('field,value', [('amount_total',1),('currency','usd'),('id','cs_other'),('mode','subscription')])
def test_reject_mismatched_payment(setup, field, value):
    settings, client, order, headers, event = payment_order(setup)
    event['data']['object'][field] = value
    with pytest.raises(HTTPException): service.accept_payment(settings, event)
    assert client.get('/api/orders/'+order['id'],headers=headers).json()['status'] == 'pending'


def test_unpaid_and_wrong_mode_never_fulfilled(setup):
    settings, client, order, headers, event = payment_order(setup)
    event['data']['object']['payment_status'] = 'unpaid'
    service.accept_payment(settings,event)
    assert client.get('/api/orders/'+order['id'],headers=headers).json()['report'] is None
    event['data']['object']['payment_status'] = 'paid'
    event['livemode'] = True
    with pytest.raises(HTTPException): service.accept_payment(settings,event)


def test_concurrent_duplicate_webhooks_deliver_once(setup):
    settings, client, order, headers, event = payment_order(setup)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda _:service.accept_payment(settings,event), range(8)))
    with service.database(settings) as db:
        assert db.execute('SELECT COUNT(*) FROM events').fetchone()[0] == 1
    assert client.get('/api/orders/'+order['id'],headers=headers).json()['status'] == 'complete'


def test_failed_fulfillment_retries_after_payment_commit(setup, monkeypatch):
    settings, client, order, headers, event = payment_order(setup)
    original = service.build_report
    def fail(_): raise RuntimeError('worker interrupted')
    monkeypatch.setattr(service,'build_report',fail)
    with pytest.raises(RuntimeError): service.accept_payment(settings,event)
    with service.database(settings) as db:
        assert db.execute('SELECT status FROM orders').fetchone()[0] == 'paid'
    monkeypatch.setattr(service,'build_report',original)
    service.accept_payment(settings,event)
    assert client.get('/api/orders/'+order['id'],headers=headers).json()['status'] == 'complete'


def test_signature_verification_and_replay_tolerance(setup):
    settings, client, order, headers, event = payment_order(setup)
    settings.secret = 'whsec_test_secret'
    body = json.dumps(event).encode()
    assert client.post('/api/stripe/webhook',content=body).status_code == 400
    for offset, expected in [(-1000,400),(0,200)]:
        timestamp = str(int(time.time())+offset)
        sig = hmac.new(settings.secret.encode(), timestamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
        response=client.post('/api/stripe/webhook',content=body,headers={'Stripe-Signature':f't={timestamp},v1={sig}'})
        assert response.status_code == expected, response.text


def test_checkout_price_is_server_controlled(setup, monkeypatch):
    settings, client = setup
    settings.mode='test'
    calls=[]
    def create(**kw):
        calls.append(kw)
        return SimpleNamespace(id='cs_test_1',url='https://checkout.stripe.com/test')
    monkeypatch.setattr(service.stripe.checkout.Session,'create',create)
    order,headers=new_order(client)
    for _ in range(2):
        assert client.post('/api/orders/'+order['id']+'/checkout',headers=headers).status_code==200
    assert calls[0]['idempotency_key']==calls[1]['idempotency_key']
    assert calls[0]['line_items'][0]['price_data']['unit_amount']==2900
    assert order['token'] not in calls[0]['success_url']


def test_invalid_input_and_body_limit(setup):
    _,client=setup
    assert client.post('/api/orders',json={**SAMPLE,'price':1}).status_code==422
    assert client.post('/api/orders',content=b'x'*750001).status_code==413
    assert client.post('/api/orders',json={'title':'x','events':[]}).status_code==422
    data=json.loads(json.dumps(SAMPLE));data['events'][0]['cost_microusd']=-1
    assert client.post('/api/orders',json=data).status_code==422


def test_throttle_and_admin_separation(setup):
    settings,client=setup
    for _ in range(20):new_order(client)
    assert client.post('/api/orders',json=SAMPLE).status_code==429
    assert client.get('/api/admin/metrics').status_code==404
    settings.admin='x'*32
    metrics=client.get('/api/admin/metrics',headers={'Authorization':'Bearer '+settings.admin}).json()
    assert metrics['groups'][0]['gross_cents']==0


def test_live_startup_fails_without_configuration(monkeypatch):
    monkeypatch.setenv('REVENUE_MODE','live')
    monkeypatch.delenv('STRIPE_SECRET_KEY',raising=False)
    with pytest.raises(ValueError):service.Settings()


def test_verifier_binds_visible_report_and_external_root():
    from services.revenue.verify import verify
    report=build_report(Submission.model_validate(SAMPLE))
    assert verify(report,report['provenance']['root'])
    assert not verify(report,'0'*64)
    report['summary']=dict(report['summary'],error_count=0)
    assert not verify(report)


def test_recovery_worker_delivers_without_customer_poll(setup,monkeypatch):
    from services.revenue.worker import recover
    settings,client,order,headers,event=payment_order(setup)
    original=service.build_report
    def fail(_):raise RuntimeError('temporary')
    monkeypatch.setattr(service,'build_report',fail)
    with pytest.raises(RuntimeError):service.accept_payment(settings,event)
    monkeypatch.setattr(service,'build_report',original)
    recover(settings)
    with service.database(settings) as db:
        assert db.execute('SELECT status FROM orders').fetchone()[0]=='complete'
