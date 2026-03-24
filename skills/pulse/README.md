# Skill Stats

> Analyze which Claude Code skills you actually use, which are effective, and which should be removed.

## Features

- **Usage tracking** — See which skills you use most (24h, 7d, 30d, or all-time)
- **Effectiveness analysis** — Success/failure rates per skill
- **Cleanup recommendations** — Identifies unused skills to remove
- **One-command analysis** — Just run `/skill-stats`

## Usage

```bash
# Default: 7 days
/skill-stats

# Specific period
/skill-stats 24h    # Today
/skill-stats 7d     # Week (default)
/skill-stats 30d    # Month
/skill-stats all    # All time
```

## Output Example

```
## Skill Usage Analysis (7 days)

📊 **39 skills installed**

**11 used** | **28 unused**

### 📈 Most Used

| Skill | Calls | Status |
|-------|-------|--------|
| /careful | 98 | ✅ Active |
| /freeze | 18 | ✅ Active |
| /ship | 13 | ✅ Active |

### 🗑️ Unused Skills (28)

These haven't been used in the selected period:
- /baseline-ui, /benchmark, /browse, /codex...
```

## How It Works

Reads analytics from `~/.gstack/analytics/skill-usage.jsonl` which gstack skills automatically track.

## Installation

1. Copy to `~/.claude/skills/skill-stats/`
2. Reload Claude Code
3. Run `/skill-stats`

## License

MIT
