export function seeded(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomVector(rand: () => number, len: number, range = 1): number[] {
  const out: number[] = new Array(len);
  for (let i = 0; i < len; i++) out[i] = (rand() * 2 - 1) * range;
  return out;
}

const CHARSET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,;:-_[]{}()/\\\n\tΩ≈ç√∫˜µ≤≥÷';

export function randomText(rand: () => number, maxLength: number): string {
  const len = Math.floor(rand() * (maxLength + 1));
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CHARSET[Math.floor(rand() * CHARSET.length)];
  }
  return out;
}

export function randomJsonValue(rand: () => number, depth = 0): unknown {
  const choice = depth >= 3 ? Math.floor(rand() * 4) : Math.floor(rand() * 6);
  switch (choice) {
    case 0:
      return null;
    case 1:
      return rand() > 0.5;
    case 2:
      return Math.round((rand() * 2 - 1) * 1_000_000) / 1_000;
    case 3:
      return randomText(rand, 24);
    case 4: {
      const len = Math.floor(rand() * 5);
      const arr: unknown[] = [];
      for (let i = 0; i < len; i++) arr.push(randomJsonValue(rand, depth + 1));
      return arr;
    }
    default: {
      const entries = Math.floor(rand() * 5);
      const obj: Record<string, unknown> = {};
      for (let i = 0; i < entries; i++) {
        obj[`k_${i}_${Math.floor(rand() * 1000)}`] = randomJsonValue(rand, depth + 1);
      }
      return obj;
    }
  }
}
