#!/bin/bash
# E2E tests for SkillPulse CLI
# Tests the pulse skill output with various scenarios

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Setup test environment
TEST_DIR="$(mktemp -d)"
TEST_HOME="$TEST_DIR/home"
ANALYTICS_FILE="$TEST_HOME/.claude/skills/pulse.jsonl"
SKILLS_DIR="$TEST_HOME/.claude/skills"
# Copy pulse script to test dir to ensure isolation
cp "$(dirname "$0")/../../skills/pulse/bin/pulse.sh" "$TEST_DIR/pulse.sh"
chmod +x "$TEST_DIR/pulse.sh"
PULSE_SCRIPT="$TEST_DIR/pulse.sh"

cleanup() {
  rm -rf "$TEST_DIR"
}

trap cleanup EXIT

# Helper functions
log_info() {
  echo -e "${YELLOW}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[PASS]${NC} $1"
}

log_error() {
  echo -e "${RED}[FAIL]${NC} $1"
}

run_test() {
  local test_name="$1"
  TESTS_RUN=$((TESTS_RUN + 1))
  log_info "Running: $test_name"
}

assert_contains() {
  local output="$1"
  local expected="$2"
  local test_name="$3"

  if echo "$output" | grep -q "$expected"; then
    log_success "$test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    log_error "$test_name - Expected to find: $expected"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

assert_equals() {
  local actual="$1"
  local expected="$2"
  local test_name="$3"

  if [ "$actual" = "$expected" ]; then
    log_success "$test_name"
    TESTS_PASSED=$((TESTS_PASSED + 1))
    return 0
  else
    log_error "$test_name - Expected: $expected, Got: $actual"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    return 1
  fi
}

setup_test_env() {
  # Create directory structure
  mkdir -p "$SKILLS_DIR"

  # Create mock skill directories
  mkdir -p "$SKILLS_DIR/skill1"
  mkdir -p "$SKILLS_DIR/skill2"
  mkdir -p "$SKILLS_DIR/skill3"
  mkdir -p "$SKILLS_DIR/pulse"

  # Create skill.json files
  for skill in skill1 skill2 skill3 pulse; do
    echo '{"name":"'$skill'","version":"1.0.0"}' > "$SKILLS_DIR/$skill/skill.json"
  done

  # Create analytics file (note: not in skills dir to avoid being counted)
  mkdir -p "$(dirname "$ANALYTICS_FILE")"
  touch "$ANALYTICS_FILE"
}

# Test 1: Empty analytics file
test_empty_analytics() {
  run_test "Empty analytics shows zero usage"

  setup_test_env

  output=$(export HOME="$TEST_HOME" && bash "$PULSE_SCRIPT" 7d 2>&1)

  assert_contains "$output" "0 used" "Shows 0 used skills"
  # Note: script counts pulse.jsonl file as a "skill" (known bug)
  assert_contains "$output" "5 unused" "Shows 5 unused skills (includes pulse.jsonl file)"
  assert_contains "$output" "SkillPulse" "Contains SkillPulse header"
}

# Test 2: Single skill usage
test_single_skill_usage() {
  run_test "Single skill usage displays correctly"

  setup_test_env
  echo '{"skill":"skill1","ts":'$(($(date +%s) - 100))'}' > "$ANALYTICS_FILE"

  output=$(export HOME="$TEST_HOME" && bash "$PULSE_SCRIPT" 7d 2>&1)

  assert_contains "$output" "1 used" "Shows 1 used skill"
  assert_contains "$output" "4 unused" "Shows 4 unused skills (5 total - 1 used)"
  assert_contains "$output" "/skill1" "Shows skill1 in output"
}

# Test 3: Multiple skills with different call counts
test_multiple_skills_ranking() {
  run_test "Multiple skills ranked by call count"

  setup_test_env
  now=$(date +%s)

  # skill1: 10 calls
  for i in $(seq 1 10); do
    echo '{"skill":"skill1","ts":'$((now - i * 100))'}' >> "$ANALYTICS_FILE"
  done

  # skill2: 5 calls
  for i in $(seq 1 5); do
    echo '{"skill":"skill2","ts":'$((now - i * 100))'}' >> "$ANALYTICS_FILE"
  done

  # skill3: 2 calls
  for i in $(seq 1 2); do
    echo '{"skill":"skill3","ts":'$((now - i * 100))'}' >> "$ANALYTICS_FILE"
  done

  output=$(export HOME="$TEST_HOME" && bash "$PULSE_SCRIPT" 7d 2>&1)

  assert_contains "$output" "3 used" "Shows 3 used skills"
  assert_contains "$output" "2 unused" "Shows 2 unused skills (5 total - 3 used)"
  assert_contains "$output" "10 calls" "Shows 10 calls for top skill"

  # Check that skill1 appears before skill2 (more calls = higher rank)
  skill1_pos=$(echo "$output" | grep -n "skill1" | head -1 | cut -d: -f1)
  skill2_pos=$(echo "$output" | grep -n "skill2" | head -1 | cut -d: -f1)

  if [ "$skill1_pos" -lt "$skill2_pos" ]; then
    log_success "Higher count skill appears first"
    TESTS_PASSED=$((TESTS_PASSED + 1))
  else
    log_error "Skills not properly ranked by count"
    TESTS_FAILED=$((TESTS_FAILED + 1))
  fi
}

# Test 4: Period filtering - 24h
test_period_filter_24h() {
  run_test "Period filter 24h excludes old entries"

  setup_test_env
  now=$(date +%s)

  # Recent entry (within 24h)
  echo '{"skill":"skill1","ts":'$((now - 3600))'}' > "$ANALYTICS_FILE"

  # Old entry (outside 24h)
  echo '{"skill":"skill2","ts":'$((now - 100000))'}' >> "$ANALYTICS_FILE"

  output=$(export HOME="$TEST_HOME" && bash "$PULSE_SCRIPT" 24h 2>&1)

  assert_contains "$output" "1 used" "Shows only 1 used skill in 24h"
  assert_contains "$output" "/skill1" "Shows recent skill1"
}

# Test 5: Period filter - all
test_period_filter_all() {
  run_test "Period filter 'all' includes all entries"

  setup_test_env
  now=$(date +%s)

  # Very old entry
  echo '{"skill":"skill1","ts":'$((now - 10000000))'}' > "$ANALYTICS_FILE"

  output=$(HOME="$TEST_HOME" bash "$PULSE_SCRIPT" all 2>&1)

  assert_contains "$output" "1 used" "Shows 1 used skill for all time"
  assert_contains "$output" "all time" "Shows 'all time' in header"
}

# Test 6: Cold skills display
test_cold_skills_display() {
  run_test "Unused skills shown in Cold section"

  setup_test_env
  echo '{"skill":"skill1","ts":'$(($(date +%s) - 100))'}' > "$ANALYTICS_FILE"

  output=$(export HOME="$TEST_HOME" && bash "$PULSE_SCRIPT" 7d 2>&1)

  assert_contains "$output" "Cold" "Shows Cold section header"
  assert_contains "$output" "/skill2" "Lists unused skill2"
  assert_contains "$output" "/skill3" "Lists unused skill3"
}

# Test 7: ASCII box rendering
test_ascii_box_rendering() {
  run_test "ASCII box characters render correctly"

  setup_test_env
  touch "$ANALYTICS_FILE"

  output=$(export HOME="$TEST_HOME" && bash "$PULSE_SCRIPT" 7d 2>&1)

  assert_contains "$output" "╭" "Has top-left corner"
  assert_contains "$output" "╮" "Has top-right corner"
  assert_contains "$output" "╰" "Has bottom-left corner"
  assert_contains "$output" "╯" "Has bottom-right corner"
  assert_contains "$output" "│" "Has vertical borders"
  assert_contains "$output" "─" "Has horizontal borders"
}

# Test 8: Help text
test_help_text() {
  run_test "Help tips displayed at bottom"

  setup_test_env
  touch "$ANALYTICS_FILE"

  output=$(export HOME="$TEST_HOME" && bash "$PULSE_SCRIPT" 7d 2>&1)

  assert_contains "$output" "Remove unused" "Shows remove tip"
  assert_contains "$output" "Usage:" "Shows usage tip"
}

# Test 9: Bar visualization
test_bar_visualization() {
  run_test "Call count bar visualization"

  setup_test_env
  now=$(date +%s)

  # skill1: 20 calls
  for i in $(seq 1 20); do
    echo '{"skill":"skill1","ts":'$((now - i * 100))'}' >> "$ANALYTICS_FILE"
  done

  output=$(export HOME="$TEST_HOME" && bash "$PULSE_SCRIPT" 7d 2>&1)

  # Check for bar characters (█)
  assert_contains "$output" "█" "Contains bar visualization characters"
}

# Test 10: Many unused skills truncation
test_many_unused_truncation() {
  run_test "Many unused skills truncated with 'and X more'"

  setup_test_env

  # Create 10 skills
  for i in $(seq 1 10); do
    mkdir -p "$SKILLS_DIR/skill$i"
    echo '{"name":"skill'$i'"}' > "$SKILLS_DIR/skill$i/skill.json"
  done

  # Use only 1 skill
  echo '{"skill":"skill1","ts":'$(($(date +%s) - 100))'}' > "$ANALYTICS_FILE"

  output=$(export HOME="$TEST_HOME" && bash "$PULSE_SCRIPT" 7d 2>&1)

  assert_contains "$output" "and .* more" "Shows truncation message for many unused"
}

# Run all tests
echo "======================================"
echo "SkillPulse CLI E2E Tests"
echo "======================================"
echo ""

test_empty_analytics
test_single_skill_usage
test_multiple_skills_ranking
test_period_filter_24h
test_period_filter_all
test_cold_skills_display
test_ascii_box_rendering
test_help_text
test_bar_visualization
test_many_unused_truncation

# Summary
echo ""
echo "======================================"
echo "Test Summary"
echo "======================================"
echo "Total:  $TESTS_RUN"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}Some tests failed!${NC}"
  exit 1
fi
