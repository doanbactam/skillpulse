#!/bin/bash
# SkillPulse — See your Claude Code skills come alive
# Analytics: ~/.claude/skills/pulse.jsonl

set -euo pipefail

ANALYTICS_FILE="$HOME/.claude/skills/pulse.jsonl"
SKILLS_DIR="$HOME/.claude/skills"
PERIOD="${1:-7d}"
NOW=$(date +%s)

# Period variants - explicit functions for each period
today_cutoff()   { echo $((NOW - 86400)); }
week_cutoff()    { echo $((NOW - 604800)); }
month_cutoff()  { echo $((NOW - 2592000)); }
all_cutoff()     { echo 0; }

# Period registry
resolve_cutoff() {
  case "$1" in
    24h|today)  today_cutoff; echo "today" ;;
    7d|week|"") week_cutoff; echo "7 days" ;;
    30d|month)  month_cutoff; echo "30 days" ;;
    all|ever)   all_cutoff; echo "all time" ;;
    *)          week_cutoff; echo "7 days" ;;
  esac
}

# Resolve period variant
RESULT=$(resolve_cutoff "$PERIOD")
CUTOFF=$(echo "$RESULT" | head -1)
LABEL=$(echo "$RESULT" | tail -1)

# Ensure analytics directory exists
mkdir -p "$(dirname "$ANALYTICS_FILE")"

# Count total skills
TOTAL_SKILLS=$(ls -A "$SKILLS_DIR" 2>/dev/null | wc -l)

# Get usage data within period (single-pass awk)
USAGE_DATA=$(awk -v cutoff="$CUTOFF" '
  /"ts":[0-9]+/ {
    match($0, /"ts":([0-9]+)/, a); ts = a[1]
    if (ts >= cutoff) {
      match($0, /"skill":"([^"]+)"/, a)
      if (a[1] != "") skills[a[1]]++
    }
  }
  END { for (s in skills) print skills[s], s }
' "$ANALYTICS_FILE" 2>/dev/null | sort -rn)

# Count used skills
if [ -n "$USAGE_DATA" ]; then
  USED_SKILLS=$(echo "$USAGE_DATA" | wc -l)
  MAX_CALLS=$(echo "$USAGE_DATA" | head -1 | awk '{print $1}')
else
  USED_SKILLS=0
  MAX_CALLS=1
fi

UNUSED_SKILLS=$((TOTAL_SKILLS - USED_SKILLS))

# Render output
render_header() {
  local label="$1"
  local total="$2"
  local used="$3"
  local unused="$4"

  echo "╭─────────────────────────────────────────────────────╮"
  echo "│  SkillPulse • Last $label" | tr -d '\n' | head -c 54 && echo " │"
  echo "├─────────────────────────────────────────────────────┤"
  echo "│  📊 $total skills • $used used • $unused unused" | tr -d '\n' | head -c 54 && echo " │"
  echo "│                                                       │"
  echo "│  🔥 Hot                                               │"
  echo "│  ──────────────────────────────────────────────────── │"
}

render_skill_bar() {
  local name="$1"
  local count="$2"
  local max="$3"

  local bar_length=$((count * 40 / max))
  [ "$bar_length" -gt 40 ] && bar_length=40
  local bar=$(printf '█%.0s' $(seq 1 $bar_length))

  printf "│  /%-12s %3d calls  %-30s │\n" "$name" "$count" "$bar"
}

render_cold() {
  local unused="$1"

  echo "│                                                       │"
  echo "│  ❄️  Cold ($unused unused)                                │"
  echo "│  ──────────────────────────────────────────────────── │"
}

render_footer() {
  echo "╰─────────────────────────────────────────────────────╯"
  echo ""
  echo "💡  Remove unused: rm -rf ~/.claude/skills/SKILL_NAME"
  echo "💡  Usage: /pulse [24h|7d|30d|all]"
}

# Main render
render_header "$LABEL" "$TOTAL_SKILLS" "$USED_SKILLS" "$UNUSED_SKILLS"

if [ -n "$USAGE_DATA" ]; then
  echo "$USAGE_DATA" | head -5 | while read -r count skill; do
    [ -z "$skill" ] && continue
    [ "$skill" = '""' ] && continue
    render_skill_bar "$skill" "$count" "$MAX_CALLS"
  done
fi

render_cold "$UNUSED_SKILLS"

# Pre-compute used skill names for O(1) lookup
USED_SKILL_NAMES=$(echo "$USAGE_DATA" | awk '{print $2}' | sort -u)

# Get first few unused skills
UNUSED_COUNT=0
for skill_dir in "$SKILLS_DIR"/*/; do
  [ -d "$skill_dir" ] || continue
  skill_name=$(basename "$skill_dir")

  if echo "$USED_SKILL_NAMES" | grep -qx "$skill_name"; then
    continue
  fi

  [ "$skill_name" = "pulse" ] && continue

  if [ "$UNUSED_COUNT" -lt 3 ]; then
    printf "│  /%-13s                                      │\n" "$skill_name"
    UNUSED_COUNT=$((UNUSED_COUNT + 1))
  fi
done

if [ "$UNUSED_SKILLS" -gt 3 ]; then
  echo "│  ... and $((UNUSED_SKILLS - 3)) more                                  │"
fi

render_footer
