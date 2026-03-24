/**
 * SkillPulse - Reset analytics data
 * 
 * Clears all analytics data from pulse.jsonl.
 * Requires --force flag to prevent accidental data loss.
 * 
 * Usage: node reset.js --force
 * 
 * Behavior:
 * - Without --force: outputs warning message and exits with code 0
 * - With --force: clears pulse.jsonl (deletes file or empties it)
 * - Handles missing pulse.jsonl gracefully (no error)
 * - Exits with code 0 on all paths
 * 
 * Cross-platform: Uses Node.js path module for path handling.
 * 
 * Fulfills:
 * - VAL-ENH-008: Reset - clears all data
 * - VAL-ENH-009: Reset - requires confirmation (optional safety)
 * - VAL-ENH-010: Reset - handles missing pulse.jsonl
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Parse command line arguments to check for --force flag
 * @param {string[]} args - Command line arguments
 * @returns {boolean} - True if --force flag is present
 */
function hasForceFlag(args) {
  if (!args || args.length === 0) {
    return false;
  }
  
  return args.includes('--force') || args.includes('-f');
}

/**
 * Check if pulse.jsonl exists
 * @param {string} pulseFilePath - Path to pulse.jsonl
 * @returns {boolean} - True if file exists
 */
function fileExists(pulseFilePath) {
  try {
    return fs.existsSync(pulseFilePath);
  } catch (e) {
    return false;
  }
}

/**
 * Delete or empty the pulse.jsonl file
 * @param {string} pulseFilePath - Path to pulse.jsonl
 * @returns {boolean} - True if successful
 */
function resetFile(pulseFilePath) {
  try {
    // Delete the file (simpler than emptying)
    fs.unlinkSync(pulseFilePath);
    return true;
  } catch (e) {
    // If file doesn't exist, that's fine
    if (e.code === 'ENOENT') {
      return true;
    }
    // Other errors (permission denied, etc.) - return false
    return false;
  }
}

// Main execution
try {
  // Get environment variables
  const pluginData = process.env.CLAUDE_PLUGIN_DATA;
  
  // Parse arguments
  const args = process.argv.slice(2);
  const force = hasForceFlag(args);
  
  // If CLAUDE_PLUGIN_DATA is missing or empty
  if (pluginData === void 0 || pluginData === '') {
    if (!force) {
      console.log('⚠️  Reset requires --force flag to prevent accidental data loss.');
      console.log('   Usage: node reset.js --force');
    }
    // Nothing to reset anyway
    process.exit(0);
  }
  
  // Construct path to pulse.jsonl
  const pulseFilePath = path.join(pluginData, 'pulse.jsonl');
  
  // Check if file exists
  const exists = fileExists(pulseFilePath);
  
  if (!force) {
    // Safety: require --force flag
    console.log('⚠️  Reset requires --force flag to prevent accidental data loss.');
    console.log('   Usage: node reset.js --force');
    if (exists) {
      console.log(`   File: ${pulseFilePath}`);
    }
    process.exit(0);
  }
  
  // --force flag provided, proceed with reset
  if (!exists) {
    // File doesn't exist - nothing to reset, but that's fine
    console.log('✓ No analytics data to reset (pulse.jsonl does not exist).');
    process.exit(0);
  }
  
  // Reset the file
  const success = resetFile(pulseFilePath);
  
  if (success) {
    console.log('✓ Analytics data reset successfully.');
  } else {
    // Couldn't delete (permission denied, etc.)
    console.log('⚠️  Could not reset analytics data (permission denied or file in use).');
  }
  
  // Always exit with code 0
  process.exit(0);

} catch (unexpectedError) {
  // Catch any unexpected errors
  // Still exit with code 0
  process.exit(0);
}
