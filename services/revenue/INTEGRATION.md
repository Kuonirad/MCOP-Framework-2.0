# Repository integration scope

Baseline: `77a125cf4b3c2fc2373f6bcb067e5e5ba6784142` on `main`, a full Git clone containing 931 tracked files before this change. Architecture, dependency manifests, source inventory, deployment guidance, and relevant core implementations/tests were inspected. This is **not a claim that every line or every research branch was audited**.

| Repository surface | Role in this product |
| --- | --- |
| `mcop_package/mcop/triad.py` | Existing encoder, bounded Stigmergy memory, and Holographic Etch execute for each order. |
| `mcop_package/mcop/canonical_encoding.py` | Canonical digest commits the submitted input to the report. |
| `mcop_package/mcop/reasoning_receipts.py` | Existing reasoning sessions produce receipts for diagnostics; the core verifier checks them. |
| `mcop_package/mcop/merkle.py` | Existing Merkle hashing used through the receipt implementation. |
| `src/core`, `packages/core` | TypeScript counterparts remain intact; existing Python parity fixtures exercise receipt compatibility. |
| `src/app`, desktop app | Existing UI remains intact; the new paid storefront is a separately deployable service. |
| `src/adapters`, integrations | Available for later provider/export adapters; paid fulfillment does not invoke external models. |
| `services/ledger`, cluster/control/telemetry | Existing capabilities remain available; v1 commerce persistence uses local SQLite. |
| GPU/CUDA, ARC, exploratory research | Remain in the repository; not forced into a workflow-report product without a customer use case. |

The new code adds commerce and diagnostic rules, not a replacement MCOP engine. Using all code indiscriminately would add dependencies and cost without a demonstrated product benefit. Future products can integrate further modules once their customer value and runtime requirements are established.

Validation performed: 32 passing service and existing core/parity tests, JavaScript syntax check, and whitespace diff check. Browser rendering could not be checked because the cloud browser rejected access to the local server. Docker deployment, external Stripe checkout, bank payouts, and the whole-repository test suite were not run.
