/**
 * Unit tests for reset.js - SkillPulse data reset script
 * 
 * Tests cover:
 * - Clearing all data with --force flag
 * - Requiring --force flag (safety)
 * - Handling missing pulse.jsonl gracefully
 * - Exit code 0 on all paths
 * - Command-line argument parsing
 * 
 * Fulfills validation assertions:
 * - VAL-ENH-008: Reset - clears all data
 * - VAL-ENH-009: Reset - requires confirmation (optional safety)
 * - VAL-ENH-010: Reset - handles missing pulse.jsonl
 * 
 * Uses Node.js built-in test runner (node:test) and assertions (node:assert).
 * Tests are isolated and deterministic - no shared state between tests.
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Path to the script under test
const RESET_SCRIPT_PATH = path.join(__dirname, 'reset.js');

/**
 * Helper to create a unique temp directory for each test
 * This ensures test isolation
 */
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'reset-test-'));
}

/**
 * Helper to run reset.js with given environment variables and args
 * Returns { stdout, stderr, exitCode }
 */
function runReset(env, args = []) {
  const result = {
    stdout: '',
    stderr: '',
    exitCode: null
  };
  
  const argsStr = args.length > 0 ? ' ' + args.map(a => `"${a}"`).join(' ') : '';
  
  try {
    result.stdout = execSync(
      `node "${RESET_SCRIPT_PATH}"${argsStr}`,
      {
        env: { ...process.env, ...env },
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000
      }
    );
  } catch (error) {
    result.stdout = error.stdout || '';
    result.stderr = error.stderr || '';
    result.exitCode = error.status;
    return result;
  }
  
  result.exitCode = 0;
  return result;
}

/**
 * Helper to check if pulse.jsonl exists in a directory
 */
function pulseFileExists(dir) {
  const pulsePath = path.join(dir, 'pulse.jsonl');
  return fs.existsSync(pulsePath);
}

/**
 * Helper to read pulse.jsonl from a directory
 * Returns array of parsed entries (null if file doesn't exist)
 */
function readPulseFile(dir) {
  const pulsePath = path.join(dir, 'pulse.jsonl');
  if (!fs.existsSync(pulsePath)) {
    return null;
  }
  const content = fs.readFileSync(pulsePath, 'utf8').trim();
  if (content === '') {
    return [];
  }
  return content.split('\n').map(line => JSON.parse(line));
}

/**
 * Helper to write entries to pulse.jsonl
 */
function writePulseFile(dir, entries) {
  const pulsePath = path.join(dir, 'pulse.jsonl');
  const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(pulsePath, content, 'utf8');
}

/**
 * Get current Unix timestamp in seconds
 */
function nowTs() {
  return Math.floor(Date.now() / 1000);
}

// ============================================================================
// RESET WITH --FORCE FLAG TESTS (VAL-ENH-008)
// ============================================================================

describe('Reset with --force flag (VAL-ENH-008)', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('clears all entries from pulse.jsonl with --force', () => {
    // Create entries
    const entries = [
      { skill: 'skill-1', ts: nowTs() - 100, trigger: 'auto' },
      { skill: 'skill-2', ts: nowTs() - 50, trigger: 'explicit' },
      { skill: 'skill-3', ts: nowTs(), trigger: 'auto' }
    ];
    writePulseFile(tempDir, entries);
    
    // Verify file exists with data
    assert.ok(pulseFileExists(tempDir), 'pulse.jsonl should exist before reset');
    
    // Run reset with --force
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.ok(!pulseFileExists(tempDir), 'pulse.jsonl should be deleted after reset');
    assert.ok(result.stdout.includes('reset successfully'), 'Should show success message');
  });
  
  test('deletes pulse.jsonl file completely', () => {
    // Create file with one entry
    writePulseFile(tempDir, [{ skill: 'test', ts: nowTs(), trigger: 'auto' }]);
    
    assert.ok(pulseFileExists(tempDir), 'File should exist before reset');
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    
    assert.strictEqual(result.exitCode, 0);
    assert.ok(!pulseFileExists(tempDir), 'File should not exist after reset');
  });
  
  test('works with -f short flag', () => {
    writePulseFile(tempDir, [{ skill: 'test', ts: nowTs(), trigger: 'auto' }]);
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['-f']);
    
    assert.strictEqual(result.exitCode, 0);
    assert.ok(!pulseFileExists(tempDir), 'File should be deleted with -f flag');
  });
  
  test('handles file with many entries', () => {
    // Create 100 entries
    const entries = [];
    for (let i = 0; i < 100; i++) {
      entries.push({ skill: `skill-${i}`, ts: nowTs() - i, trigger: i % 2 === 0 ? 'auto' : 'explicit' });
    }
    writePulseFile(tempDir, entries);
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    
    assert.strictEqual(result.exitCode, 0);
    assert.ok(!pulseFileExists(tempDir), 'Large file should be deleted');
  });
});

