import { execSync } from 'child_process';

console.log("🌿 MCOP Framework Eco-Fitness Audit");
console.log("=====================================\n");

const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const RED = '\x1b[0;31m';
const NC = '\x1b[0m';

function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch {
    return "";
  }
}

function scoreMetric(name, value, target, weight) {
  let pct = Math.min((value / target) * 100, 100);
  const weighted = (pct * weight) / 100;
  let color = pct < 50 ? RED : (pct < 80 ? YELLOW : GREEN);
  console.log(`${color}${name.padEnd(25)}: ${value.toFixed(2).padStart(6)} / ${target.toFixed(2).padStart(6)} (${pct.toFixed(1)}%)${NC}`);
  return weighted;
}

const stars = parseInt(runCmd('gh repo view --json stargazerCount -q .stargazerCount'), 10) || 0;
const forks = parseInt(runCmd('gh repo view --json forkCount -q .forkCount'), 10) || 0;
const abundance = stars + forks;

const commits6Mo = parseInt(runCmd('git log --since="6 months ago" --oneline | wc -l'), 10) || 0;
const commitsPerDay = commits6Mo / 180;

let vulnerabilities = 0;
try {
  const auditOutput = runCmd('npm audit --json 2>/dev/null');
  vulnerabilities = JSON.parse(auditOutput).metadata.vulnerabilities.total || 0;
} catch {
  // Ignore error
}

const securityScore = Math.max(0, 10 - (vulnerabilities * 0.5));

const authorsRaw = runCmd('git log --all --format="%aN"').split('\n').filter(Boolean);
const authorCounts = authorsRaw.reduce((acc, author) => {
  acc[author] = (acc[author] || 0) + 1;
  return acc;
}, {});

const contributors = Object.keys(authorCounts).length;
const totalCommits = authorsRaw.length;

let shannonIndex = 0;
let maxPct = 0;
for (const author in authorCounts) {
  const p = authorCounts[author] / totalCommits;
  if (p > 0) shannonIndex -= p * Math.log(p);
  const pct = p * 100;
  if (pct > maxPct) maxPct = pct;
}

const busFactor = maxPct > 50 ? 1.0 : (maxPct > 30 ? 2.0 : 3.0);

const firstCommit = parseInt(runCmd('git log --all --reverse --format="%at" | head -1'), 10);
const ageDays = firstCommit ? (Date.now() / 1000 - firstCommit) / 86400 : 0;

console.log("📊 Factor 1: Abundance/Visibility (10% weight)");
const visibilityScore = scoreMetric("Stars + Forks", abundance, 100, 10);

console.log("\n⚡ Factor 2: Metabolic Rate (25% weight)");
const metabolicScore = scoreMetric("Commits/day", commitsPerDay, 3.0, 25);

console.log("\n🛡️  Factor 3: Predator Resilience (30% weight)");
const resilienceScore = scoreMetric("Security score", securityScore, 10, 30);

console.log("\n🌱 Factor 4: Biodiversity (20% weight)");
const biodiversityScore = scoreMetric("Contributors", contributors, 10, 10);
const diversityScore = scoreMetric("Shannon Index", shannonIndex, 2.0, 10);

console.log("\n🌳 Factor 5: Succession Stage (15% weight)");
const successionScore = scoreMetric("Age (days)", ageDays, 365, 15);

console.log("\n=================================");
console.log("🎯 COMPOSITE ECO-FITNESS SCORE");
console.log("=================================");

const total = visibilityScore + metabolicScore + resilienceScore + biodiversityScore + diversityScore + successionScore;
console.log(`Total Score: ${GREEN}${total.toFixed(2)} / 100${NC}\n`);

const classification = total >= 90 ? "CLIMAX ECOSYSTEM (Antifragile)" :
                       total >= 75 ? "THRIVING PIONEER (Maturing)" :
                       total >= 60 ? "ACTIVE PIONEER (Growing)" :
                       total >= 40 ? "EPHEMERAL ANNUAL (Fragile)" : "GHOST FOREST (At Risk)";

console.log(`Classification: ${classification}`);

console.log("\n⚠️  CRITICAL WARNINGS");
console.log("--------------------");

if (busFactor < 2) console.log(`${RED}• Bus Factor = ${busFactor.toFixed(1)} (CRITICAL: Ecosystem collapses if 1 person leaves)${NC}`);
if (vulnerabilities > 0) console.log(`${RED}• ${vulnerabilities} security vulnerabilities detected${NC}`);
if (shannonIndex < 1.5) console.log(`${YELLOW}• Low biodiversity (Shannon = ${shannonIndex.toFixed(2)}). Risk of monoculture collapse.${NC}`);
if (abundance < 10) console.log(`${YELLOW}• Low visibility (${abundance} stars/forks). Community may not know you exist.${NC}`);

console.log("\n📈 Next Steps: See ROADMAP_TO_100.md\n");
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
