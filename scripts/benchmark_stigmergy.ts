import { StigmergyV5 } from '../src/core/stigmergyV5';
import { ContextTensor } from '../src/core/types';
import { performance } from 'perf_hooks';

const DIMENSIONS = 1024;
const TRACE_COUNT = 2048;
const ITERATIONS = 100;

function createRandomVector(dim: number): ContextTensor {
  const vec = new Array(dim);
  for (let i = 0; i < dim; i++) {
    vec[i] = Math.random() * 2 - 1;
  }
  return vec;
}

async function runBenchmark() {
  console.log(`Initializing StigmergyV5 with ${TRACE_COUNT} traces of ${DIMENSIONS} dimensions...`);
  const stigmergy = new StigmergyV5({ maxTraces: TRACE_COUNT });

  // Pre-fill traces
  for (let i = 0; i < TRACE_COUNT; i++) {
    const context = createRandomVector(DIMENSIONS);
    const synthesis = createRandomVector(DIMENSIONS);
    stigmergy.recordTrace(context, synthesis);
  }

  console.log('Trace initialization complete.');
  console.log(`Running ${ITERATIONS} iterations of getResonance...`);

  const queries = new Array(ITERATIONS).fill(0).map(() => createRandomVector(DIMENSIONS));

  const start = performance.now();

  for (let i = 0; i < ITERATIONS; i++) {
    stigmergy.getResonance(queries[i]);
  }

  const end = performance.now();
  const totalTime = end - start;
  const avgTime = totalTime / ITERATIONS;

  console.log(`Total time: ${totalTime.toFixed(2)}ms`);
  console.log(`Average time per call: ${avgTime.toFixed(2)}ms`);
}

runBenchmark().catch(console.error);
