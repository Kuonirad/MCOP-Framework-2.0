import { runClusterStigmergyReplayDemo } from '../../examples/cluster_stigmergy_replay';

describe('distributed stigmergy replay example', () => {
  it('proves node A to node C resonance and byte-identical replay', async () => {
    const proof = await runClusterStigmergyReplayDemo();

    expect(proof.originNode).toBe('node-a');
    expect(proof.verifierNode).toBe('node-c');
    expect(proof.traceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(proof.clusterHash).toMatch(/^[0-9a-f]{64}$/);
    expect(proof.resonanceScore).toBe(1);
    expect(proof.replayRoot).toBe(proof.globalRoot);
    expect(proof.contributors).toEqual(['node-a']);
    expect(proof.byteIdentical).toBe(true);
  });
});
