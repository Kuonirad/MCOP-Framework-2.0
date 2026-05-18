"""API tests for ``mcop_cuda_server``."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from mcop_cuda_server.app import create_app


@pytest.fixture()
def client() -> TestClient:
    return TestClient(create_app())


def test_health(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["service"] == "mcop_cuda_server"


def test_capabilities(client: TestClient) -> None:
    r = client.get("/capabilities")
    assert r.status_code == 200
    body = r.json()
    assert "cudaAvailable" in body
    assert body["provider"] == "microservice"


def test_encode_identity(client: TestClient) -> None:
    r = client.post(
        "/cuda/nova-neo-encode",
        json={"input": {"tensor": [1.0, 2.0, 3.0], "dtype": "float32"}},
    )
    assert r.status_code == 200
    assert r.json()["output"] == [1.0, 2.0, 3.0]


def test_proteome_graph_csr(client: TestClient) -> None:
    graph = {
        "nodeCount": 2,
        "rowPtr": [0, 2, 4],
        "colIdx": [0, 1, 0, 1],
        "weights": [1.0, 1.0, 1.0, 1.0],
    }
    r = client.post(
        "/cuda/proteome-graph-step",
        json={"input": {"graph": graph, "input": [10.0, 20.0], "dtype": "float32"}},
    )
    assert r.status_code == 200
    out = r.json()["output"]
    assert len(out) == 2


def test_holographic_rank1(client: TestClient) -> None:
    r = client.post(
        "/cuda/holographic-write",
        json={"input": {"context": [1.0, 2.0], "synthesisVector": [3.0, 4.0], "dtype": "float32"}},
    )
    assert r.status_code == 200
    assert r.json()["output"] == [3.0, 4.0, 6.0, 8.0]


def test_meta_dry_run(client: TestClient) -> None:
    r = client.post(
        "/cuda/meta-dry-run",
        json={"input": {"projectedGain": 0.42}},
    )
    assert r.status_code == 200
    assert r.json()["projectedGain"] == 0.42


def test_nova_evolve_candidates(client: TestClient) -> None:
    r = client.post(
        "/cuda/nova-evolve-score",
        json={"input": {"candidates": [{"score": 1}, {"score": 2}]}},
    )
    assert r.status_code == 200
    assert r.json()["scores"] == [1.0, 2.0]


def test_cosine_recall(client: TestClient) -> None:
    r = client.post(
        "/cuda/cosine-recall",
        json={
            "input": {
                "query": [1.0, 0.0, 0.0],
                "bank": [1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
                "dim": 3,
                "bankRows": 2,
            },
        },
    )
    assert r.status_code == 200
    body = r.json()
    assert body["output"][0] == pytest.approx(1.0)
    assert body["bestIndex"] == 0


def test_homeostasis(client: TestClient) -> None:
    r = client.post(
        "/cuda/homeostasis",
        json={
            "input": {
                "state": [1.0, 2.0],
                "drive": [0.0, 0.0],
                "setpoint": [0.0, 0.0],
                "decay": 0.5,
                "bound": 10.0,
            },
        },
    )
    assert r.status_code == 200
    assert len(r.json()["output"]) == 2


def test_unknown_op(client: TestClient) -> None:
    r = client.post("/cuda/not-an-op", json={"input": {}})
    assert r.status_code == 404
