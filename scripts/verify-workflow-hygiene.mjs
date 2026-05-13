#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const WORKFLOW_DIR = '.github/workflows';
const MIN_NODE_MAJOR = 22;
const SHA_RE = /^[a-f0-9]{40}$/i;

function workflowFiles(dir = WORKFLOW_DIR) {
  return fs.readdirSync(dir)
    .filter((file) => /\.ya?ml$/i.test(file))
    .map((file) => path.join(dir, file));
}

export function verifyWorkflowHygiene(files = workflowFiles()) {
  const errors = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const nodeMatch = line.match(/node-version:\s*['"]?([0-9]+)(?:\.x)?['"]?/i);
      if (nodeMatch && Number(nodeMatch[1]) < MIN_NODE_MAJOR) {
        errors.push(`${file}:${lineNumber} uses Node ${nodeMatch[1]}; minimum CI runtime is Node ${MIN_NODE_MAJOR}.x.`);
      }

      const usesMatch = line.match(/uses:\s*([^\s#]+)\s*(?:#.*)?$/);
      if (!usesMatch) return;
      const spec = usesMatch[1].trim();
      if (spec.startsWith('./') || spec.startsWith('docker://')) return;
      const at = spec.lastIndexOf('@');
      if (at === -1) {
        errors.push(`${file}:${lineNumber} uses ${spec} without an immutable ref.`);
        return;
      }
      const ref = spec.slice(at + 1);
      if (!SHA_RE.test(ref)) errors.push(`${file}:${lineNumber} pins ${spec} by tag; use a 40-character commit SHA.`);
    });
  }
  return { ok: errors.length === 0, errors };
}

import { pathToFileURL } from 'node:url';
const invokedUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (import.meta.url === invokedUrl) {
  const result = verifyWorkflowHygiene();
  if (!result.ok) {
    console.error('Workflow hygiene verification failed:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log('Workflow hygiene verification passed.');
}
