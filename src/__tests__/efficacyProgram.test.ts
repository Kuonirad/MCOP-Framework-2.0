import {
  HeldOutVault,
  IsolationViolationError,
  commitHeldOut,
  detectLeakage,
  runEfficacyProgram,
  sealPreRegistration,
  verifyPreRegistration,
  type EfficacyTask,
  type PreRegistrationProtocol,
  type Rater,
  type SystemUnderTest,
} from '../efficacy';

// --- Fixtures ---------------------------------------------------------------

const TASKS: EfficacyTask[] = Array.from({ length: 8 }, (_, i) => ({
  id: `held-out-${i}`,
  prompt: { question: `abstraction puzzle #${i}` },
}));

const SALT = 'fixed-test-salt-2026';

function buildProtocol(commitment: string): PreRegistrationProtocol {
  return {
    hypothesis: 'The tuned genome yields higher-quality reasoning than the control.',
    primaryMetric: 'rubric-quality',
    rubric: { min: 1, max: 7, description: 'reasoning quality, 1 (poor) – 7 (excellent)' },
    reliability: { metric: 'interval', floor: 0.667 },
    decisionRule: {
      minCliffsDelta: 0.33,
      direction: 'treatment-greater',
      ciLevel: 0.95,
      bootstrapResamples: 500,
      seed: 0xc0ffee,
    },
    heldOutCommitment: commitment,
    analysisPlan: 'No interim peeking; abstentions excluded pairwise; one stopping point.',
  };
}

/** A system whose outputs carry a quality signal raters can read. */
function makeSystem(id: string, arm: 'treatment' | 'control', quality: (i: number) => number): SystemUnderTest {
  return {
    id,
    arm,
    run(task) {
      const i = Number(task.id.split('-').pop());
      return { taskId: task.id, content: { quality: quality(i) } };
    },
  };
}

/** A rater that scores the output's quality, with a deterministic per-rater tilt. */
function makeRater(id: string, tilt: number): Rater {
  return {
    id,
    rate(item) {
      const q = (item.output.content as { quality: number }).quality;
      return q + tilt;
    },
  };
}

function fixedClock(iso: string) {
  return () => new Date(iso);
}

// --- Tests ------------------------------------------------------------------

describe('isolation barrier', () => {
  it('reveals held-out tasks only to a capability holder', () => {
    const vault = new HeldOutVault(TASKS, SALT);
    const cap = vault.issueCapability();
    expect(vault.reveal(cap)).toHaveLength(TASKS.length);
    // A forged capability (wrong token) is rejected.
    const forged = { token: Symbol('forged'), vaultId: vault.vaultId };
    expect(() => vault.reveal(forged)).toThrow(IsolationViolationError);
  });

  it('publishes a commitment that does not reveal contents and is salt-stable', () => {
    const vault = new HeldOutVault(TASKS, SALT);
    expect(vault.commitment).toHaveLength(64);
    expect(vault.commitment).toBe(commitHeldOut(TASKS.map((t) => t.id), SALT));
    // Order independence: same ids, shuffled, same commitment.
    const shuffled = [...TASKS].reverse();
    expect(commitHeldOut(shuffled.map((t) => t.id), SALT)).toBe(vault.commitment);
    // Different salt ⇒ different commitment.
    expect(commitHeldOut(TASKS.map((t) => t.id), 'other-salt')).not.toBe(vault.commitment);
  });

  it('detects a held-out task id leaking into the tuner context', () => {
    const vault = new HeldOutVault(TASKS, SALT);
    const cap = vault.issueCapability();
    const clean = detectLeakage({ traces: ['something benign'] }, vault, cap);
    expect(clean.violations).toHaveLength(0);

    const leaked = detectLeakage({ traces: [{ note: 'saw held-out-3 in recall' }] }, vault, cap);
    expect(leaked.violations.length).toBeGreaterThan(0);
  });

  it('rejects empty or duplicate-id vaults', () => {
    expect(() => new HeldOutVault([], SALT)).toThrow();
    expect(() => new HeldOutVault([TASKS[0], TASKS[0]], SALT)).toThrow();
  });
});

describe('pre-registration sealing', () => {
  it('seals and verifies, and detects tampering', () => {
    const vault = new HeldOutVault(TASKS, SALT);
    const sealed = sealPreRegistration(buildProtocol(vault.commitment), {
      now: fixedClock('2026-05-01T00:00:00.000Z'),
    });
    expect(sealed.preRegistrationHash).toHaveLength(64);
    expect(verifyPreRegistration(sealed)).toBe(true);

    const tampered = {
      ...sealed,
      protocol: { ...sealed.protocol, hypothesis: 'changed after the fact' },
    };
    expect(verifyPreRegistration(tampered)).toBe(false);
  });

  it('refuses to seal an inconsistent protocol', () => {
    const bad = buildProtocol('deadbeef');
    bad.rubric = { min: 5, max: 1, description: 'inverted' };
    expect(() => sealPreRegistration(bad)).toThrow(/rubric\.max/);
  });
});

