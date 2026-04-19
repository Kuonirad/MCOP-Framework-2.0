#!/bin/bash
# Eco-Fitness Score Calculator
# Measures repository health using ecological metrics

set -e

echo "🌿 MCOP Framework Eco-Fitness Audit"
echo "====================================="
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Helper function for scoring
score_metric() {
  local name=$1
  local value=$2
  local target=$3
  local weight=$4

  # Calculate percentage of target achieved
  local pct=$(echo "scale=2; ($value / $target) * 100" | bc)
  if (( $(echo "$pct > 100" | bc -l) )); then
    pct=100
  fi

  # Calculate weighted score
  local weighted=$(echo "scale=2; ($pct * $weight) / 100" | bc)

  # Color based on score
  local color=$GREEN
  if (( $(echo "$pct < 50" | bc -l) )); then
    color=$RED
  elif (( $(echo "$pct < 80" | bc -l) )); then
    color=$YELLOW
  fi

  printf "${color}%-25s: %6.2f / %6.2f (%.1f%%)${NC}\n" "$name" "$value" "$target" "$pct"
  echo "$weighted"
}

# 1. ABUNDANCE/VISIBILITY (Weight: 10%)
echo "📊 Factor 1: Abundance/Visibility (10% weight)"
echo "----------------------------------------------"

# Get stars and forks (if gh available)
if command -v gh &> /dev/null; then
  STARS=$(gh repo view --json stargazerCount -q .stargazerCount 2>/dev/null || echo 0)
  FORKS=$(gh repo view --json forkCount -q .forkCount 2>/dev/null || echo 0)
else
  STARS=0
  FORKS=0
fi

ABUNDANCE=$((STARS + FORKS))
TARGET_ABUNDANCE=100
visibility_score=$(score_metric "Stars + Forks" "$ABUNDANCE" "$TARGET_ABUNDANCE" "10")

echo ""

# 2. METABOLIC RATE (Weight: 25%)
echo "⚡ Factor 2: Metabolic Rate (25% weight)"
echo "----------------------------------------"

COMMITS_6MO=$(git log --since="6 months ago" --oneline | wc -l)
DAYS_180=180
COMMITS_PER_DAY=$(echo "scale=2; $COMMITS_6MO / $DAYS_180" | bc)
TARGET_COMMITS_PER_DAY=3.0

metabolic_score=$(score_metric "Commits/day" "$COMMITS_PER_DAY" "$TARGET_COMMITS_PER_DAY" "25")

echo ""

# 3. PREDATOR RESILIENCE (Weight: 30%)
echo "🛡️  Factor 3: Predator Resilience (30% weight)"
echo "----------------------------------------------"

# Run npm audit
VULNERABILITIES=$(npm audit --json 2>/dev/null | jq -r '.metadata.vulnerabilities.total' || echo 0)
SECURITY_SCORE=10

if [ "$VULNERABILITIES" -gt 0 ]; then
  SECURITY_SCORE=$(echo "10 - ($VULNERABILITIES * 0.5)" | bc)
  if (( $(echo "$SECURITY_SCORE < 0" | bc -l) )); then
    SECURITY_SCORE=0
  fi
fi

resilience_score=$(score_metric "Security score" "$SECURITY_SCORE" "10" "30")

echo ""

# 4. BIODIVERSITY (Weight: 20%)
echo "🌱 Factor 4: Biodiversity (20% weight)"
echo "---------------------------------------"

# Count unique contributors
CONTRIBUTORS=$(git log --all --format='%aN' | sort -u | wc -l)
TARGET_CONTRIBUTORS=10

