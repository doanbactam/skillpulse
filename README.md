# SkillPulse

> Track which Claude Code skills you actually use

A Claude Code plugin that passively tracks skill usage via hooks. Works with ALL skills — no opt-in required.

## Install

```bash
/plugin install github:doanbactam/skillpulse
```

## Usage

```
/skillpulse:pulse           # Last 7 days (default)
/skillpulse:pulse 24h       # Today
/skillpulse:pulse 30d       # Last month
/skillpulse:pulse all       # All time
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

## Plugin Structure

```
skillpulse/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest
├── hooks/
│   └── hooks.json           # PostToolUse hook config
├── scripts/
│   └── track.sh             # Tracking script
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
- `ts` — Unix timestamp
- `trigger` — `explicit` (via `/skill`) or `auto` (Claude invoked)

## Development

Test locally:
```bash
claude --plugin-dir ./skillpulse
```

Trigger skills, then run `/skillpulse:pulse` to verify tracking.

## License

MIT
