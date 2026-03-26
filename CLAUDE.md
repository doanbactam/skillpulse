# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SkillPulse is a Claude Code plugin that tracks skill usage analytics. It consists of:
- **MCP Server** (`src/index.js`) — Exposes tools for logging and querying skill usage
- **Pulse Skill** (`skills/pulse/`) — CLI interface for viewing usage statistics
- **Analytics Storage** — `~/.claude/skills/pulse.jsonl` (JSONL format: `{"skill":"name","ts":1234567890,"outcome":"success"}`)

## Development Commands

```bash
# Run the MCP server (for testing)
npm start

# Run with file watching during development
npm run dev
```

## Architecture

### MCP Server (`src/index.js`)
The server runs on stdio and exposes three tools:

| Tool | Purpose |
|------|---------|
| `log_pulse` | Log skill usage to analytics file |
| `get_skill_stats` | Query usage stats by period (24h/7d/30d/all) |
| `list_skills` | Enumerate installed skills from `~/.claude/skills/` |

### Pulse Skill (`skills/pulse/`)
- `SKILL.md` — Skill metadata and documentation
- `skill.json` — Package metadata
- `bin/pulse.sh` — Bash script that reads `pulse.jsonl` and renders ASCII stats

### Plugin Manifest (`plugin.json`)
Defines the MCP server and skill components for Claude Code to load.

## Analytics File Format

Stored at `~/.claude/skills/pulse.jsonl`:

```json
{"skill":"careful","ts":1711234567,"outcome":"success","pid":12345}
{"skill":"freeze","ts":1711234568,"outcome":"success","pid":12345}
```

## Key Directories

| Path | Purpose |
|------|---------|
| `src/` | MCP server implementation |
| `skills/pulse/` | User-facing CLI skill |
| `~/.claude/skills/` | Where Claude Code installs skills |

## Skill Integration Pattern

Other skills can self-track by appending to `pulse.jsonl`:

```bash
echo "{\"skill\":\"$(basename $0)\",\"ts\":$(date +%s)}" >> ~/.claude/skills/pulse.jsonl
```