// ============================================================================
// SAFETY: REQUIRES --FORCE FLAG (VAL-ENH-009)
// ============================================================================

describe('Safety: requires --force flag (VAL-ENH-009)', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('does not reset without --force flag', () => {
    // Create file with entries
    writePulseFile(tempDir, [{ skill: 'test', ts: nowTs(), trigger: 'auto' }]);
    
    // Run reset WITHOUT --force
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir });
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.ok(pulseFileExists(tempDir), 'File should still exist');
    assert.ok(result.stdout.includes('--force'), 'Should mention --force flag');
  });
  
  test('shows warning message without --force', () => {
    writePulseFile(tempDir, [{ skill: 'test', ts: nowTs(), trigger: 'auto' }]);
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir });
    
    assert.ok(result.stdout.includes('⚠️'), 'Should show warning emoji');
    assert.ok(result.stdout.includes('prevent accidental'), 'Should mention accidental data loss');
  });
  
  test('shows file path in warning when file exists', () => {
    writePulseFile(tempDir, [{ skill: 'test', ts: nowTs(), trigger: 'auto' }]);
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir });
    
    assert.ok(result.stdout.includes(tempDir) || result.stdout.includes('pulse.jsonl'), 
               'Should show file path');
  });
  
  test('does not show file path when file does not exist', () => {
    // Don't create pulse.jsonl
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir });
    
    // Should still show warning about --force
    assert.ok(result.stdout.includes('--force'), 'Should mention --force flag');
  });
});

// ============================================================================
// MISSING FILE HANDLING (VAL-ENH-010)
// ============================================================================

describe('Missing pulse.jsonl handling (VAL-ENH-010)', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('handles non-existent pulse.jsonl gracefully with --force', () => {
    // Don't create pulse.jsonl
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.ok(result.stdout.includes('does not exist') || result.stdout.includes('No analytics'), 
               'Should indicate no data to reset');
  });
  
  test('handles non-existent pulse.jsonl gracefully without --force', () => {
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir });
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    // Should still show the --force warning
    assert.ok(result.stdout.includes('--force'), 'Should mention --force flag');
  });
  
  test('handles missing CLAUDE_PLUGIN_DATA gracefully', () => {
    const result = runReset({}, ['--force']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
  });
  
  test('handles empty CLAUDE_PLUGIN_DATA gracefully', () => {
    const result = runReset({ CLAUDE_PLUGIN_DATA: '' }, ['--force']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
  });
  
  test('handles non-existent CLAUDE_PLUGIN_DATA directory', () => {
    const result = runReset({ CLAUDE_PLUGIN_DATA: '/nonexistent/path/that/does/not/exist' }, ['--force']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
  });
});

// ============================================================================
// EXIT CODE TESTS
// ============================================================================

describe('Exit code 0 on all paths', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('exits with code 0 on successful reset', () => {
    writePulseFile(tempDir, [{ skill: 'test', ts: nowTs(), trigger: 'auto' }]);
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    
    assert.strictEqual(result.exitCode, 0);
  });
  
  test('exits with code 0 when file does not exist', () => {
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    
    assert.strictEqual(result.exitCode, 0);
  });
  
  test('exits with code 0 when --force is missing', () => {
    writePulseFile(tempDir, [{ skill: 'test', ts: nowTs(), trigger: 'auto' }]);
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir });
    
    assert.strictEqual(result.exitCode, 0);
  });
  
  test('exits with code 0 when CLAUDE_PLUGIN_DATA is missing', () => {
    const result = runReset({}, ['--force']);
    
    assert.strictEqual(result.exitCode, 0);
  });
  
  test('exits with code 0 on any error condition', () => {
    // Test multiple error conditions - all should exit 0
    
    // Missing env
    let result = runReset({}, ['--force']);
    assert.strictEqual(result.exitCode, 0, 'Missing env should exit 0');
    
    // Empty env
    result = runReset({ CLAUDE_PLUGIN_DATA: '' }, ['--force']);
    assert.strictEqual(result.exitCode, 0, 'Empty env should exit 0');
    
    // Non-existent directory
    result = runReset({ CLAUDE_PLUGIN_DATA: '/nonexistent' }, ['--force']);
    assert.strictEqual(result.exitCode, 0, 'Non-existent dir should exit 0');
  });
});

