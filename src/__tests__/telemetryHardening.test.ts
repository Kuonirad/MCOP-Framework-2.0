import * as crypto from 'crypto';
import { JCSUtility } from '../telemetry/JCSUtility';
import { GuardianKeyVault } from '../telemetry/GuardianKeyVault';
import { SubstrateAdapter } from '../telemetry/SubstrateAdapter';
import { MCOPHardeningBootstrapper } from '../telemetry/MCOPHardeningBootstrapper';
import { TelemetryProxies } from '../telemetry/types';
import { MCOPOrchestrator } from '../orchestrator/MCOPOrchestrator';

function publicKeyFromRawHex(rawPublicKeyHex: string): crypto.KeyObject {
  const spkiHeader = Buffer.from([
    0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
  ]);
  return crypto.createPublicKey({
    key: Buffer.concat([spkiHeader, Buffer.from(rawPublicKeyHex, 'hex')]),
    format: 'der',
    type: 'spki',
  });
}

describe('telemetry hardening primitives', () => {
  it('canonicalizes JSON deterministically for nested signing payloads', () => {
    const left = {
      zeta: [3, -0, { beta: true, alpha: 'stable' }],
      alpha: { two: 2, one: 1 },
    };
    const right = {
      alpha: { one: 1, two: 2 },
      zeta: [3, 0, { alpha: 'stable', beta: true }],
    };

    expect(JCSUtility.canonicalize(left)).toBe(
      '{"alpha":{"one":1,"two":2},"zeta":[3,0,{"alpha":"stable","beta":true}]}',
    );
    expect(JCSUtility.canonicalize(left)).toBe(JCSUtility.canonicalize(right));
    expect(() => JCSUtility.canonicalize({ bad: Number.POSITIVE_INFINITY })).toThrow(
      'JCS requires finite numbers.',
    );
  });

  it('derives an Ed25519 key and verifies signatures over canonical hashes', () => {
    const vault = GuardianKeyVault.fromRootSeed(Buffer.from('telemetry-root-seed'));
    const canonical = JCSUtility.canonicalize({ stage: 'commit', score: 0.75 });
    const messageHash = crypto.createHash('sha256').update(canonical).digest('hex');
    const signature = vault.signHash(messageHash);

    const verified = crypto.verify(
      null,
      Buffer.from(messageHash, 'hex'),
      publicKeyFromRawHex(vault.publicKeyHex),
      Buffer.from(signature, 'hex'),
    );

    expect(verified).toBe(true);
  });
});

