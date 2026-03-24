/**
 * SkillPulse - Data rotation script
 * 
 * Removes entries from pulse.jsonl that are older than a specified retention period.
 * Default retention is 30 days.
 * 
 * Usage: node rotate.js [retention-days]
 * 
 * - retention-days: Number of days to keep entries (default: 30)
 * 
 * Behavior:
 * - Removes entries with ts older than retention period
 * - Preserves entries within retention period
 * - Handles empty or non-existent pulse.jsonl gracefully
 * - Skips corrupted lines, preserves valid ones
 * - Exits with code 0 on all paths (silent operation)
 * 
 * Cross-platform: Uses Node.js path module for path handling.
 * Silent operation: Exits with code 0 on all paths, no stdout/stderr.
 * 
 * Fulfills:
 * - VAL-ENH-001: Data rotation - removes entries older than retention period
 * - VAL-ENH-002: Data rotation - preserves recent entries
 * - VAL-ENH-003: Data rotation - handles empty pulse.jsonl
 * - VAL-ENH-004: Data rotation - handles corrupted entries
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Default retention period in days
const DEFAULT_RETENTION_DAYS = 30;

// Silent error handler - always exits with code 0, never outputs
function exitSilently() {
  process.exit(0);
}

/**
 * Parse command line arguments to get retention days
 * @param {string[]} args - Command line arguments
 * @returns {number|null} - Retention days or null if invalid
 */
function parseRetentionArg(args) {
  if (!args || args.length === 0) {
    return DEFAULT_RETENTION_DAYS;
  }
  
  const arg = args[0];
  const parsed = parseInt(arg, 10);
  
  // Check if it's a valid positive number
  if (isNaN(parsed) || parsed < 0) {
    return null;
  }
  
  return parsed;
}

/**
 * Check if an entry is within the retention period
 * @param {object} entry - Parsed JSON entry with ts field
 * @param {number} cutoffTs - Unix timestamp cutoff (entries older than this are removed)
 * @returns {boolean} - True if entry should be kept
 */
function isEntryValid(entry, cutoffTs) {
  // Entry must be an object with a numeric ts field
  if (typeof entry !== 'object' || entry === null) {
    return false;
  }
  
  const ts = entry.ts;
  
  // ts must be a number
  if (typeof ts !== 'number' || isNaN(ts)) {
    return false;
  }
  
  // Entry is valid if ts >= cutoff
  return ts >= cutoffTs;
}

/**
 * Parse a single line of pulse.jsonl
 * @param {string} line - A single line from the file
 * @returns {object|null} - Parsed entry or null if invalid
 */
function parseLine(line) {
  // Skip empty lines
  if (!line || line.trim() === '') {
    return null;
  }
  
  try {
    return JSON.parse(line);
  } catch (e) {
    // Invalid JSON - skip this line
    return null;
  }
}

// Wrap all logic in try-catch for silent failure
try {
  // Get environment variables
  const pluginData = process.env.CLAUDE_PLUGIN_DATA;
  
  // If CLAUDE_PLUGIN_DATA is missing or empty, exit silently
  if (pluginData === void 0 || pluginData === '') {
    exitSilently();
  }
  
  // Parse retention days from command line arguments
  const retentionDays = parseRetentionArg(process.argv.slice(2));
  
  // If invalid retention argument, exit silently
  if (retentionDays === null) {
    exitSilently();
  }
  
  // Calculate cutoff timestamp (now - retention days in seconds)
  const nowTs = Math.floor(Date.now() / 1000);
  const cutoffTs = nowTs - (retentionDays * 24 * 60 * 60);
  
  // Construct path to pulse.jsonl
  const pulseFilePath = path.join(pluginData, 'pulse.jsonl');
  
  // Check if file exists
  if (!fs.existsSync(pulseFilePath)) {
    // File doesn't exist - nothing to rotate
    exitSilently();
  }
  
  // Read the file
  let content;
  try {
    content = fs.readFileSync(pulseFilePath, 'utf8');
  } catch (readError) {
    // Can't read file - exit silently
    exitSilently();
  }
  
  // Handle empty file
  if (!content || content.trim() === '') {
    // File is empty - nothing to rotate
    exitSilently();
  }
  
  // Split into lines and process each
  const lines = content.split('\n');
  const validEntries = [];
  
  for (const line of lines) {
    const entry = parseLine(line);
    
    // Skip invalid/corrupted lines
    if (entry === null) {
      continue;
    }
    
    // Check if entry is within retention period
    if (isEntryValid(entry, cutoffTs)) {
      validEntries.push(entry);
    }
  }
  
  // If no valid entries remain, either delete the file or leave it empty
  if (validEntries.length === 0) {
    try {
      // Write empty file (or could delete it)
      fs.writeFileSync(pulseFilePath, '', 'utf8');
    } catch (writeError) {
      // Can't write - exit silently
    }
    exitSilently();
  }
  
  // Write the filtered entries back to the file
  const newContent = validEntries.map(e => JSON.stringify(e)).join('\n') + '\n';
  
  try {
    fs.writeFileSync(pulseFilePath, newContent, 'utf8');
  } catch (writeError) {
    // Can't write - exit silently
    exitSilently();
  }
  
  // Success - exit silently
  exitSilently();

} catch (unexpectedError) {
  // Catch any unexpected errors
  // Exit silently - never break Claude's workflow
  exitSilently();
}
