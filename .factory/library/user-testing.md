# User Testing

Testing surface and validation approach for SkillPulse plugin.

## What belongs here
Testing surface, validation tools, resource costs.

---

## Validation Surface

### Surface: CLI Plugin (Lightweight)

This is a Claude Code plugin with no browser UI. Validation happens via:
1. **File inspection** - Check pulse.jsonl contents
2. **CLI invocation** - Run `claude --plugin-dir .`
3. **Manual skill triggering** - Use skills and verify tracking

### Required Tools
- Node.js (already available)
- Claude Code CLI
- Text editor for file inspection

### No Browser Testing Required
This plugin has no web interface. All testing is file-based.

---

## Validation Concurrency

| Metric | Value |
|--------|-------|
| Max concurrent validators | 5 |
| Memory per validator | ~50-100 MB |
| Resource type | Node.js process |

**Rationale**: Plugin is lightweight. No server, no browser. Each validation runs a simple Node.js script that reads/writes a small JSONL file.

---

## Manual Validation Flows

### FLOW-001: Basic Tracking
1. Start Claude Code with plugin: `claude --plugin-dir .`
2. Trigger a skill read (e.g., mention something that loads a skill)
3. Check `${CLAUDE_PLUGIN_DATA}/pulse.jsonl`
4. Verify entry exists with correct fields

### FLOW-002: Cross-Platform Path Test
1. Test with Windows-style path: `C:\skills\test\SKILL.md`
2. Test with Unix-style path: `/skills/test/SKILL.md`
3. Verify both produce correct skill name

### FLOW-003: Error Handling
1. Unset `CLAUDE_PLUGIN_DATA`
2. Trigger skill read
3. Verify no error shown, Claude continues normally

### FLOW-004: Export/Reset
1. Run export command
2. Verify JSON/CSV output
3. Run reset command
4. Verify data cleared

---

## Test Coverage Requirements

| Area | Min Tests |
|------|-----------|
| SKILL.md detection | 3 (forward slash, backslash, mixed) |
| Skill name extraction | 3 (simple, nested, special chars) |
| Trigger classification | 3 (explicit, auto, edge case) |
| Error handling | 4 (missing env, invalid JSON, write fail, corruption) |
| JSONL format | 2 (valid output, all fields) |

**Total**: Minimum 15 unit tests required