# Calculate Shannon Diversity Index
shannon_index=$(git log --all --format='%aN' | sort | uniq -c | awk '
{
  count[NR] = $1
  total += $1
}
END {
  H = 0
  for (i in count) {
    p = count[i] / total
    if (p > 0) {
      H -= p * log(p)
    }
  }
  print H
}' | bc -l | xargs printf "%.2f")

TARGET_SHANNON=2.0

biodiversity_score=$(score_metric "Contributors" "$CONTRIBUTORS" "$TARGET_CONTRIBUTORS" "10")
diversity_score=$(score_metric "Shannon Index" "$shannon_index" "$TARGET_SHANNON" "10")

# Calculate bus factor (simplified: top contributor commit %)
BUS_FACTOR=$(git log --all --format='%aN' | sort | uniq -c | sort -rn | head -1 | awk '{pct = ($1/total)*100; if(pct > 50) print 1.0; else if(pct > 30) print 2.0; else print 3.0}' total=$(git log --all --oneline | wc -l))

echo ""

# 5. SUCCESSION STAGE (Weight: 15%)
echo "🌳 Factor 5: Succession Stage (15% weight)"
echo "-------------------------------------------"

# Calculate repo age in days
FIRST_COMMIT=$(git log --all --reverse --format='%at' | head -1)
NOW=$(date +%s)
AGE_DAYS=$(( (NOW - FIRST_COMMIT) / 86400 ))
TARGET_AGE=365  # 1 year

# Growth sustainability (commits last 30 days vs prior 30)
COMMITS_LAST30=$(git log --since="30 days ago" --oneline | wc -l)
COMMITS_PRIOR30=$(git log --since="60 days ago" --until="30 days ago" --oneline | wc -l)

if [ "$COMMITS_PRIOR30" -gt 0 ]; then
  GROWTH_RATE=$(echo "scale=2; $COMMITS_LAST30 / $COMMITS_PRIOR30" | bc)
else
  GROWTH_RATE=1.0
fi

succession_score=$(score_metric "Age (days)" "$AGE_DAYS" "$TARGET_AGE" "15")

echo ""

# COMPOSITE SCORE
echo "================================="
echo "🎯 COMPOSITE ECO-FITNESS SCORE"
echo "================================="

TOTAL=$(echo "$visibility_score + $metabolic_score + $resilience_score + $biodiversity_score + $diversity_score + $succession_score" | bc)

printf "Total Score: ${GREEN}%.2f / 100${NC}\n\n" "$TOTAL"

# Classification
if (( $(echo "$TOTAL >= 90" | bc -l) )); then
  echo "🏆 Classification: CLIMAX ECOSYSTEM (Antifragile)"
elif (( $(echo "$TOTAL >= 75" | bc -l) )); then
  echo "🌿 Classification: THRIVING PIONEER (Maturing)"
elif (( $(echo "$TOTAL >= 60" | bc -l) )); then
  echo "🌱 Classification: ACTIVE PIONEER (Growing)"
elif (( $(echo "$TOTAL >= 40" | bc -l) )); then
  echo "⚠️  Classification: EPHEMERAL ANNUAL (Fragile)"
else
  echo "💀 Classification: GHOST FOREST (At Risk)"
fi

echo ""

# Critical warnings
echo "⚠️  CRITICAL WARNINGS"
echo "--------------------"

if (( $(echo "$BUS_FACTOR < 2" | bc -l) )); then
  printf "${RED}• Bus Factor = %.1f (CRITICAL: Ecosystem collapses if 1 person leaves)${NC}\n" "$BUS_FACTOR"
fi

if [ "$VULNERABILITIES" -gt 0 ]; then
  printf "${RED}• $VULNERABILITIES security vulnerabilities detected${NC}\n"
fi

if (( $(echo "$shannon_index < 1.5" | bc -l) )); then
  printf "${YELLOW}• Low biodiversity (Shannon = $shannon_index). Risk of monoculture collapse.${NC}\n"
fi

if [ "$ABUNDANCE" -lt 10 ]; then
  printf "${YELLOW}• Low visibility ($ABUNDANCE stars/forks). Community may not know you exist.${NC}\n"
fi

echo ""
echo "📈 Next Steps: See ROADMAP_TO_100.md"
echo ""
