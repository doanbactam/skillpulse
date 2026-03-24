# SkillPulse

> Track which Claude Code skills you actually use

A Claude Code plugin that passively tracks skill usage via hooks. Works with ALL skills — no opt-in required.

**Cross-platform:** Works on Windows, macOS, and Linux.

## Requirements

- **Node.js v18.0.0 or later**

## Install

```bash
/plugin install github:doanbactam/skillpulse
```

## Usage

### View Analytics

```
/skillpulse:pulse           # Last 7 days (default)
/skillpulse:pulse 24h       # Today
/skillpulse:pulse 30d       # Last month
/skillpulse:pulse all       # All time
```

### Data Management

```bash
# Rotate data - remove entries older than retention period
node ${CLAUDE_PLUGIN_ROOT}/scripts/rotate.js 30   # Keep last 30 days (default)
node ${CLAUDE_PLUGIN_ROOT}/scripts/rotate.js 7    # Keep last 7 days

# Export data to JSON or CSV
node ${CLAUDE_PLUGIN_ROOT}/scripts/export.js json  # Export as JSON array
node ${CLAUDE_PLUGIN_ROOT}/scripts/export.js csv   # Export as CSV

# Reset all analytics data (requires --force)
node ${CLAUDE_PLUGIN_ROOT}/scripts/reset.js --force
```

## Output

```
╭──────────────────────────────────────────╮
│  skillpulse • Last 7 days                │
├──────────────────────────────────────────┤
│  39 skills • 11 used • 28 unused         │
│                                          │
│  🔥 Hot                                  │
│  /careful    98 calls  ████████████████  │
│  /freeze     18 calls  ███               │
│  /ship       13 calls  ██                │
│                                          │
│  ❄️  Cold (28 unused)                    │
│  /baseline-ui, /benchmark, /browse...    │
╰──────────────────────────────────────────╯

💡 Remove unused: rm -rf ~/.claude/skills/SKILL_NAME
```

## How It Works

1. **Hook-based tracking** — PostToolUse hook fires when Claude reads any `SKILL.md`
2. **Passive collection** — No skill author opt-in required
3. **Local storage** — Data stored at `${CLAUDE_PLUGIN_DATA}/pulse.jsonl`
4. **Trigger detection** — Distinguishes explicit `/skill` calls from auto-invocations
5. **Cross-platform** — Built with Node.js for Windows, macOS, and Linux

## Plugin Structure

```
skillpulse/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest
├── hooks/
│   └── hooks.json           # PostToolUse hook config
├── scripts/
│   ├── track.js             # Tracking script (Node.js)
│   ├── rotate.js            # Data rotation script
│   ├── export.js            # Export script (JSON/CSV)
│   └── reset.js             # Reset script
├── skills/
│   └── pulse/
│       └── SKILL.md         # /skillpulse:pulse skill
└── README.md
```

## Data Format

`pulse.jsonl` (JSONL format):
```json
{"skill":"careful","ts":1711234567,"trigger":"explicit"}
{"skill":"freeze","ts":1711234568,"trigger":"auto"}
```

- `skill` — Skill name (directory name)
- `ts` — Unix timestamp (seconds)
- `trigger` — `explicit` (via `/skill`) or `auto` (Claude invoked)

## Development

### Prerequisites

- Node.js v18+ installed

### Test Locally

```bash
claude --plugin-dir ./skillpulse
```

Trigger skills, then run `/skillpulse:pulse` to verify tracking.

### Run Tests

```bash
node --test scripts/*.test.js
```

### Syntax Check

```bash
node --check scripts/track.js
```

## License

MIT
