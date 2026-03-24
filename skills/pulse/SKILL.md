---
name: pulse
description: Show which Claude Code skills you use most. Usage: /skillpulse:pulse [24h|7d|30d|all]
disable-model-invocation: true
allowed-tools: Read, Bash
---

# SkillPulse Analytics

Read the analytics log at `${CLAUDE_PLUGIN_DATA}/pulse.jsonl`

Parse each line as JSON with fields: skill, ts (unix timestamp), trigger

Filter by time period from the command argument (default: 7d):
- 24h = last 86400 seconds
- 7d  = last 604800 seconds
- 30d = last 2592000 seconds
- all = no filter

Then scan `${CLAUDE_PLUGINS_DIR}` and `~/.claude/skills/` for all installed skill folders (directories containing SKILL.md). This gives you total installed count.

Output this exact format to terminal:

```
╭──────────────────────────────────────────╮
│  skillpulse • Last 7 days                │
├──────────────────────────────────────────┤
│  {total} skills • {used} used • {unused} unused  │
│                                          │
│  🔥 Hot                                  │
│  /{skill}    {n} calls  {bar}            │
│  ...                                     │
│                                          │
│  ❄️  Cold ({unused} unused)               │
│  /{skill}, /{skill}, ...                 │
╰──────────────────────────────────────────╯
```

Bar = "█" characters, max 20, proportional to top skill count.
Cold = skills installed but zero invocations in the period.

## Implementation Steps

1. Read `${CLAUDE_PLUGIN_DATA}/pulse.jsonl` (create empty if doesn't exist)
2. Calculate cutoff timestamp based on period
3. Parse each JSON line, filter by timestamp
4. Count invocations per skill
5. Scan for installed skills:
   - List directories in `${CLAUDE_PLUGINS_DIR}` containing `skills/` subdirs
   - List directories in `~/.claude/skills/`
   - Extract skill names from folder names containing SKILL.md
6. Render output with ASCII box formatting
7. Show cleanup hint: `💡 Remove unused: rm -rf ~/.claude/skills/SKILL_NAME`
