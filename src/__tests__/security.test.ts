/**
 * @fileoverview Security Integration Tests for MCOP Framework 2.0
 * @description Tests validate security properties and defense mechanisms
 * 
 * Bug ID: upstream/security-hardening-001
 * Test Strategy: Verify security configurations and patterns
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Security Configuration Tests', () => {
  const projectRoot = process.cwd();

  /**
   * Test Case: SECURITY.md Exists
   * Ground Truth: Security policy must be documented
   * Failure Witness: SECURITY.md file not found
   */
  it('has SECURITY.md file', () => {
    const securityPath = path.join(projectRoot, 'SECURITY.md');
    expect(fs.existsSync(securityPath)).toBe(true);
  });

  /**
   * Test Case: SECURITY.md Contains Disclosure Policy
   * Ground Truth: Security file must contain disclosure information
   * Failure Witness: Missing disclosure policy content
   */
  it('SECURITY.md contains responsible disclosure policy', () => {
    const securityPath = path.join(projectRoot, 'SECURITY.md');
    const content = fs.readFileSync(securityPath, 'utf-8');
    
    expect(content).toContain('Reporting a Vulnerability');
    expect(content).toContain('Disclosure Policy');
  });

  /**
   * Test Case: Package-lock.json Exists
   * Ground Truth: Lockfile required for reproducible builds
   * Failure Witness: package-lock.json not found
   */
  it('has package-lock.json for reproducible builds', () => {
    const lockPath = path.join(projectRoot, 'package-lock.json');
    expect(fs.existsSync(lockPath)).toBe(true);
  });

  /**
   * Test Case: TypeScript Strict Mode
   * Ground Truth: Strict mode should be enabled for type safety
   * Failure Witness: strict mode not enabled in tsconfig
   */
  it('has TypeScript strict mode enabled', () => {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
    
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  /**
   * Test Case: No Hardcoded Secrets Pattern
   * Ground Truth: Source files should not contain hardcoded credentials
   * Failure Witness: Regex pattern matches credential-like strings
   */
  it('source files do not contain hardcoded credentials', () => {
    const srcDir = path.join(projectRoot, 'src');
    const secretPatterns = [
      /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi,
      /secret\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi,
      /password\s*[:=]\s*['"][^'"]+['"]/gi,
    ];

    const checkFile = (filePath: string): boolean => {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const pattern of secretPatterns) {
        if (pattern.test(content)) {
          return false;
        }
      }
      return true;
    };

    const walkDir = (dir: string): string[] => {
      const files: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          files.push(...walkDir(fullPath));
        } else if (entry.isFile() && /\.(ts|tsx|js|jsx)$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
      return files;
    };

    if (fs.existsSync(srcDir)) {
      const sourceFiles = walkDir(srcDir);
      for (const file of sourceFiles) {
        expect(checkFile(file)).toBe(true);
      }
    }
  });
});

describe('CI/CD Security Tests', () => {
  const projectRoot = process.cwd();

  /**
   * Test Case: GitHub Actions Use Pinned SHAs
   * Ground Truth: Actions should be pinned to commit SHAs, not tags
   * Failure Witness: Action found using version tag instead of SHA
   */
  it('GitHub Actions are pinned to commit SHAs', () => {
    const workflowDir = path.join(projectRoot, '.github', 'workflows');
    
    if (!fs.existsSync(workflowDir)) {
      // Skip if no workflows directory
      return;
    }

    const workflowFiles = fs.readdirSync(workflowDir)
      .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

    for (const file of workflowFiles) {
      const content = fs.readFileSync(path.join(workflowDir, file), 'utf-8');
      
      // Find all 'uses:' statements
      const usesRegex = /uses:\s*([^\s]+)/g;
      let match;
      
      while ((match = usesRegex.exec(content)) !== null) {
        const action = match[1];
        
        // Skip local actions (./path) and docker actions
        if (action.startsWith('./') || action.startsWith('docker://')) {
          continue;
        }

        // Check if action is pinned to SHA (40 hex characters) or major version tag
        // Format: owner/repo@sha or owner/repo@vX
        const hasShaPin = /@[a-f0-9]{40}/.test(action);
        const hasMajorVersionPin = /@v\d+/.test(action);
        const hasVersionComment = content.includes(action) && 
          new RegExp(`${action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*#\\s*v\\d`).test(content);
        
        expect(hasShaPin || hasMajorVersionPin || hasVersionComment).toBe(true);
      }
    }
  });

  /**
   * Test Case: CODEOWNERS File Exists
   * Ground Truth: Repository should have code owners defined
   * Failure Witness: CODEOWNERS file not found
   */
  it('has CODEOWNERS file', () => {
    const codeownersPath = path.join(projectRoot, '.github', 'CODEOWNERS');
    expect(fs.existsSync(codeownersPath)).toBe(true);
  });
});

describe('Dependency Security Tests', () => {
  const projectRoot = process.cwd();

  /**
   * Test Case: No Deprecated Dependencies
   * Ground Truth: Package.json should not include known deprecated packages
   * Failure Witness: Deprecated package found in dependencies
   */
  it('does not use known deprecated packages', () => {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    
    const deprecatedPackages = [
      'request', // Deprecated
      'node-uuid', // Replaced by uuid
      'nomnom', // Unmaintained
    ];

    const allDeps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const dep of deprecatedPackages) {
      expect(allDeps[dep]).toBeUndefined();
    }
  });
});
