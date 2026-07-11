#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rootIndex = process.argv.indexOf('--root');
const runtimeRoot = path.resolve(
  repoRoot,
  rootIndex >= 0 ? process.argv[rootIndex + 1] : 'dist/standalone',
);
const server = path.join(runtimeRoot, 'server.js');

if (!fs.existsSync(server)) {
  console.error(`Standalone server not found at ${server}. Run \`pnpm standalone:build\` first.`);
  process.exit(1);
}

const port = process.env.PORT ?? '3000';
const hostname = process.env.HOSTNAME ?? '127.0.0.1';
const nodeBinary = process.env.MCOP_NODE_BINARY || process.execPath;

console.log(`MCOP standalone runtime: http://${hostname}:${port}`);
const child = spawn(nodeBinary, [server], {
  cwd: runtimeRoot,
  env: {
    ...process.env,
    HOSTNAME: hostname,
    NODE_ENV: 'production',
    NEXT_TELEMETRY_DISABLED: '1',
    PORT: port,
  },
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
