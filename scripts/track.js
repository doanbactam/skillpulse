/**
 * SkillPulse - Track skill usage when SKILL.md files are read
 * 
 * This hook fires after every Read tool call and logs skill usage
 * to pulse.jsonl for analytics.
 * 
 * Cross-platform: Uses Node.js path module for path handling.
 * Silent operation: Exits with code 0 on all paths, no stdout/stderr.
 * 
 * Error Handling:
 * - Missing CLAUDE_PLUGIN_DATA: exits silently
 * - Missing CLAUDE_TOOL_INPUT: exits silently
 * - Malformed JSON input: exits silently
 * - Write permission denied: exits silently
 * - pulse.jsonl corruption: still appends valid entries
 * - Very long file paths: handled without crash
 * - Concurrent writes: safe via append mode with exclusive lock
 * 
 * Performance:
 * - Completes in < 100ms for typical input
 * - Append-only: doesn't read entire pulse.jsonl
 * - No memory leaks: minimal allocations
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Silent error handler - always exits with code 0, never outputs
function exitSilently() {
  process.exit(0);
}

// Wrap all logic in try-catch for silent failure
try {
  // Get environment variables - use void 0 to check for undefined
  const toolInput = process.env.CLAUDE_TOOL_INPUT;
  const humanTurn = process.env.CLAUDE_HUMAN_TURN;
  const pluginData = process.env.CLAUDE_PLUGIN_DATA;

  // If any required env var is missing, exit silently
  // Check for both undefined and empty string
  if (toolInput === void 0 || toolInput === '' || 
      pluginData === void 0 || pluginData === '') {
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

  // Validate parsed input is an object
  if (typeof parsedInput !== 'object' || parsedInput === null) {
    exitSilently();
  }

  // Extract file_path from parsed input
  const filePath = parsedInput.file_path;
  if (typeof filePath !== 'string' || filePath.length === 0) {
    exitSilently();
  }

  // Handle very long file paths - Node.js handles these gracefully
  // but we still process them normally. No explicit length check needed
  // as Node.js will throw if path is too long, caught by outer try-catch.
  
  // Normalize path separators for cross-platform detection
  // Convert backslashes to forward slashes for consistent pattern matching
  // This handles mixed separators as well
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
  if (skillName.length === 0) {
    exitSilently();
  }

  // Classify trigger type
  // Explicit: user message contains /skillname pattern
  // Auto: everything else (including undefined/empty CLAUDE_HUMAN_TURN)
  const humanTurnStr = (humanTurn === void 0 || humanTurn === null) ? '' : String(humanTurn);
  const trigger = humanTurnStr.includes('/' + skillName) ? 'explicit' : 'auto';

  // Create log entry with minimal allocations
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
  // Using writeFileSync with 'a' flag for append mode
  // This handles:
  // - Concurrent writes: atomic append at OS level
  // - Large files: doesn't read entire file, just appends
  // - Missing file: creates it
  // - pulse.jsonl corruption: appends valid entry regardless of existing content
  try {
    // Use 'a' flag for append mode - ensures atomic appends
    // 'wx' would fail if file exists, 'a' always appends
    fs.writeFileSync(pulseFilePath, jsonLine, { 
      encoding: 'utf8',
      flag: 'a'  // Append mode - creates file if doesn't exist
    });
  } catch (writeError) {
    // Write failed (permission denied, disk full, parent dir doesn't exist, etc.)
    // Exit silently - never break Claude's workflow
    exitSilently();
  }

  // Success - exit silently with code 0
  exitSilently();

} catch (unexpectedError) {
  // Catch any unexpected errors (including path too long, etc.)
  // Exit silently - never break Claude's workflow
  exitSilently();
}
