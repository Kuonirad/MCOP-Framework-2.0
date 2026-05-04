import { NextResponse } from 'next/server';

/**
 * GET /api/benchmarks/sample
 * Returns a downloadable sample task JSON for the benchmark uploader.
 */
export async function GET() {
  const sample = [
    {
      id: "sample-task-1",
      domain: "generic",
      humanPrompt: "Summarize the Q3 earnings call highlighting revenue, margin, and forward guidance.",
      goalKeywords: ["Q3", "earnings", "revenue", "margin", "guidance"],
    },
    {
      id: "sample-task-2",
      domain: "code",
      humanPrompt: "Implement a thread-safe LRU cache in Go with O(1) get and put operations.",
      goalKeywords: ["Go", "LRU", "thread-safe", "O(1)", "cache"],
    },
    {
      id: "sample-task-3",
      domain: "legal",
      humanPrompt: "Draft an NDA mutual-reciprocity clause for a software evaluation partnership.",
      goalKeywords: ["NDA", "mutual", "reciprocity", "software", "partnership"],
    },
  ];

  return NextResponse.json(sample, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="mcop-benchmark-tasks-sample.json"',
    },
  });
}
