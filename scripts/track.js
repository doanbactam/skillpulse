/**
 * SkillPulse - Track skill usage when SKILL.md files are read
 * 
 * This hook fires after every Read tool call and logs skill usage
 * to pulse.jsonl for analytics.
 * 
 * Cross-platform: Uses Node.js path module for path handling.
 * Silent operation: Exits with code 0 on all paths, no stdout/stderr.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Silent error handler - always exits with code 0
function exitSilently() {
  process.exit(0);
}

// Wrap all logic in try-catch for silent failure
try {
  // Get environment variables
  const toolInput = process.env.CLAUDE_TOOL_INPUT;
  const humanTurn = process.env.CLAUDE_HUMAN_TURN || '';
  const pluginData = process.env.CLAUDE_PLUGIN_DATA;

  // If any required env var is missing, exit silently
  if (!toolInput || !pluginData) {
    exitSilently();
  }

  // Parse the tool input JSON
  let parsedInput;
  try {
    parsedInput = JSON.parse(toolInput);
  } catch (parseError) {
    // Malformed JSON - exit silently
    exitSilently();
  }

  // Extract file_path from parsed input
  const filePath = parsedInput.file_path;
  if (!filePath || typeof filePath !== 'string') {
    exitSilently();
  }

  // Normalize path separators for cross-platform detection
  // Convert backslashes to forward slashes for consistent pattern matching
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Check if file ends with SKILL.md (case-sensitive)
  if (!normalizedPath.endsWith('/SKILL.md')) {
    // Not a SKILL.md file - exit silently without logging
    exitSilently();
  }

  // Extract skill name: the immediate parent directory of SKILL.md
  // For both "/path/to/skills/my-skill/SKILL.md" and "C:\skills\my-skill\SKILL.md"
  // after normalization we get "/path/to/skills/my-skill/SKILL.md"
  // Remove trailing /SKILL.md, then get the last path segment
  const pathWithoutFile = normalizedPath.slice(0, -'/SKILL.md'.length);
  const lastSlashIndex = pathWithoutFile.lastIndexOf('/');
  
  if (lastSlashIndex === -1) {
    // No parent directory found - edge case, exit silently
    exitSilently();
  }
  
  const skillName = pathWithoutFile.slice(lastSlashIndex + 1);

  // Validate skill name is not empty
  if (!skillName) {
    exitSilently();
  }

  // Classify trigger type
  // Explicit: user message contains /skillname pattern
  // Auto: everything else
  const trigger = humanTurn.includes('/' + skillName) ? 'explicit' : 'auto';

  // Create log entry
  const entry = {
    skill: skillName,
    ts: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
    trigger: trigger
  };

  // Construct path to pulse.jsonl using path module for cross-platform support
  const pulseFilePath = path.join(pluginData, 'pulse.jsonl');

  // Format as JSON line
  const jsonLine = JSON.stringify(entry) + '\n';

  // Append to pulse.jsonl (creates file if it doesn't exist)
  // Using appendFileSync for atomic appends
  try {
    fs.appendFileSync(pulseFilePath, jsonLine, { encoding: 'utf8' });
  } catch (writeError) {
    // Write failed (permission denied, disk full, etc.) - exit silently
    exitSilently();
  }

  // Success - exit silently with code 0
  exitSilently();

} catch (unexpectedError) {
  // Catch any unexpected errors - exit silently
  exitSilently();
}
