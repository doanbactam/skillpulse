---
name: export
description: Export pulse.jsonl analytics data in JSON or CSV format. Usage: /skillpulse:export [json|csv]
disable-model-invocation: true
allowed-tools: Read, Bash
---

# SkillPulse Export

Export analytics data from `${CLAUDE_PLUGIN_DATA}/pulse.jsonl` in JSON or CSV format.

## Usage

```
/skillpulse:export        # Default: JSON format
/skillpulse:export json   # JSON array of entries
/skillpulse:export csv    # CSV with headers: skill,ts,trigger
```

## Implementation

Run the export script:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/export.js" [json|csv]
```

The script:
1. Reads all entries from `${CLAUDE_PLUGIN_DATA}/pulse.jsonl`
2. Parses each JSON line (skips corrupted entries)
3. Outputs in the requested format

## Output Formats

### JSON (default)
```json
[
  {"skill":"careful","ts":1711234567,"trigger":"auto"},
  {"skill":"freeze","ts":1711234568,"trigger":"explicit"}
]
```

### CSV
```
skill,ts,trigger
careful,1711234567,auto
freeze,1711234568,explicit
```

## Edge Cases

- **Empty data**: JSON returns `[]`, CSV returns headers only
- **Missing pulse.jsonl**: Same as empty data
- **Corrupted entries**: Skipped silently, valid entries preserved

## Use Cases

- Export to file: `/skillpulse:export json > analytics.json`
- CSV for spreadsheets: `/skillpulse:export csv > analytics.csv`
- Data backup before reset
