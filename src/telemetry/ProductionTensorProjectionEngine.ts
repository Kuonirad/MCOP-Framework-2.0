import { TelemetryProxies } from './types';

export class ProductionTensorProjectionEngine {
  public projectAttenuationMask(proxies: TelemetryProxies, weights: number[][], fallbackRows = 128): Float32Array {
    const rows = weights.length > 0 ? weights.length : Math.max(1, fallbackRows);
    const mask = new Float32Array(rows);
    const proxyVector = proxiesToVector(proxies);

    for (let i = 0; i < rows; i++) {
      const row = weights[i] ?? proxyVector;
      let dot = 0;
      for (let j = 0; j < proxyVector.length; j++) {
        dot += (row[j] ?? 0) * proxyVector[j];
      }
      mask[i] = clamp01(0.5 + dot / Math.max(2, proxyVector.length * 2));
    }

    return mask;
  }

  public deriveSuccessCentroid(traceMatrix: number[][], targetRows: number): number[] {
    const rows = Math.max(1, targetRows);
    if (!traceMatrix.length) return Array.from({ length: rows }, () => 0);

    return Array.from({ length: rows }, (_, rowIndex) => {
      let sum = 0;
      let count = 0;
      for (const row of traceMatrix) {
        const value = row[rowIndex % row.length];
        if (typeof value === 'number' && Number.isFinite(value)) {
          sum += value;
          count++;
        }
      }
      return count ? sum / count : 0;
    });
  }
}

export function proxiesToVector(proxies: TelemetryProxies): number[] {
  return [proxies.rho, proxies.rInstability, proxies.deltaVfe, proxies.sigma].map(clamp01);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