describe('runEfficacyProgram', () => {
  function setup() {
    const vault = new HeldOutVault(TASKS, SALT);
    const cap = vault.issueCapability();
    const sealed = sealPreRegistration(buildProtocol(vault.commitment), {
      now: fixedClock('2026-05-01T00:00:00.000Z'),
    });
    const raters = [makeRater('r1', 0), makeRater('r2', 0), makeRater('r3', 0)];
    return { vault, cap, sealed, raters };
  }

  it('returns "supported" when treatment beats control and raters agree', async () => {
    const { vault, cap, sealed, raters } = setup();
    const systems = [
      makeSystem('tuned', 'treatment', (i) => 6 + (i % 2)), // 6 or 7
      makeSystem('baseline', 'control', () => 2),
    ];
    const report = await runEfficacyProgram(
      { sealed, vault, capability: cap, systems, raters },
      { now: fixedClock('2026-05-10T00:00:00.000Z') },
    );

    expect(report.verdict).toBe('supported');
    expect(report.preRegisteredBeforeResults).toBe(true);
    expect(report.effect.cliffsDelta).toBe(1);
    expect(report.effect.bootstrap.lower).toBeGreaterThan(0);
    expect(report.reliability.meetsFloor).toBe(true);
    expect(report.reportMerkleRoot).toHaveLength(64);
  });

  it('returns "not-supported" when raters agree but the effect is null', async () => {
    const { vault, cap, sealed, raters } = setup();
    const systems = [
      makeSystem('tuned', 'treatment', () => 4),
      makeSystem('baseline', 'control', () => 4),
    ];
    const report = await runEfficacyProgram(
      { sealed, vault, capability: cap, systems, raters },
      { now: fixedClock('2026-05-10T00:00:00.000Z') },
    );
    expect(report.verdict).toBe('not-supported');
    expect(report.effect.cliffsDelta).toBe(0);
  });

  it('returns "inconclusive" when raters do not agree enough to adjudicate', async () => {
    const { vault, cap, sealed } = setup();
    // Raters score with large, opposing tilts that swamp any arm signal and
    // get clamped to the rubric bounds, destroying interval agreement.
    const noisyRaters: Rater[] = [
      { id: 'hi', rate: () => 7 },
      { id: 'lo', rate: () => 1 },
      { id: 'mid', rate: () => 4 },
    ];
    const systems = [
      makeSystem('tuned', 'treatment', () => 6),
      makeSystem('baseline', 'control', () => 2),
    ];
    const report = await runEfficacyProgram(
      { sealed, vault, capability: cap, systems, raters: noisyRaters },
      { now: fixedClock('2026-05-10T00:00:00.000Z') },
    );
    expect(report.reliability.meetsFloor).toBe(false);
    expect(report.verdict).toBe('inconclusive');
  });

  it('returns "invalidated" when a held-out task leaked into the tuner context', async () => {
    const { vault, cap, sealed, raters } = setup();
    const systems = [
      makeSystem('tuned', 'treatment', () => 6),
      makeSystem('baseline', 'control', () => 2),
    ];
    const report = await runEfficacyProgram(
      { sealed, vault, capability: cap, systems, raters },
      {
        now: fixedClock('2026-05-10T00:00:00.000Z'),
        observedTunerContext: { recall: ['held-out-5 was in the trace memory'] },
      },
    );
    expect(report.verdict).toBe('invalidated');
    expect(report.leakage.violations.length).toBeGreaterThan(0);
  });

  it('returns "invalidated" when the pre-registration post-dates the results', async () => {
    const { vault, cap, raters } = setup();
    const lateSeal = sealPreRegistration(buildProtocol(vault.commitment), {
      now: fixedClock('2026-06-01T00:00:00.000Z'), // after the run clock below
    });
    const systems = [
      makeSystem('tuned', 'treatment', () => 6),
      makeSystem('baseline', 'control', () => 2),
    ];
    const report = await runEfficacyProgram(
      { sealed: lateSeal, vault, capability: cap, systems, raters },
      { now: fixedClock('2026-05-10T00:00:00.000Z') },
    );
    expect(report.verdict).toBe('invalidated');
    expect(report.preRegisteredBeforeResults).toBe(false);
  });

  it('returns "invalidated" when the sealed commitment does not match the vault', async () => {
    const { vault, cap, raters } = setup();
    const wrongSeal = sealPreRegistration(buildProtocol(commitHeldOut(['unrelated'], SALT)), {
      now: fixedClock('2026-05-01T00:00:00.000Z'),
    });
    const systems = [
      makeSystem('tuned', 'treatment', () => 6),
      makeSystem('baseline', 'control', () => 2),
    ];
    const report = await runEfficacyProgram(
      { sealed: wrongSeal, vault, capability: cap, systems, raters },
      { now: fixedClock('2026-05-10T00:00:00.000Z') },
    );
    expect(report.verdict).toBe('invalidated');
    expect(report.rationale).toMatch(/commitment/);
  });

  it('is deterministic: identical inputs seal an identical report root', async () => {
    const run = async () => {
      const { vault, cap, sealed, raters } = setup();
      const systems = [
        makeSystem('tuned', 'treatment', (i) => 6 + (i % 2)),
        makeSystem('baseline', 'control', () => 2),
      ];
      return runEfficacyProgram(
        { sealed, vault, capability: cap, systems, raters },
        { now: fixedClock('2026-05-10T00:00:00.000Z') },
      );
    };
    const a = await run();
    const b = await run();
    expect(a.reportMerkleRoot).toBe(b.reportMerkleRoot);
  });

  it('requires at least two raters and both arms', async () => {
    const { vault, cap, sealed } = setup();
    const oneArm = [makeSystem('tuned', 'treatment', () => 6)];
    await expect(
      runEfficacyProgram({ sealed, vault, capability: cap, systems: oneArm, raters: [makeRater('r1', 0), makeRater('r2', 0)] }),
    ).rejects.toThrow(/treatment and one control/);

    const systems = [makeSystem('t', 'treatment', () => 6), makeSystem('c', 'control', () => 2)];
    await expect(
      runEfficacyProgram({ sealed, vault, capability: cap, systems, raters: [makeRater('r1', 0)] }),
    ).rejects.toThrow(/two raters/);
  });
});
