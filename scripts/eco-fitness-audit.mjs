import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log("🌿 MCOP Framework Eco-Fitness Audit");
console.log("=====================================\n");

const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const RED = '\x1b[0;31m';
const NC = '\x1b[0m';

function scoreMetric(name, value, target, weight) {
  let pct = (value / target) * 100;
  if (pct > 100) pct = 100;

  const weighted = (pct * weight) / 100;

  let color = GREEN;
  if (pct < 50) color = RED;
  else if (pct < 80) color = YELLOW;

  console.log(`${color}${name.padEnd(25)}: ${value.toFixed(2).padStart(6)} / ${target.toFixed(2).padStart(6)} (${pct.toFixed(1)}%)${NC}`);
  return weighted;
}

// 1. ABUNDANCE/VISIBILITY
console.log("📊 Factor 1: Abundance/Visibility (10% weight)");
console.log("----------------------------------------------");
let stars = 0, forks = 0;
try {
  stars = parseInt(execSync('gh repo view --json stargazerCount -q .stargazerCount', { encoding: 'utf8' }).trim(), 10) || 0;
  forks = parseInt(execSync('gh repo view --json forkCount -q .forkCount', { encoding: 'utf8' }).trim(), 10) || 0;
} catch (e) {
  // gh cli not available
}
const abundance = stars + forks;
const visibilityScore = scoreMetric("Stars + Forks", abundance, 100, 10);
console.log("");

// 2. METABOLIC RATE
console.log("⚡ Factor 2: Metabolic Rate (25% weight)");
console.log("----------------------------------------");
const commits6Mo = parseInt(execSync('git log --since="6 months ago" --oneline | wc -l', { encoding: 'utf8' }).trim(), 10) || 0;
const commitsPerDay = commits6Mo / 180;
const metabolicScore = scoreMetric("Commits/day", commitsPerDay, 3.0, 25);
console.log("");

// 3. PREDATOR RESILIENCE
console.log("🛡️  Factor 3: Predator Resilience (30% weight)");
console.log("----------------------------------------------");
let vulnerabilities = 0;
try {
  const auditOutput = execSync('npm audit --json 2>/dev/null || true', { encoding: 'utf8' });
  vulnerabilities = JSON.parse(auditOutput).metadata.vulnerabilities.total || 0;
} catch (e) {
  try {
     const pnpmAuditOutput = execSync('pnpm audit --json 2>/dev/null || true', { encoding: 'utf8' });
     const auditObj = JSON.parse(pnpmAuditOutput);
     if (auditObj && auditObj.vulnerabilities) {
         for(const key in auditObj.vulnerabilities) {
            vulnerabilities += auditObj.vulnerabilities[key].length;
         }
     } else if (auditObj && auditObj.metadata && auditObj.metadata.vulnerabilities) {
          vulnerabilities = auditObj.metadata.vulnerabilities.total || 0;
     }
  } catch (e2) {}
}

let securityScore = 10;
if (vulnerabilities > 0) {
  securityScore = Math.max(0, 10 - (vulnerabilities * 0.5));
}
const resilienceScore = scoreMetric("Security score", securityScore, 10, 30);
console.log("");

// 4. BIODIVERSITY
console.log("🌱 Factor 4: Biodiversity (20% weight)");
console.log("---------------------------------------");
const authorsRaw = execSync('git log --all --format="%aN"', { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const authorCounts = {};
for (const author of authorsRaw) {
  authorCounts[author] = (authorCounts[author] || 0) + 1;
}
const contributors = Object.keys(authorCounts).length;
const totalCommits = authorsRaw.length;

let shannonIndex = 0;
for (const author in authorCounts) {
  const p = authorCounts[author] / totalCommits;
  if (p > 0) shannonIndex -= p * Math.log(p);
}

const biodiversityScore = scoreMetric("Contributors", contributors, 10, 10);
const diversityScore = scoreMetric("Shannon Index", shannonIndex, 2.0, 10);

let maxPct = 0;
for (const author in authorCounts) {
  const pct = (authorCounts[author] / totalCommits) * 100;
  if (pct > maxPct) maxPct = pct;
}
const busFactor = maxPct > 50 ? 1.0 : (maxPct > 30 ? 2.0 : 3.0);
console.log("");

// 5. SUCCESSION STAGE
console.log("🌳 Factor 5: Succession Stage (15% weight)");
console.log("-------------------------------------------");
let ageDays = 0;
try {
  const firstCommit = parseInt(execSync('git log --all --reverse --format="%at" | head -1', { encoding: 'utf8' }).trim(), 10);
  ageDays = (Date.now() / 1000 - firstCommit) / 86400;
} catch (e) {}

const successionScore = scoreMetric("Age (days)", ageDays, 365, 15);
console.log("");

// COMPOSITE SCORE
console.log("=================================");
console.log("🎯 COMPOSITE ECO-FITNESS SCORE");
console.log("=================================");

const total = visibilityScore + metabolicScore + resilienceScore + biodiversityScore + diversityScore + successionScore;
console.log(`Total Score: ${GREEN}${total.toFixed(2)} / 100${NC}\n`);

let classification = "";
if (total >= 90) classification = "CLIMAX ECOSYSTEM (Antifragile)";
else if (total >= 75) classification = "THRIVING PIONEER (Maturing)";
else if (total >= 60) classification = "ACTIVE PIONEER (Growing)";
else if (total >= 40) classification = "EPHEMERAL ANNUAL (Fragile)";
else classification = "GHOST FOREST (At Risk)";

if (total >= 90) console.log(`🏆 Classification: ${classification}`);
else if (total >= 75) console.log(`🌿 Classification: ${classification}`);
else if (total >= 60) console.log(`🌱 Classification: ${classification}`);
else if (total >= 40) console.log(`⚠️  Classification: ${classification}`);
else console.log(`💀 Classification: ${classification}`);

console.log("\n⚠️  CRITICAL WARNINGS");
console.log("--------------------");

if (busFactor < 2) console.log(`${RED}• Bus Factor = ${busFactor.toFixed(1)} (CRITICAL: Ecosystem collapses if 1 person leaves)${NC}`);
if (vulnerabilities > 0) console.log(`${RED}• ${vulnerabilities} security vulnerabilities detected${NC}`);
if (shannonIndex < 1.5) console.log(`${YELLOW}• Low biodiversity (Shannon = ${shannonIndex.toFixed(2)}). Risk of monoculture collapse.${NC}`);
if (abundance < 10) console.log(`${YELLOW}• Low visibility (${abundance} stars/forks). Community may not know you exist.${NC}`);

console.log("\n📈 Next Steps: See ROADMAP_TO_100.md\n");
