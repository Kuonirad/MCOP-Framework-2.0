/**
 * @jest-environment node
 */

import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const yaml = require('js-yaml') as { load(input: string): unknown };

describe('mcop-ledger Helm values schema', () => {
  it('validates the default values.yaml contract', () => {
    const chartDir = path.join(
      process.cwd(),
      'services',
      'ledger',
      'helm',
      'mcop-ledger',
    );
    const schema = JSON.parse(fs.readFileSync(path.join(chartDir, 'values.schema.json'), 'utf8'));
    delete schema.$schema;
    const values = yaml.load(fs.readFileSync(path.join(chartDir, 'values.yaml'), 'utf8'));
    const validate = new Ajv({ allErrors: true }).compile(schema);

    expect(validate(values)).toBe(true);
    expect(validate.errors).toBeNull();
  });
});
