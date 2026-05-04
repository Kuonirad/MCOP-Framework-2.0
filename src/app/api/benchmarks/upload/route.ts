import { NextRequest, NextResponse } from 'next/server';

interface UploadedTask {
  id: string;
  domain: string;
  humanPrompt: string;
  goalKeywords: string[];
}

/**
 * POST /api/benchmarks/upload
 * Accepts a JSON array of benchmark tasks and returns a validation report.
 * The client is expected to redirect to /benchmarks/preview for visualization.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as unknown;

    if (!Array.isArray(body)) {
      return NextResponse.json(
        { error: 'Expected an array of tasks' },
        { status: 400 },
      );
    }

    const tasks: UploadedTask[] = [];
    const errors: string[] = [];

    for (const item of body) {
      if (
        typeof item.id === 'string' &&
        typeof item.domain === 'string' &&
        typeof item.humanPrompt === 'string' &&
        Array.isArray(item.goalKeywords) &&
        item.goalKeywords.every((k: unknown) => typeof k === 'string')
      ) {
        tasks.push({
          id: item.id,
          domain: item.domain,
          humanPrompt: item.humanPrompt,
          goalKeywords: item.goalKeywords,
        });
      } else {
        errors.push(`Invalid task: ${JSON.stringify(item).slice(0, 200)}`);
      }
    }

    return NextResponse.json(
      {
        valid: tasks.length,
        invalid: errors.length,
        errors: errors.slice(0, 5), // cap error noise
        tasks,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }
}
