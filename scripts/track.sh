#!/bin/bash
# SkillPulse - Track skill usage when SKILL.md files are read
# This hook fires after every Read tool call

# Debug: log env vars to verify they exist
# env | grep CLAUDE >> /tmp/skillpulse-debug.log

# CLAUDE_TOOL_INPUT contains the Read tool's arguments as JSON
FILE=$(echo "$CLAUDE_TOOL_INPUT" | grep -o '"file_path":"[^"]*"' | cut -d'"' -f4)

# Only track if reading a SKILL.md file
if [[ "$FILE" == *"/SKILL.md" ]]; then
  SKILL_NAME=$(basename "$(dirname "$FILE")")

  # Determine trigger type
  TRIGGER="auto"
  # Check if invoked via slash command by reading user input
  if [[ "$CLAUDE_HUMAN_TURN" == *"/$SKILL_NAME"* ]]; then
    TRIGGER="explicit"
  fi

  # Log to plugin data directory
  echo "{\"skill\":\"$SKILL_NAME\",\"ts\":$(date +%s),\"trigger\":\"$TRIGGER\"}" \
    >> "${CLAUDE_PLUGIN_DATA}/pulse.jsonl"
fi