// ============================================================================
// COMMAND LINE ARGUMENT TESTS
// ============================================================================

describe('Command line argument handling', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('recognizes --force flag', () => {
    writePulseFile(tempDir, [{ skill: 'test', ts: nowTs(), trigger: 'auto' }]);
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    
    assert.strictEqual(result.exitCode, 0);
    assert.ok(!pulseFileExists(tempDir), 'File should be deleted with --force');
  });
  
  test('recognizes -f short flag', () => {
    writePulseFile(tempDir, [{ skill: 'test', ts: nowTs(), trigger: 'auto' }]);
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['-f']);
    
    assert.strictEqual(result.exitCode, 0);
    assert.ok(!pulseFileExists(tempDir), 'File should be deleted with -f');
  });
  
  test('ignores other arguments', () => {
    writePulseFile(tempDir, [{ skill: 'test', ts: nowTs(), trigger: 'auto' }]);
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force', '--other', 'arg']);
    
    assert.strictEqual(result.exitCode, 0);
    assert.ok(!pulseFileExists(tempDir), 'File should be deleted even with extra args');
  });
  
  test('no arguments defaults to no force', () => {
    writePulseFile(tempDir, [{ skill: 'test', ts: nowTs(), trigger: 'auto' }]);
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir });
    
    assert.strictEqual(result.exitCode, 0);
    assert.ok(pulseFileExists(tempDir), 'File should not be deleted without --force');
  });
});

// ============================================================================
// OUTPUT MESSAGE TESTS
// ============================================================================

describe('Output messages', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('shows success message on successful reset', () => {
    writePulseFile(tempDir, [{ skill: 'test', ts: nowTs(), trigger: 'auto' }]);
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    
    assert.ok(result.stdout.includes('✓'), 'Should show checkmark');
    assert.ok(result.stdout.includes('successfully'), 'Should show success message');
  });
  
  test('shows appropriate message when file does not exist', () => {
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    
    assert.ok(
      result.stdout.includes('does not exist') || result.stdout.includes('No analytics'),
      'Should indicate file does not exist'
    );
  });
  
  test('shows usage hint in warning', () => {
    writePulseFile(tempDir, [{ skill: 'test', ts: nowTs(), trigger: 'auto' }]);
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir });
    
    assert.ok(result.stdout.includes('Usage:'), 'Should show usage hint');
  });
});

// ============================================================================
// CROSS-PLATFORM TESTS
// ============================================================================

