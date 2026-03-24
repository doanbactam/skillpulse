# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

SkillPulse is a Claude Code plugin that tracks skill usage analytics passively via hooks.

## Plugin Structure

```
skillpulse/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest
├── hooks/
│   └── hooks.json           # PostToolUse hook for passive tracking
├── scripts/
│   └── track.sh             # Hook script that logs skill usage
├── skills/
│   └── pulse/
│       └── SKILL.md         # Skill that powers /skillpulse:pulse
└── README.md
```

## How It Works

### Passive Tracking (Hook)

The `hooks/hooks.json` defines a `PostToolUse` hook that fires after every `Read` tool call.

`scripts/track.sh` receives:
- `CLAUDE_TOOL_INPUT` — JSON input of the Read tool (contains file path)
- `CLAUDE_HUMAN_TURN` — Last user message (to detect explicit skill invocation)
- `CLAUDE_PLUGIN_DATA` — Plugin's writable data directory

If the read file ends with `SKILL.md`, it logs the usage to `${CLAUDE_PLUGIN_DATA}/pulse.jsonl`.

### Analytics File Format

```json
{"skill":"careful","ts":1711234567,"trigger":"auto"}
{"skill":"freeze","ts":1711234568,"trigger":"explicit"}
```

- `skill` — Name of the skill (directory name)
- `ts` — Unix timestamp
- `trigger` — "auto" (Claude loaded it) or "explicit" (user invoked via `/skill`)

### The Skill: /skillpulse:pulse

`skills/pulse/SKILL.md` is a user-invocable skill that:
1. Reads `${CLAUDE_PLUGIN_DATA}/pulse.jsonl`
2. Filters by time period (24h/7d/30d/all)
3. Scans for all installed skills
4. Outputs usage statistics with hot/cold breakdown

## Testing Locally

```bash
claude --plugin-dir ./skillpulse
```

Then:
1. Trigger a few skills (Claude will read their SKILL.md files)
2. Run `/skillpulse:pulse` to verify data flows

## Install Flow (for users)

```bash
/plugin install github:doanbactam/skillpulse
```

Then use:
```
/skillpulse:pulse
/skillpulse:pulse 30d
```
