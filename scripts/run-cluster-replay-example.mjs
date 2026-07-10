#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
registerTypeScriptLoader();
const restoreCanonicalizeResolution = registerCanonicalizeShim();

const { runClusterStigmergyReplayDemo } = require(
  join(root, 'examples', 'cluster_stigmergy_replay.ts'),
);
restoreCanonicalizeResolution();
const proof = await runClusterStigmergyReplayDemo();
process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);

function registerTypeScriptLoader() {
  const ts = require('typescript');
  require.extensions['.ts'] = (module, filename) => {
    const source = readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    module._compile(output, filename);
  };
}

function registerCanonicalizeShim() {
  const Module = require('node:module');
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function resolveFilename(request, ...args) {
    if (request === 'canonicalize') {
      return join(root, 'tests', 'shims', 'canonicalize.cjs');
    }
    return originalResolveFilename.call(this, request, ...args);
  };
  return () => {
    Module._resolveFilename = originalResolveFilename;
  };
}