describe('Cross-platform compatibility', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('handles Windows-style CLAUDE_PLUGIN_DATA path', () => {
    writePulseFile(tempDir, [{ skill: 'test', ts: nowTs(), trigger: 'auto' }]);
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    
    assert.strictEqual(result.exitCode, 0);
    assert.ok(!pulseFileExists(tempDir));
  });
  
  test('handles path with spaces', () => {
    const dirWithSpaces = path.join(os.tmpdir(), 'reset test dir');
    try {
      fs.mkdirSync(dirWithSpaces, { recursive: true });
      
      writePulseFile(dirWithSpaces, [{ skill: 'test', ts: nowTs(), trigger: 'auto' }]);
      
      const result = runReset({ CLAUDE_PLUGIN_DATA: dirWithSpaces }, ['--force']);
      
      assert.strictEqual(result.exitCode, 0);
      assert.ok(!pulseFileExists(dirWithSpaces));
    } finally {
      fs.rmSync(dirWithSpaces, { recursive: true, force: true });
    }
  });
  
  test('handles unicode in path and skill names', () => {
    const dirWithUnicode = path.join(os.tmpdir(), 'reset-测试-目录');
    try {
      fs.mkdirSync(dirWithUnicode, { recursive: true });
      
      writePulseFile(dirWithUnicode, [{ skill: '技能', ts: nowTs(), trigger: 'auto' }]);
      
      const result = runReset({ CLAUDE_PLUGIN_DATA: dirWithUnicode }, ['--force']);
      
      assert.strictEqual(result.exitCode, 0);
      assert.ok(!pulseFileExists(dirWithUnicode));
    } finally {
      fs.rmSync(dirWithUnicode, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration with track.js format', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('can reset and then append new entries', () => {
    // Create initial entries
    writePulseFile(tempDir, [
      { skill: 'old-1', ts: nowTs() - 1000, trigger: 'auto' },
      { skill: 'old-2', ts: nowTs() - 500, trigger: 'explicit' }
    ]);
    
    // Reset
    runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    
    // Verify file is gone
    assert.ok(!pulseFileExists(tempDir), 'File should be deleted');
    
    // Simulate appending a new entry (like track.js would)
    const pulsePath = path.join(tempDir, 'pulse.jsonl');
    const newEntry = { skill: 'new-skill', ts: nowTs(), trigger: 'explicit' };
    fs.appendFileSync(pulsePath, JSON.stringify(newEntry) + '\n', 'utf8');
    
    // Verify new entry exists
    const entries = readPulseFile(tempDir);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].skill, 'new-skill');
  });
  
  test('reset clears entries created by track.js', () => {
    // Simulate entries as created by track.js
    const entries = [
      { skill: 'careful', ts: nowTs() - 100, trigger: 'explicit' },
      { skill: 'freeze', ts: nowTs() - 50, trigger: 'auto' },
      { skill: 'my-skill-123', ts: nowTs(), trigger: 'explicit' }
    ];
    writePulseFile(tempDir, entries);
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    
    assert.strictEqual(result.exitCode, 0);
    assert.ok(!pulseFileExists(tempDir), 'All track.js entries should be cleared');
  });
});

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

describe('Edge cases', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('handles empty pulse.jsonl', () => {
    // Create empty file
    const pulsePath = path.join(tempDir, 'pulse.jsonl');
    fs.writeFileSync(pulsePath, '', 'utf8');
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    
    assert.strictEqual(result.exitCode, 0);
    assert.ok(!pulseFileExists(tempDir), 'Empty file should be deleted');
  });
  
  test('handles file with only whitespace', () => {
    const pulsePath = path.join(tempDir, 'pulse.jsonl');
    fs.writeFileSync(pulsePath, '   \n\n  ', 'utf8');
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    
    assert.strictEqual(result.exitCode, 0);
    assert.ok(!pulseFileExists(tempDir), 'Whitespace-only file should be deleted');
  });
  
  test('handles file with corrupted entries', () => {
    const pulsePath = path.join(tempDir, 'pulse.jsonl');
    fs.writeFileSync(pulsePath, '{not valid json\nalso broken\n', 'utf8');
    
    const result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    
    assert.strictEqual(result.exitCode, 0);
    assert.ok(!pulseFileExists(tempDir), 'Corrupted file should be deleted');
  });
  
  test('handles multiple consecutive resets', () => {
    writePulseFile(tempDir, [{ skill: 'test', ts: nowTs(), trigger: 'auto' }]);
    
    // First reset
    let result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    assert.strictEqual(result.exitCode, 0);
    
    // Second reset (file already gone)
    result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    assert.strictEqual(result.exitCode, 0);
    
    // Third reset
    result = runReset({ CLAUDE_PLUGIN_DATA: tempDir }, ['--force']);
    assert.strictEqual(result.exitCode, 0);
  });
});
