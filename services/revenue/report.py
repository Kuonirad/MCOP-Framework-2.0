# SPDX-License-Identifier: Apache-2.0
"""Deterministic workflow diagnostics backed by the repository's MCOP core."""
from collections import Counter
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from mcop import NovaNeoEncoder, StigmergyV5, HolographicEtch
from mcop.canonical_encoding import canonical_digest
from mcop.reasoning_receipts import ReasoningSession, verify_receipt


class Event(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    task: str = Field(min_length=1, max_length=1000)
    status: Literal["ok", "error"]
    cost_microusd: int = Field(ge=0, le=1_000_000_000)
    latency_ms: int = Field(ge=0, le=86_400_000)
    evidence_count: int = Field(ge=0, le=10_000)


class Submission(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    title: str = Field(min_length=1, max_length=120)
    events: list[Event] = Field(min_length=1, max_length=500)


def build_report(data: Submission) -> dict:
    source = data.model_dump()
    counts = Counter(e.task for e in data.events)
    findings = []
    errors = sum(e.status == "error" for e in data.events)
    missing = sum(e.evidence_count == 0 for e in data.events)
    repeated = sum(n - 1 for n in counts.values())
    failed_cost = sum(e.cost_microusd for e in data.events if e.status == "error")
    if errors:
        findings.append({"code": "FAILED_RUNS", "count": errors,
                         "action": "Inspect failed tasks; add bounded retries and explicit fallback handling."})
    if missing:
        findings.append({"code": "NO_EVIDENCE_RECORDED", "count": missing,
                         "action": "Capture source references where factual grounding is required."})
    if repeated:
        findings.append({"code": "REPEATED_TASK_TEXT", "count": repeated,
                         "action": "Review repeated task text for cache candidates; identical text does not imply identical context."})
    slow = sum(e.latency_ms > 10_000 for e in data.events)
    if slow:
        findings.append({"code": "OVER_10_SECONDS", "count": slow,
                         "action": "Profile slow steps before changing model, batching, or concurrency."})
    encoder = NovaNeoEncoder(dimensions=64, normalize=True)
    memory = StigmergyV5(max_traces=512)
    etcher = HolographicEtch(confidence_floor=0.0)
    context = encoder.encode(canonical_digest(source))
    trace = memory.record_trace(context, list(context), {"product": "workflow-report-v1"})
    etch = etcher.apply_etch(context, list(context), note="Customer-submitted data; not independently verified")
    summary = {"event_count": len(data.events), "error_count": errors,
               "total_cost_microusd": sum(e.cost_microusd for e in data.events),
               "failed_run_cost_microusd": failed_cost,
               "total_latency_ms": sum(e.latency_ms for e in data.events),
               "missing_evidence_count": missing, "repeated_task_count": repeated}
    session = ReasoningSession(title=data.title)
    session.add_claim({"input_digest": canonical_digest(source), "rules_version": "workflow-report/1"})
    session.add_claim(summary)
    for finding in findings:
        session.add_claim(finding)
    bundle = session.export()
    if not all(verify_receipt(r).valid for r in bundle["receipts"]):
        raise RuntimeError("MCOP receipt self-verification failed")
    return {"version": "workflow-report/1", "title": data.title,
            "summary": summary, "findings": findings, "provenance": bundle,
            "mcop": {"trace_hash": trace.hash, "memory_root": memory.get_merkle_root(), "etch_hash": etch.hash},
            "limits": ["Diagnostics describe submitted data, not independently verified behavior.",
                       "Receipts prove integrity relative to their root, not truth or independent timestamping.",
                       "Repeated task text is not semantic equivalence. No savings or income are guaranteed.",
                       "Costs are customer-supplied USD millionths; latency totals are not wall-clock duration."]}
