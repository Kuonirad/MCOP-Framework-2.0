# Contributor Onboarding Guide

## 🌱 Welcome to the KullAILABS MCOP Framework Ecosystem!

This guide helps new contributors become productive members of our **collective intelligence framework**.

---

## Quick Start (30 minutes to first contribution)

### Prerequisites
- Node.js 18+ (check with `node --version`)
- Git basics
- TypeScript familiarity (not required, but helpful)

### Setup
```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/KullAILABS-MCOP-Framework-2.0
cd KullAILABS-MCOP-Framework-2.0

# 2. Install dependencies
npm install

# 3. Run tests (should see 24 passing)
npm test

# 4. Start dev server
npm run dev
```

Visit `http://localhost:3000` - if you see the Next.js welcome page, you're ready!

---

## Architecture Overview (5-Minute Mental Model)

### Core Concepts
1. **StigmergyV5** (`src/core/stigmergyV5.ts`) - Collective memory system using pheromone traces
2. **NovaNeoEncoder** (`src/core/novaNeoEncoder.ts`) - Context tensor encoding
3. **HolographicEtch** (`src/core/holographicEtch.ts`) - State change recording via Merkle chains

### Data Flow
```
User Input → NovaNeoEncoder → ContextTensor → StigmergyV5.recordTrace()
→ PheromoneTrace (hashed via Merkle) → HolographicEtch persistence
```

### Key Files Map
- `/src/core/` - Core algorithmic logic
- `/src/app/` - Next.js pages and API routes
- `/src/__tests__/` - Jest test suites
- `/src/utils/` - Shared utilities (logger, etc.)

---

## Your First Contribution (Choose Your Path)

### Path A: Fix a Bug (20 min)
**Good First Issues:** Check [Issues labeled "good first issue"](../../issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)

### Path B: Improve Tests (30 min)
**Current coverage:** 30% (see `npm run test:coverage`)
**Target:** 60%

**Quick Win:** Add tests for edge cases in `stigmergyV5.ts`:
- What happens if `context` is an empty array?
- What if `resonanceThreshold` is negative?

### Path C: Add Documentation (15 min)
**Needed:** JSDoc comments for public methods in `stigmergyV5.ts`

Example:
```typescript
/**
 * Records a pheromone trace linking context to synthesis output.
 *
 * @param context - Input context tensor (numerical representation of state)
 * @param synthesisVector - Output synthesis vector
 * @param metadata - Optional trace metadata
 * @returns PheromoneTrace with Merkle hash and cached magnitude
 *
 * @example
 * const trace = stigmergy.recordTrace([0.1, 0.2], [0.5, 0.6]);
 * console.log(trace.hash); // SHA-256 Merkle hash
 */
```

---

## Development Workflow

### Making Changes
```bash
# 1. Create feature branch
git checkout -b fix/stigmergy-empty-context

# 2. Make changes, run tests often
npm test -- --watch

# 3. Lint before committing
npm run lint

# 4. Commit with clear message
git commit -m "Fix: Handle empty context arrays in StigmergyV5"

# 5. Push and create PR
git push origin fix/stigmergy-empty-context
```

### PR Guidelines
- **Title:** Use conventional commits format (`feat:`, `fix:`, `docs:`, `test:`)
- **Description:** Explain *why* (not just *what*)
- **Tests:** All PRs must pass CI (24/24 tests)
- **Review:** Expect feedback within 48 hours

---

## Contribution Opportunities (Skill-Based)

### For TypeScript Beginners
- [ ] Add input validation to `NovaNeoEncoder`
- [ ] Write unit tests for `types.ts` interfaces
- [ ] Improve error messages in `logger.ts`

### For Algorithm Enthusiasts
- [ ] Optimize cosine similarity in `stigmergyV5.ts` (currently O(n), can we SIMD?)
- [ ] Implement alternative distance metrics (Euclidean, Manhattan)
- [ ] Add trace clustering for pattern detection

### For Security Experts
- [ ] Review Merkle hash implementation for collision resistance
- [ ] Audit input sanitization in API routes
- [ ] Add rate limiting to `/api/health`

### For Documentation Lovers
- [ ] Create architecture diagrams (Mermaid or PlantUML)
- [ ] Write tutorial: "Build a simple stigmergy app"
- [ ] Document deployment to Vercel/Netlify

---

## Getting Help

### Stuck? Ask in:
- **GitHub Discussions** (async, searchable)
- **Issues** (for bugs/features)

### Expected Response Time
- Simple questions: < 24 hours
- Complex technical issues: < 72 hours

---

## Recognition System

> **⚠️ Legacy model — kept for continuity, not for new decisions.**
> The Seedling / Sapling / Canopy / Keystone tiers below are inherited from
> the deprecated `ROADMAP_TO_100.md` ecological-succession framework. They
> are preserved here so that prior contributor recognition (avatars,
> shout-outs, the all-contributors record) remains stable and discoverable.
>
> The **operative contribution and maintainer model** lives in
> [`GOVERNANCE.md`](./GOVERNANCE.md): lazy-consensus decision-making,
> maintainer roster, release process, and security escalation path.
> See [`PLAIN_ENGLISH_GLOSSARY.md` §8](./PLAIN_ENGLISH_GLOSSARY.md#8-ecosystem--roadmap-metaphors-historical-document)
> for plain-English translations of the ecological vocabulary.

### Contributor Tiers (legacy — inspired by ecological succession)
1. **Seedling** (1-5 commits) - You're germinating! 🌱
2. **Sapling** (6-20 commits) - Growing strong 🌿
3. **Canopy** (21-50 commits) - Providing structure 🌳
4. **Keystone** (50+ commits) - Ecosystem architect 🏛️

**Current Keystones:**
- {KVN-AI} - @KullAILABS (89 commits)

**We need 2 more Keystones to achieve bus factor ≥ 3!**

---

## Code of Conduct

### Our Ecosystem Values
- **Collaboration over competition** - We're symbiotic, not parasitic
- **Curiosity over criticism** - Ask "why" before "that's wrong"
- **Transparency over secrecy** - Document decisions in PRs/Issues

### What We Don't Tolerate
- Personal attacks or gatekeeping
- Plagiarism or IP violations
- Spamming or self-promotion without value-add

Report violations to: [MAINTAINER_EMAIL]

---

## Advanced: Becoming a Core Maintainer

### Path to Maintainer Status (Bus Factor ≥ 3 Goal)
1. **Consistent contributions:** 20+ commits over 3 months
2. **Domain expertise:** Deep knowledge of ≥1 core module
3. **Community engagement:** Reviewed 10+ PRs, answered 15+ issues
4. **Demonstrated judgment:** No critical bugs introduced

**Current Maintainers:** 1 (need 2 more)

**Benefits:**
- Merge rights to main branch
- Co-author on papers/presentations
- Revenue share if commercialized (TBD)

---

## Appendix: Useful Commands

```bash
# Run specific test file
npm test -- src/__tests__/stigmergy.test.ts

# Check dependency health
npm run deps:check

# Build production bundle
npm run build

# Analyze bundle size
npm run build && du -sh .next/

# Find TODOs in codebase
grep -r "TODO" src/
```

---

**Last Updated:** 2025-12-31
**Maintainers:** {KVN-AI}, Kuonirad
**Contributors:** 6 (and growing! 🚀)

---

🌿 *Remember: Every major ecosystem started with pioneer species. Your contribution, no matter how small, helps build the climax forest.* 🌿
