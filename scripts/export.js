/**
 * SkillPulse - Export data from pulse.jsonl
 * 
 * Exports analytics data in JSON or CSV format.
 * 
 * Usage: node export.js [format]
 * 
 * - format: "json" or "csv" (default: json)
 * 
 * JSON export produces an array of entries.
 * CSV export produces output with headers: skill,ts,trigger
 * 
 * Behavior:
 * - Reads all entries from pulse.jsonl
 * - JSON: outputs valid JSON array (empty array [] if no data)
 * - CSV: outputs headers + data rows (headers only if no data)
 * - Skips corrupted entries, preserves valid ones
 * - Exits with code 0 on all paths
 * 
 * Cross-platform: Uses Node.js path module for path handling.
 * Silent operation: No stderr output, outputs to stdout.
 * 
 * Fulfills:
 * - VAL-ENH-005: Export - produces valid JSON output
 * - VAL-ENH-006: Export - produces valid CSV output
 * - VAL-ENH-007: Export - handles empty data
 */

'use strict';

const fs = require('fs');
const path = require('path');

// CSV headers
const CSV_HEADERS = 'skill,ts,trigger';

/**
 * Parse command line arguments to get export format
 * @param {string[]} args - Command line arguments
 * @returns {string} - "json" or "csv"
 */
function parseFormatArg(args) {
  if (!args || args.length === 0) {
    return 'json';
  }
  
  const arg = args[0].toLowerCase();
  
  if (arg === 'csv') {
    return 'csv';
  }
  
  // Default to json for any other value
  return 'json';
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
    const entry = JSON.parse(line);
    
    // Validate entry has required fields
    if (typeof entry !== 'object' || entry === null) {
      return null;
    }
    
    // Must have skill, ts, and trigger fields
    if (typeof entry.skill !== 'string' ||
        typeof entry.ts !== 'number' ||
        typeof entry.trigger !== 'string') {
      return null;
    }
    
    return entry;
  } catch (e) {
    // Invalid JSON - skip this line
    return null;
  }
}

/**
 * Export entries as JSON array
 * @param {object[]} entries - Valid entries to export
 * @returns {string} - JSON string
 */
function exportAsJson(entries) {
  return JSON.stringify(entries, null, 2);
}

/**
 * Export entries as CSV
 * @param {object[]} entries - Valid entries to export
 * @returns {string} - CSV string with headers
 */
function exportAsCsv(entries) {
  // Always include headers
  const lines = [CSV_HEADERS];
  
  // Add data rows
  for (const entry of entries) {
    // Simple CSV format - no quoting needed for our data
    // (skill names don't contain commas, ts is numeric, trigger is 'auto' or 'explicit')
    lines.push(`${entry.skill},${entry.ts},${entry.trigger}`);
  }
  
  return lines.join('\n');
}

/**
 * Read and parse all entries from pulse.jsonl
 * @param {string} pulseFilePath - Path to pulse.jsonl
 * @returns {object[]} - Array of valid entries
 */
function readEntries(pulseFilePath) {
  // Check if file exists
  if (!fs.existsSync(pulseFilePath)) {
    return [];
  }
  
  // Read the file
  let content;
  try {
    content = fs.readFileSync(pulseFilePath, 'utf8');
  } catch (readError) {
    // Can't read file - return empty
    return [];
  }
  
  // Handle empty file
  if (!content || content.trim() === '') {
    return [];
  }
  
  // Split into lines and process each
  const lines = content.split('\n');
  const entries = [];
  
  for (const line of lines) {
    const entry = parseLine(line);
    
    // Skip invalid/corrupted lines
    if (entry !== null) {
      entries.push(entry);
    }
  }
  
  return entries;
}

// Main execution
try {
  // Get environment variables
  const pluginData = process.env.CLAUDE_PLUGIN_DATA;
  
  // If CLAUDE_PLUGIN_DATA is missing or empty, output empty result
  if (pluginData === void 0 || pluginData === '') {
    // Parse format and output empty result
    const format = parseFormatArg(process.argv.slice(2));
    if (format === 'csv') {
      console.log(CSV_HEADERS);
    } else {
      console.log('[]');
    }
    process.exit(0);
  }
  
  // Parse format argument
  const format = parseFormatArg(process.argv.slice(2));
  
  // Construct path to pulse.jsonl
  const pulseFilePath = path.join(pluginData, 'pulse.jsonl');
  
  // Read all entries
  const entries = readEntries(pulseFilePath);
  
  // Export based on format
  let output;
  if (format === 'csv') {
    output = exportAsCsv(entries);
  } else {
    output = exportAsJson(entries);
  }
  
  // Output to stdout
  console.log(output);
  
  // Success
  process.exit(0);

} catch (unexpectedError) {
  // Catch any unexpected errors
  // Still output valid empty result
  const format = parseFormatArg(process.argv.slice(2));
  if (format === 'csv') {
    console.log(CSV_HEADERS);
  } else {
    console.log('[]');
  }
  process.exit(0);
}
