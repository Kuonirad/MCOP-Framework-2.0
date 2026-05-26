import { InMemoryProvenanceSink, NullProvenanceSink, type ProvenanceLogEntry } from '../hardware/provenanceSink';
import type { AcceleratorProvenance } from '../hardware/Accelerator';

function entry(i: number): ProvenanceLogEntry {
  const provenance = {
    device: 'cuda:0',
    mode: 'cuda',
    kernel: 'nova-neo-encode',
    provider: 'CUDAHardwareLayer:onnx',
    merkleRoot: String(i).padStart(64, '0'),
    timestamp: '2026-05-26T00:00:00.000Z',
  } as AcceleratorProvenance;
  return { type: 'accelerator-primitive', op: 'nova-neo-encode', device: 'cuda:0', provenance, timestamp: provenance.timestamp };
}

describe('NullProvenanceSink', () => {
  it('accepts entries and discards them', () => {
    const sink = new NullProvenanceSink();
    expect(sink.append(entry(1))).toBeUndefined();
  });
});

describe('InMemoryProvenanceSink', () => {
  it('records entries in order and exposes a defensive copy', () => {
    const sink = new InMemoryProvenanceSink();
    sink.append(entry(1));
    sink.append(entry(2));
    expect(sink.size).toBe(2);
    const snapshot = sink.entries;
    expect(snapshot).toHaveLength(2);
    // entries is a copy — mutating it does not affect the sink.
    (snapshot as ProvenanceLogEntry[]).pop();
    expect(sink.size).toBe(2);
  });

  it('evicts oldest entries past capacity', () => {
    const sink = new InMemoryProvenanceSink(2);
    sink.append(entry(1));
    sink.append(entry(2));
    sink.append(entry(3));
    expect(sink.size).toBe(2);
    expect(sink.entries.map((e) => e.provenance.merkleRoot)).toEqual([
      String(2).padStart(64, '0'),
      String(3).padStart(64, '0'),
    ]);
  });

  it('clear() empties the buffer', () => {
    const sink = new InMemoryProvenanceSink();
    sink.append(entry(1));
    sink.clear();
    expect(sink.size).toBe(0);
    expect(sink.entries).toEqual([]);
  });

  it('rejects a non-positive capacity', () => {
    expect(() => new InMemoryProvenanceSink(0)).toThrow(RangeError);
    expect(() => new InMemoryProvenanceSink(-1)).toThrow(RangeError);
    expect(() => new InMemoryProvenanceSink(1.5)).toThrow(RangeError);
  });
});
