---
name: pulse
version: 1.0.0
description: |
  See your Claude Code skills come alive. Track usage, discover patterns,
  identify unused skills, and keep your setup lean.

  Use when: "skill usage", "which skills do i use", "skill stats", "pulse"
allowed-tools:
  - Bash
  - Read
---

## SkillPulse Analytics

Track your skill usage with beautiful, actionable insights.

### Quick Commands

```bash
# Default: 7 days pulse
~/.claude/plugins/skillpulse/skills/pulse/bin/pulse.sh

# Time periods
~/.claude/plugins/skillpulse/skills/pulse/bin/pulse.sh 24h    # Today
~/.claude/plugins/skillpulse/skills/pulse/bin/pulse.sh 7d     # Week
~/.claude/plugins/skillpulse/skills/pulse/bin/pulse.sh 30d    # Month
~/.claude/plugins/skillpulse/skills/pulse/bin/pulse.sh all    # All time
```

### Output Format

```
╭─────────────────────────────────────────────────────╮
│  SkillPulse • Last 7 days                            │
├─────────────────────────────────────────────────────┤
│  📊 39 skills • 11 used • 28 unused                 │
│                                                       │
│  🔥 Hot                                               │
│  /careful    98 calls  ████████████████████          │
│  /freeze     18 calls  ███                          │
│  /ship       13 calls  ██                           │
│                                                       │
│  ❄️  Cold (28 unused)                                │
│  /baseline-ui, /benchmark, /browse...                │
╰─────────────────────────────────────────────────────╯

💡 Remove unused: rm -rf ~/.claude/skills/SKILL_NAME
```

### For Skill Authors

Add pulse tracking to your skill — add this after your frontmatter:

```markdown
## Pulse

```bash
# Log skill invocation (silent)
echo "{\"skill\":\"YOUR_SKILL_NAME\",\"ts\":$(date +%s)}" >> ~/.claude/skills/pulse.jsonl 2>/dev/null || true
```
```

### Analytics File

Data stored at: `~/.claude/skills/pulse.jsonl`

Format: `{"skill":"name","ts":1234567890}`
