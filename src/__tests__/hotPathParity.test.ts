// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 Kevin John Kull (Kuonirad) and KullAILABS MCOP Framework contributors
import {
  cosineRecallKernel,
  encodeKernel,
  evolveScoreKernel,
  holographicUpdateKernel,
  homeostasisKernel,
} from '../hardware/referenceKernels';
import golden from '../../tests/parity/hotPathKernels.golden.json';

type Case = { op: string; kernel: string; input: Record<string, unknown>; expected: Record<string, unknown> };

const KERNELS: Record<string, (input: never) => unknown> = {
  encode: encodeKernel as never,
  cosineRecall: cosineRecallKernel as never,
  holographicUpdate: holographicUpdateKernel as never,
  evolveScore: evolveScoreKernel as never,
  homeostasis: homeostasisKernel as never,
};

/** Recursively compare with a float tolerance so TS↔Python parity isn't broken by ULP noise. */
function expectClose(actual: unknown, expected: unknown, path = ''): void {
  if (typeof expected === 'number') {
    expect(typeof actual).toBe('number');
    expect(actual as number).toBeCloseTo(expected, 9);
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true);
    expect((actual as unknown[]).length).toBe(expected.length);
    expected.forEach((v, i) => expectClose((actual as unknown[])[i], v, `${path}[${i}]`));
    return;
  }
  if (expected && typeof expected === 'object') {
    for (const key of Object.keys(expected)) {
      expectClose((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key], `${path}.${key}`);
    }
    return;
  }
  expect(actual).toEqual(expected);
}

describe('hot-path kernel parity (TS reference ↔ Python golden)', () => {
  const cases = (golden as { cases: Case[] }).cases;

  it('has a golden fixture with cases', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases.map((c, i) => [i, c] as const))(
    'case %i (%o) reproduces the Python reference output',
    (_i, testCase) => {
      const kernel = KERNELS[testCase.kernel];
      expect(kernel).toBeDefined();
      const actual = kernel(testCase.input as never);
      expectClose(actual, testCase.expected);
    },
  );
});
