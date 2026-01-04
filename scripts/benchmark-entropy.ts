import { NovaNeoEncoder } from '../src/core/novaNeoEncoder';
import { ContextTensor } from '../src/core/types';

const ITERATIONS = 100000;
const DIMENSIONS = 4096; // Larger vector to make loop overhead significant

// Generate random tensor
const tensor: ContextTensor = [];
for (let i = 0; i < DIMENSIONS; i++) {
  tensor.push(Math.random() * 2 - 1);
}

const encoder = new NovaNeoEncoder({ dimensions: DIMENSIONS });

console.log(`Benchmarking estimateEntropy with ${ITERATIONS} iterations on vector size ${DIMENSIONS}...`);

const start = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  encoder.estimateEntropy(tensor);
}
const end = performance.now();

console.log(`Total time: ${(end - start).toFixed(2)}ms`);
console.log(`Average time per call: ${((end - start) / ITERATIONS).toFixed(6)}ms`);

// Verify correctness (roughly)
const entropy = encoder.estimateEntropy(tensor);
console.log(`Entropy value: ${entropy}`);