describe('telemetry substrate integration', () => {
  it('uses defensive substrate fallbacks for ledger, sentinel, and emission surfaces', async () => {
    const appended: unknown[] = [];
    const emitted: unknown[] = [];
    const adapter = new SubstrateAdapter(
      {
        getLatestBlockHash: jest.fn().mockResolvedValue('head-hash'),
        getTotalStressArea: jest.fn().mockResolvedValue(4.25),
        appendEntry: jest.fn(async (block: unknown) => appended.push(block)),
      },
      {
        getLocalizedTraceDensity: jest.fn().mockResolvedValue(0.33),
        injectTrace: jest.fn(async (payload: unknown) => emitted.push(payload)),
      },
      {
        getUncachedDivergenceLogs: jest.fn().mockResolvedValue([
          { recordedAt: '2026-05-23T00:00:00.000Z', calculatedDelta: 1.5, logSeverity: 'HIGH' },
        ]),
      },
    );

    expect(await adapter.getLedgerHeadHash()).toBe('head-hash');
    expect(await adapter.calculateStressAreaIntegral()).toBe(4.25);
    expect(await adapter.getPheromoneDensityMetric()).toBe(0.33);
    expect(await adapter.pullActiveSentinelEvents()).toEqual([
      { timestamp: '2026-05-23T00:00:00.000Z', deltaValue: 1.5, severity: 'HIGH' },
    ]);

    await adapter.emitAttenuationMask('trace-1', 'block-1', new Float32Array([0.1, 0.2]));

    expect(emitted).toHaveLength(1);
    expect(appended).toHaveLength(0);
  });

  it('commits a signed reset block and attenuation trace through dependency injection', async () => {
    const committed: unknown[] = [];
    const emitted: unknown[] = [];
    const substrate = {
      getLedgerHeadHash: jest.fn().mockResolvedValue('parent-hash'),
      calculateStressAreaIntegral: jest.fn().mockResolvedValue(8),
      pullActiveSentinelEvents: jest.fn().mockResolvedValue([
        { timestamp: '2026-05-23T00:00:00.000Z', deltaValue: 2.2, severity: 'HIGH' },
      ]),
      getPheromoneDensityMetric: jest.fn().mockResolvedValue(0.72),
      fetchHistoricalTraceMatrix: jest.fn().mockResolvedValue([
        [1, 0, 0, 0],
        [0, 1, 0, 0],
      ]),
      commitResetBlock: jest.fn(async (block: unknown) => {
        committed.push(block);
      }),
      emitAttenuationMask: jest.fn(async (_traceId: string, _blockId: string, mask: Float32Array) => {
        emitted.push(Array.from(mask));
      }),
      commitMatrixEvolution: jest.fn(),
      commitPolicyConfiguration: jest.fn(),
    };
    const bootstrapper = new MCOPHardeningBootstrapper({
      substrateBridge: substrate,
      keyVault: GuardianKeyVault.fromRootSeed(Buffer.from('bootstrap-seed')),
      persistenceThreshold: 1,
    });
    const proxies: TelemetryProxies = {
      rho: 0.91,
      rInstability: 0.88,
      deltaVfe: 0.84,
      sigma: 0.79,
    };

    const result = await bootstrapper.commitPipelineStageExecution({
      stageId: 'stage-reset',
      proxies,
      failingL1Parameters: { beta: 4 },
      newL1Parameters: { beta: 5 },
    });

    expect(result.resetCommitted).toBe(true);
    expect(committed).toHaveLength(1);
    expect(emitted).toHaveLength(1);
    expect(result.resetBlock?.guardianSignature).toEqual(expect.any(String));

    const block = result.resetBlock!;
    const unsignedBlock = { ...block, blockHash: undefined, guardianSignature: undefined };
    delete unsignedBlock.blockHash;
    delete unsignedBlock.guardianSignature;
    const verified = crypto.verify(
      null,
      Buffer.from(block.blockHash, 'hex'),
      publicKeyFromRawHex(bootstrapper.publicKeyHex),
      Buffer.from(block.guardianSignature!, 'hex'),
    );

    expect(verified).toBe(true);
    expect(block.blockHash).toBe(
      crypto.createHash('sha256').update(JCSUtility.canonicalize(unsignedBlock)).digest('hex'),
    );
  });
});

describe('MCOPOrchestrator telemetry integration', () => {
  it('delegates pipeline stage telemetry through an injected bootstrapper only', async () => {
    const commitPipelineStageExecution = jest.fn().mockResolvedValue({
      resetCommitted: false,
      persistenceCounter: 0,
      leakyIntegratorValue: 0.2,
    });
    const orchestrator = new MCOPOrchestrator({
      hardeningBootstrapper: { commitPipelineStageExecution },
    });
    const payload = {
      stageId: 'stage-observe',
      proxies: { rho: 0.1, rInstability: 0.2, deltaVfe: 0.3, sigma: 0.4 },
    };

    await expect(orchestrator.commitPipelineStageExecution(payload)).resolves.toMatchObject({
      resetCommitted: false,
    });
    expect(commitPipelineStageExecution).toHaveBeenCalledWith(payload);
  });

  it('does not create telemetry dependencies when no bootstrapper is injected', async () => {
    const orchestrator = new MCOPOrchestrator();

    await expect(
      orchestrator.commitPipelineStageExecution({
        stageId: 'stage-skip',
        proxies: { rho: 0.1, rInstability: 0.2, deltaVfe: 0.3, sigma: 0.4 },
      }),
    ).resolves.toBeUndefined();
  });
});
