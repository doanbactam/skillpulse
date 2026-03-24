# SkillPulse

> See your Claude Code skills come alive. Track usage, discover patterns, stay lean.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Claude Code](https://img.shields.io/badge/Claude-Code-compatible-blue)](https://claude.com/plugins)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **📊 Usage Tracking** | See which skills you use most — hourly, daily, weekly, monthly |
| **🔍 Skill Discovery** | Browse all installed skills with descriptions |
| **🧹 Cleanup Helper** | Identify unused skills cluttering your setup |
| **🌐 Universal** | Works with ALL skills — gstack, custom, official |

---

## 🚀 Quick Start

### Install from Marketplace (Coming Soon)

```
Search "SkillPulse" at https://claude.com/plugins
```

### Manual Install

```bash
git clone https://github.com/doanbactam/skillpulse.git ~/.claude/plugins/skillpulse
cd ~/.claude/plugins/skillpulse
npm install
```

---

## 💡 Usage

```bash
# See your skill pulse (default: 7 days)
/pulse

# Time periods
/pulse 24h    # Today
/pulse 7d     # Week
/pulse 30d    # Month
/pulse all    # All time
```

---

## 📸 Preview

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
```

---

## 🔧 How It Works

1. **MCP Server** — Runs silently, logging skill activity
2. **Analytics File** — Stored at `~/.claude/skills/pulse.jsonl`
3. **CLI Tool** — Reads analytics, presents insights

---

## 📚 For Skill Authors

Add pulse tracking to your skill:

```markdown
## Analytics

```bash
echo "{\"skill\":\"$(basename $0)\",\"ts\":$(date +%s)}" >> ~/.claude/skills/pulse.jsonl
```
```

---

## 📋 Requirements

- Node.js 18+
- Claude Code (latest)
- macOS / Linux / WSL

---

## 📜 License

MIT © [doanbactam]

---

## 🙏 Acknowledgments

Built for the [Claude Code](https://claude.com) plugin ecosystem.

Inspired by the need to see which skills actually spark joy.
