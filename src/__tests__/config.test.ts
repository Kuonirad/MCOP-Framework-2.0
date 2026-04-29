import nextConfig from '../../next.config';
import { MCOP_CONFIG, classifyMetric, classifyVSI } from '@/config/mcop.config';

describe('next.config.ts', () => {
  it('should have output set to standalone', () => {
    expect(nextConfig.output).toBe('standalone');
  });

  it('should have security headers configured', async () => {
    const headers = nextConfig.headers ? await nextConfig.headers() : [];
    const globalHeaders = headers.find((h: { source: string; headers: { key: string; value: string }[] }) => h.source === '/:path*');

    expect(globalHeaders).toBeDefined();

    const headerMap = new Map(globalHeaders?.headers.map((h: { key: string; value: string }) => [h.key, h.value]));

    expect(headerMap.get('X-DNS-Prefetch-Control')).toBe('on');
    expect(headerMap.get('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains; preload');
    expect(headerMap.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(headerMap.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headerMap.get('Referrer-Policy')).toBe('origin-when-cross-origin');
  });
});

describe('mcop.config.ts', () => {
  it('exports frozen config', () => {
    expect(Object.isFrozen(MCOP_CONFIG)).toBe(true);
    expect(Object.isFrozen(MCOP_CONFIG.LCP)).toBe(true);
    expect(Object.isFrozen(MCOP_CONFIG.VSI)).toBe(true);
  });

  describe('classifyMetric', () => {
    it('returns good when value ≤ good threshold', () => {
      expect(classifyMetric('LCP', 2000)).toBe('good');
      expect(classifyMetric('INP', 150)).toBe('good');
      expect(classifyMetric('CLS', 0.05)).toBe('good');
      expect(classifyMetric('FCP', 1000)).toBe('good');
      expect(classifyMetric('TTFB', 500)).toBe('good');
    });

    it('returns ni when good < value ≤ poor threshold', () => {
      expect(classifyMetric('LCP', 3000)).toBe('ni');
      expect(classifyMetric('INP', 300)).toBe('ni');
      expect(classifyMetric('CLS', 0.15)).toBe('ni');
      expect(classifyMetric('FCP', 2000)).toBe('ni');
      expect(classifyMetric('TTFB', 1000)).toBe('ni');
    });

    it('returns poor when value > poor threshold', () => {
      expect(classifyMetric('LCP', 5000)).toBe('poor');
      expect(classifyMetric('INP', 600)).toBe('poor');
      expect(classifyMetric('CLS', 0.3)).toBe('poor');
      expect(classifyMetric('FCP', 4000)).toBe('poor');
      expect(classifyMetric('TTFB', 2000)).toBe('poor');
    });

    it('handles edge-case thresholds exactly', () => {
      expect(classifyMetric('LCP', 2500)).toBe('good'); // exactly good
      expect(classifyMetric('LCP', 4000)).toBe('ni');   // exactly poor
    });
  });

  describe('classifyVSI', () => {
    it('returns idle when count is zero', () => {
      expect(classifyVSI(0, 0)).toBe('idle');
      expect(classifyVSI(0.5, 0)).toBe('idle');
    });

    it('returns good when value ≤ 0.1 and count > 0', () => {
      expect(classifyVSI(0.05, 1)).toBe('good');
      expect(classifyVSI(0.1, 5)).toBe('good');
    });

    it('returns ni when 0.1 < value ≤ 0.25 and count > 0', () => {
      expect(classifyVSI(0.15, 1)).toBe('ni');
      expect(classifyVSI(0.25, 5)).toBe('ni');
    });

    it('returns poor when value > 0.25 and count > 0', () => {
      expect(classifyVSI(0.3, 1)).toBe('poor');
      expect(classifyVSI(1.0, 10)).toBe('poor');
    });
  });
});
