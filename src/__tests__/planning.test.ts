import {
  HolographicEtch,
  MCOPMCTSPlanner,
  NovaNeoEncoder,
  StigmergyV5,
  UCB1Bandit,
} from '../core';

const makeTriad = () => ({
  encoder: new NovaNeoEncoder({ dimensions: 32, normalize: true, entropyFloor: 0.05 }),
  stigmergy: new StigmergyV5({ resonanceThreshold: 0.2, maxTraces: 64 }),
  etch: new HolographicEtch({ confidenceFloor: 0, auditLog: true }),
});

describe('UCB1Bandit', () => {
  it('returns untried arms first in caller order', () => {
    const bandit = new UCB1Bandit();
    expect(bandit.selectArm(['a', 'b', 'c'])).toBe('a');
    bandit.update('a', 0.1);
    expect(bandit.selectArm(['a', 'b', 'c'])).toBe('b');
    bandit.update('b', 0.5);
    expect(bandit.selectArm(['a', 'b', 'c'])).toBe('c');
  });

  it('prefers the arm with the highest UCB1 score once all are tried', () => {
    const bandit = new UCB1Bandit({ c: 0 }); // pure exploitation
    bandit.update('a', 0.1);
    bandit.update('b', 0.9);
    bandit.update('c', 0.5);
    // With c=0, UCB1 == mean reward → 'b' is best.
    expect(bandit.selectArm(['a', 'b', 'c'])).toBe('b');
    expect(bandit.getMeanReward('b')).toBeCloseTo(0.9, 5);
    expect(bandit.getTotalPulls()).toBe(3);
  });

  it('throws when given an empty arm set', () => {
    const bandit = new UCB1Bandit();
    expect(() => bandit.selectArm([])).toThrow();
  });

  it('exposes per-arm statistics', () => {
    const bandit = new UCB1Bandit();
    bandit.update('a', 0.4);
    bandit.update('a', 0.6);
    const stats = bandit.getStats().get('a');
    expect(stats?.pulls).toBe(2);
    expect(stats?.totalReward).toBeCloseTo(1.0, 5);
    expect(bandit.getMeanReward('missing')).toBe(0);
  });
});

describe('MCOPMCTSPlanner', () => {
  it('produces a deterministic best sequence for identical inputs', () => {
    const a = makeTriad();
    const b = makeTriad();
    const plannerA = new MCOPMCTSPlanner(a, { mctsBudget: 32, learnedRolloutDepth: 2 });
    const plannerB = new MCOPMCTSPlanner(b, { mctsBudget: 32, learnedRolloutDepth: 2 });

    const input = {
      rootText: 'plan an animation sequence',
      actions: ['refine:style', 'expand:plot', 'tighten:pacing', 'add:ambience'],
    };
    const r1 = plannerA.plan(input);
    const r2 = plannerB.plan(input);

    expect(r1.bestSequence).toEqual(r2.bestSequence);
    expect(r1.bestReward).toBeCloseTo(r2.bestReward, 10);
    expect(r1.iterations).toBe(32);
    expect(r1.bestSequence.length).toBeGreaterThan(0);
  });

  it('respects mctsBudget and emits a Merkle-chained provenance trace', () => {
    const triad = makeTriad();
    const planner = new MCOPMCTSPlanner(triad, {
      mctsBudget: 16,
      learnedRolloutDepth: 1,
      maxDepth: 3,
    });
    const result = planner.plan({
      rootText: 'cinematic dawn over a misty valley',
      actions: ['style:lush', 'style:austere', 'pace:slow', 'pace:rapid'],
    });

    expect(result.iterations).toBe(16);
    expect(result.provenanceTrace.length).toBeGreaterThan(0);
    expect(result.rootMerkleHash).toMatch(/^[0-9a-f]{64}$/);

    // Every node hash is unique and non-empty.
    const hashes = new Set(result.provenanceTrace.map((n) => n.merkleHash));
    expect(hashes.size).toBe(result.provenanceTrace.length);
    for (const hash of hashes) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    }

    // Visit counts add up to at least the number of iterations on the root path.
    const root = result.provenanceTrace.find((n) => n.depth === 0);
    expect(root).toBeDefined();
    expect(root?.visits).toBe(16);
  });

  it('does not mutate the triad during planning (read-only invariant)', () => {
    const triad = makeTriad();
    const planner = new MCOPMCTSPlanner(triad, { mctsBudget: 8, learnedRolloutDepth: 1 });

    const stigmergyBefore = triad.stigmergy.getBufferStats();
    const etchBefore = triad.etch.getMemoryStats();

    planner.plan({
      rootText: 'narrative beat refinement pass',
      actions: ['beat:rising', 'beat:falling', 'beat:climax'],
    });

    const stigmergyAfter = triad.stigmergy.getBufferStats();
    const etchAfter = triad.etch.getMemoryStats();

    expect(stigmergyAfter.lifetimePushes).toBe(stigmergyBefore.lifetimePushes);
    expect(etchAfter.lifetimePushes).toBe(etchBefore.lifetimePushes);
  });

  it('uses prior stigmergy traces to bias planning toward resonant actions', () => {
    const triad = makeTriad();
    // Seed a strong trace tied to one specific action token.
    const seedText = 'plan an animation sequence refine:style';
    const seedTensor = triad.encoder.encode(seedText);
    triad.stigmergy.recordTrace(seedTensor, seedTensor, { note: 'preferred-style' });

    const planner = new MCOPMCTSPlanner(triad, {
      mctsBudget: 64,
      learnedRolloutDepth: 2,
      maxFanout: 4,
    });
    const result = planner.plan({
      rootText: 'plan an animation sequence',
      actions: ['refine:style', 'expand:plot', 'tighten:pacing', 'add:ambience'],
    });

    // The seeded action should appear in the planner's best sequence.
    expect(result.bestSequence).toContain('refine:style');
    expect(result.bestReward).toBeGreaterThan(0);
  });

  it('rejects empty input', () => {
    const triad = makeTriad();
    const planner = new MCOPMCTSPlanner(triad);
    expect(() => planner.plan({ rootText: '', actions: ['a'] })).toThrow();
    expect(() => planner.plan({ rootText: 'x', actions: [] })).toThrow();
  });

  it('clamps configuration to safe minimums', () => {
    const triad = makeTriad();
    const planner = new MCOPMCTSPlanner(triad, {
      mctsBudget: 0,
      learnedRolloutDepth: -5,
      maxFanout: 0,
      maxDepth: 0,
    });
    const result = planner.plan({ rootText: 'edge', actions: ['a', 'b'] });
    // Budget clamped to >=1, maxDepth >=1, so we still get a plan back.
    expect(result.iterations).toBeGreaterThanOrEqual(1);
    expect(result.bestSequence.length).toBeGreaterThanOrEqual(0);
    expect(result.rootMerkleHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
