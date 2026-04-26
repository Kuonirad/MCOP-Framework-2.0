# 🏛️ MCOP Framework Architecture

## Overview

The **MCOP (Meta-Cognitive Optimization Protocol) Framework** implements collective intelligence through stigmergic coordination—a mechanism where agents coordinate through environmental traces rather than direct communication.

> **Canonical expansion.** Across the repository, **MCOP** expands to
> **Meta-Cognitive Optimization Protocol**. Earlier documents and packages
> sometimes used "Multi-Cognitive Optimization Protocol" or "Meta-Cognitive
> Operating Protocol"; those are historical variants of the same project.
> See [`PLAIN_ENGLISH_GLOSSARY.md`](./PLAIN_ENGLISH_GLOSSARY.md#mcop) §1.

**Core Insight:** Just as ant colonies coordinate via pheromone trails, AI agents can coordinate through persistent "cognitive traces" in a shared memory substrate.

---

## System Components

### 1. **StigmergyV5** - Collective Memory Engine
- Stores context→synthesis mappings as "pheromone traces"
- Uses cosine similarity for pattern matching
- Merkle-chained for tamper evidence

### 2. **NovaNeoEncoder** - Context Vectorization
- Converts inputs to numerical tensors
- Entropy-based normalization
- Configurable dimensionality

### 3. **HolographicEtch** - State Change Ledger
- Append-only audit trail
- Tracks parameter evolution

---

## Key Design Decisions

### Why Cosine Similarity?
- Scale-invariant (direction > magnitude)
- Fast O(d) computation
- Ideal for semantic vectors

### Why Merkle Chains?
- Tamper-evident history
- Distributed verification
- Minimal overhead (SHA-256)

---

**See full architecture details in codebase comments and tests**
