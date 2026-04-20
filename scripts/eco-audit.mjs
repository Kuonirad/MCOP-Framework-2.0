import { execSync } from 'node:child_process';

const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[1;33m';
const RED = '\x1b[0;31m';
const NC = '\x1b[0m';

function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function scoreMetric(name, value, target, weight) {
  const pct = Math.min((value / target) * 100, 100);
  const weighted = (pct * weight) / 100;
  const color = pct < 50 ? RED : pct < 80 ? YELLOW : GREEN;
  console.log(
    `${color}${name.padEnd(25)}: ${value.toFixed(2).padStart(6)} / ${target.toFixed(2).padStart(6)} (${pct.toFixed(1)}%)${NC}`,
  );
  return weighted;
}

function main() {
  console.log('🌿 MCOP Framework Eco-Fitness Audit');
  console.log('=====================================\n');

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
    // audit unavailable
  }
  const securityScore = Math.max(0, 10 - vulnerabilities * 0.5);

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
  const busFactor = maxPct > 50 ? 1.0 : maxPct > 30 ? 2.0 : 3.0;

  const firstCommit = parseInt(runCmd('git log --all --reverse --format="%at" | head -1'), 10);
  const ageDays = firstCommit ? (Date.now() / 1000 - firstCommit) / 86400 : 0;

  console.log('📊 Factor 1: Abundance/Visibility (10% weight)');
  const visibilityScore = scoreMetric('Stars + Forks', abundance, 100, 10);

  console.log('\n⚡ Factor 2: Metabolic Rate (25% weight)');
  const metabolicScore = scoreMetric('Commits/day', commitsPerDay, 3.0, 25);

  console.log('\n🛡️  Factor 3: Predator Resilience (30% weight)');
  const resilienceScore = scoreMetric('Security score', securityScore, 10, 30);

  console.log('\n🌱 Factor 4: Biodiversity (20% weight)');
  const biodiversityScore = scoreMetric('Contributors', contributors, 10, 10);
  const diversityScore = scoreMetric('Shannon Index', shannonIndex, 2.0, 10);

  console.log('\n🌳 Factor 5: Succession Stage (15% weight)');
  const successionScore = scoreMetric('Age (days)', ageDays, 365, 15);

  console.log('\n=================================');
  console.log('🎯 COMPOSITE ECO-FITNESS SCORE');
  console.log('=================================');

  const total =
    visibilityScore +
    metabolicScore +
    resilienceScore +
    biodiversityScore +
    diversityScore +
    successionScore;
  console.log(`Total Score: ${GREEN}${total.toFixed(2)} / 100${NC}\n`);

  const classification =
    total >= 90
      ? 'CLIMAX ECOSYSTEM (Antifragile)'
      : total >= 75
        ? 'THRIVING PIONEER (Maturing)'
        : total >= 60
          ? 'ACTIVE PIONEER (Growing)'
          : total >= 40
            ? 'EPHEMERAL ANNUAL (Fragile)'
            : 'GHOST FOREST (At Risk)';

  console.log(`Classification: ${classification}`);

  const warnings = [];
  if (busFactor < 2) warnings.push(`Bus Factor = ${busFactor.toFixed(1)}`);
  if (vulnerabilities > 0) warnings.push(`${vulnerabilities} security vulnerabilities detected`);
  if (shannonIndex < 1.5) warnings.push(`Low Shannon diversity = ${shannonIndex.toFixed(2)}`);
  if (abundance < 10) warnings.push(`Low visibility (${abundance} stars/forks)`);

  if (warnings.length > 0) {
    console.log('\nAdvisories');
    console.log('----------');
    for (const w of warnings) console.log(`• ${w}`);
  }
}

main();
