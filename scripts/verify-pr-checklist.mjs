#!/usr/bin/env node
import fs from 'node:fs';

function readInput() {
  if (process.env.PR_BODY_FILE) return fs.readFileSync(process.env.PR_BODY_FILE, 'utf8');
  return process.env.PR_BODY ?? '';
}

function readChangedFiles() {
  const raw = process.env.CHANGED_FILES_FILE
    ? fs.readFileSync(process.env.CHANGED_FILES_FILE, 'utf8')
    : (process.env.CHANGED_FILES ?? '');
  return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

const CHECKED = /- \[(x|X)\]/;
const SECTION_PATTERNS = {
  type: /##\s*🚀\s*Type of Change([\s\S]*?)(?=\n##\s|$)/i,
      checklist: /##\s*\S*\s*Checklist([\s\S]*?)(?=\n##\s|$)/i,
  testing: /##\s*🧪\s*Testing([\s\S]*?)(?=\n##\s|$)/i,
  metrics: /##\s*📊\s*MCOP Framework Metrics([\s\S]*?)(?=\n##\s|$)/i,
};

function section(body, key) {
  return body.match(SECTION_PATTERNS[key])?.[1] ?? '';
}

function countChecked(text) {
  return text.split(/\r?\n/).filter((line) => CHECKED.test(line)).length;
}

function isDocsOnly(files) {
  if (files.length === 0) return false;
  return files.every((file) => /(^docs\/|^\.github\/ISSUE_TEMPLATE\/|\.md$|\.mdx$|^README\.md$|^CHANGELOG\.md$|^GOVERNANCE\.md$|^CONTRIBUTING\.md$|^SECURITY\.md$)/.test(file));
}

export function verifyPullRequestChecklist(body, files = []) {
  const errors = [];
  const normalized = body.trim();
  if (!normalized) {
    errors.push('PR body is empty; complete the pull request template.');
    return { ok: false, errors };
  }

  const typeSection = section(normalized, 'type');
  if (countChecked(typeSection) < 1) errors.push('Select at least one Type of Change checkbox.');

  const checklistSection = section(normalized, 'checklist');
  const requiredChecklistLabels = [
    /style guidelines/i,
    /self-review/i,
    /no new warnings/i,
    /unit tests pass locally|existing unit tests pass/i,
  ];
  for (const label of requiredChecklistLabels) {
    const line = checklistSection.split(/\r?\n/).find((candidate) => label.test(candidate));
    if (!line || !CHECKED.test(line)) errors.push(`Complete required checklist item matching: ${label}`);
  }

  const docsOnly = isDocsOnly(files);
  const testingSection = section(normalized, 'testing');
  if (!docsOnly && countChecked(testingSection) < 1) {
    errors.push('Select at least one Testing checkbox for non-docs-only changes.');
  }

  const metricsSection = section(normalized, 'metrics');
  for (const metric of ['Entropy Impact', 'Confidence Level', 'Performance Impact']) {
        const metricBlock = metricsSection.match(new RegExp(`\\*\\*${metric}:?\\*\\*:?([\\s\\S]*?)(?=\\n\\*\\*|$)`, 'i'))?.[1] ?? '';
    if (countChecked(metricBlock) !== 1) errors.push(`Select exactly one ${metric} checkbox.`);
  }

  return { ok: errors.length === 0, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = verifyPullRequestChecklist(readInput(), readChangedFiles());
  if (!result.ok) {
    console.error('Pull request checklist verification failed:');
    for (const error of result.errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log('Pull request checklist verification passed.');
}
