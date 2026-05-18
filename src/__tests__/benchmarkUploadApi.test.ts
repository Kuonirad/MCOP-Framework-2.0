/**
 * @jest-environment node
 */
import type { NextRequest } from 'next/server';

import { GET as getSampleTasks } from '../app/api/benchmarks/sample/route';
import { POST as uploadTasks } from '../app/api/benchmarks/upload/route';

const validTask = {
  id: 'regression-task',
  domain: 'generic',
  humanPrompt: 'Summarize the quarterly risk memo.',
  goalKeywords: ['risk', 'quarterly', 'summary'],
};

function jsonRequest(body: unknown): NextRequest {
  return new Request('http://localhost/api/benchmarks/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe('benchmark task upload API', () => {
  it('returns validated tasks and rejects malformed rows', async () => {
    const response = await uploadTasks(
      jsonRequest([
        validTask,
        {
          id: 'bad-keywords',
          domain: 'generic',
          humanPrompt: 'This row has a non-string keyword.',
          goalKeywords: ['ok', 42],
        },
      ]),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({
      valid: 1,
      invalid: 1,
      tasks: [validTask],
    });
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0]).toContain('Invalid task');
  });

  it('caps noisy validation errors while reporting the full invalid count', async () => {
    const invalidRows = Array.from({ length: 7 }, (_, index) => ({
      id: `bad-${index}`,
      domain: 'generic',
      humanPrompt: 'Missing goalKeywords array.',
    }));

    const response = await uploadTasks(jsonRequest(invalidRows));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.valid).toBe(0);
    expect(data.invalid).toBe(7);
    expect(data.errors).toHaveLength(5);
  });

  it('rejects non-array and malformed JSON payloads', async () => {
    const nonArray = await uploadTasks(jsonRequest({ task: validTask }));
    expect(nonArray.status).toBe(400);
    await expect(nonArray.json()).resolves.toEqual({
      error: 'Expected an array of tasks',
    });

    const malformed = await uploadTasks(
      new Request('http://localhost/api/benchmarks/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"id":',
      }) as NextRequest,
    );
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toEqual({
      error: 'Invalid JSON body',
    });
  });
});

describe('benchmark sample API', () => {
  it('returns a downloadable sample task array', async () => {
    const response = await getSampleTasks();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="mcop-benchmark-tasks-sample.json"',
    );

    const sample = await response.json();
    expect(sample).toHaveLength(3);
    for (const task of sample) {
      expect(typeof task.id).toBe('string');
      expect(typeof task.domain).toBe('string');
      expect(typeof task.humanPrompt).toBe('string');
      expect(task.goalKeywords.every((keyword: unknown) => typeof keyword === 'string')).toBe(
        true,
      );
    }
  });
});
