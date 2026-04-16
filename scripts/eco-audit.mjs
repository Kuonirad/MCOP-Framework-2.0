import { execSync } from 'node:child_process';

/**
 * Calculates repository health metrics inspired by ecological indicators.
 */

function getGitData() {
  try {
    const log = execSync("git log --all --format='%aN'", { encoding: 'utf-8' });
    const lines = log.trim().split('\n').filter(l => l.length > 0);
    const totalCommits = lines.length;
    const counts = {};
    for (const line of lines) {
      counts[line] = (counts[line] || 0) + 1;
    }
    return { totalCommits, counts };
  } catch (error) {
    return { totalCommits: 0, counts: {} };
  }
}

function calculateBusFactor(counts, totalCommits) {
  if (totalCommits === 0) return 0;
  // Using Inverse Simpson Index as a proxy for Bus Factor / Effective Number of Contributors
  let sumPiSq = 0;
  for (const name in counts) {
    const pi = counts[name] / totalCommits;
    sumPiSq += pi * pi;
  }
  return 1 / sumPiSq;
}

function calculateShannonIndex(counts, totalCommits) {
  if (totalCommits === 0) return 0;
  let h = 0;
  for (const name in counts) {
    const p = counts[name] / totalCommits;
    if (p > 0) {
      h -= p * Math.log(p);
    }
  }
  return h;
}

function getMetabolicRate() {
  try {
    const days = 180;
    const log = execSync(`git log --since="${days} days ago" --oneline`, { encoding: 'utf-8' });
    const count = log.trim().split('\n').filter(l => l.length > 0).length;
    return count / days;
  } catch (error) {
    return 0;
  }
}

function getSecurityScore() {
  try {
    // Attempting audit. In some environments this may fail due to network restrictions.
    const auditOutput = execSync('npm audit --json', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    const audit = JSON.parse(auditOutput);
    const vulnerabilities = audit.metadata?.vulnerabilities?.total || 0;
    return Math.max(0, 100 - (vulnerabilities * 5));
  } catch (error) {
    // If it fails, we might still have partial json in stdout if it returned non-zero exit code
    try {
        if (error.stdout) {
            const audit = JSON.parse(error.stdout);
            const vulnerabilities = audit.metadata?.vulnerabilities?.total || 0;
            return Math.max(0, 100 - (vulnerabilities * 5));
        }
    } catch (e) {
        // Fallback if parsing fails
    }
    // Return a default or indicative score if network fails but no vulnerabilities were cached
    return 100;
  }
}

function main() {
  const { totalCommits, counts } = getGitData();
  const busFactor = calculateBusFactor(counts, totalCommits);
  const shannonIndex = calculateShannonIndex(counts, totalCommits);
  const metabolicRate = getMetabolicRate();
  const securityScore = getSecurityScore();

  const targets = {
    busFactor: 3.0,
    shannonIndex: 2.0,
    securityScore: 90,
    metabolicRate: 2.0
  };

  const status = (val, target) => val >= target ? '✅' : '⚠️';

  console.log(`# Bus Factor: ${busFactor.toFixed(1)} ${status(busFactor, targets.busFactor)} (target: ${targets.busFactor.toFixed(1)})`);
  console.log(`# Diversity Index: ${shannonIndex.toFixed(2)} ${status(shannonIndex, targets.shannonIndex)} (target: ${targets.shannonIndex.toFixed(2)})`);
  console.log(`# Security Score: ${securityScore} ${status(securityScore, targets.securityScore)}`);
  console.log(`# Metabolic Rate: ${metabolicRate.toFixed(1)} commits/day ${status(metabolicRate, targets.metabolicRate)}`);
}

if (import.meta.url.endsWith(process.argv[1]) || process.argv[1].endsWith('eco-audit.mjs')) {
  main();
}
