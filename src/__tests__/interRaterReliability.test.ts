import {
  krippendorffAlpha,
  percentAgreement,
} from '../efficacy/interRaterReliability';

describe('krippendorffAlpha', () => {
  it('is 1 for perfect agreement (nominal)', () => {
    const ratings = [
      [1, 1, 1],
      [2, 2, 2],
      [3, 3, 3],
    ];
    expect(krippendorffAlpha(ratings, 'nominal').alpha).toBe(1);
  });

  it('is 1 for perfect agreement (interval)', () => {
    const ratings = [
      [4, 4],
      [7, 7],
    ];
    expect(krippendorffAlpha(ratings, 'interval').alpha).toBe(1);
  });

  it('matches a hand-computed nominal example', () => {
    // Units: [A,A],[A,A],[B,B],[A,B] with A=0,B=1.
    //  o_AA=4, o_BB=2, o_AB=o_BA=1; n_A=5,n_B=3,n=8.
    //  D_o = 2/8 = 0.25; D_e = 30/56 ≈ 0.5357; α = 1 - 0.25/0.5357 ≈ 0.533.
    const ratings = [
      [0, 0],
      [0, 0],
      [1, 1],
      [0, 1],
    ];
    const report = krippendorffAlpha(ratings, 'nominal');
    expect(report.alpha).toBeCloseTo(0.5333, 3);
    expect(report.usableUnits).toBe(4);
    expect(report.pairableValues).toBe(8);
  });

  it('is negative for systematic disagreement', () => {
    // Two raters always pick opposite categories.
    const ratings = [
      [0, 1],
      [1, 0],
      [0, 1],
      [1, 0],
    ];
    expect(krippendorffAlpha(ratings, 'nominal').alpha).toBeLessThan(0);
  });

  it('tolerates missing ratings and skips single-rating units', () => {
    const ratings = [
      [5, 5, null],
      [3, null, 3],
      [9, undefined, undefined], // only one present → excluded
    ];
    const report = krippendorffAlpha(ratings, 'interval');
    expect(report.usableUnits).toBe(2);
    expect(report.alpha).toBe(1);
  });

  it('returns alpha=1 when there is nothing to disagree on', () => {
    expect(krippendorffAlpha([[1]], 'nominal').alpha).toBe(1);
    expect(krippendorffAlpha([], 'nominal').usableUnits).toBe(0);
  });
});

describe('percentAgreement', () => {
  it('is 1 when all pairs match and 0 when none do', () => {
    expect(percentAgreement([[1, 1, 1]])).toBe(1);
    expect(percentAgreement([[0, 1]])).toBe(0);
  });

  it('counts comparable pairs only', () => {
    // [1,1,2]: pairs (1,1)=match,(1,2),(1,2) → 1/3.
    expect(percentAgreement([[1, 1, 2]])).toBeCloseTo(1 / 3, 6);
  });
});
