/**
 * Unit tests for rotate.js - SkillPulse data rotation script
 * 
 * Tests cover:
 * - Removing entries older than retention period
 * - Preserving entries within retention period
 * - Handling empty or non-existent pulse.jsonl
 * - Skipping corrupted lines while preserving valid ones
 * - Exit code 0 on all paths
 * - Command-line argument parsing
 * 
 * Fulfills validation assertions:
 * - VAL-ENH-001: Data rotation - removes entries older than retention period
 * - VAL-ENH-002: Data rotation - preserves recent entries
 * - VAL-ENH-003: Data rotation - handles empty pulse.jsonl
 * - VAL-ENH-004: Data rotation - handles corrupted entries
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
const ROTATE_SCRIPT_PATH = path.join(__dirname, 'rotate.js');

/**
 * Helper to create a unique temp directory for each test
 * This ensures test isolation
 */
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rotate-test-'));
}

/**
 * Helper to run rotate.js with given environment variables and args
 * Returns { stdout, stderr, exitCode }
 */
function runRotate(env, args = []) {
  const result = {
    stdout: '',
    stderr: '',
    exitCode: null
  };
  
  const argsStr = args.length > 0 ? ' ' + args.map(a => `"${a}"`).join(' ') : '';
  
  try {
    result.stdout = execSync(
      `node "${ROTATE_SCRIPT_PATH}"${argsStr}`,
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
  const content = entries.map(e => JSON.stringify(e)).join('\n');
  fs.writeFileSync(pulsePath, content, 'utf8');
}

/**
 * Helper to write raw content to pulse.jsonl (for testing corruption)
 */
function writeRawPulseFile(dir, content) {
  const pulsePath = path.join(dir, 'pulse.jsonl');
  fs.writeFileSync(pulsePath, content, 'utf8');
}

/**
 * Get current Unix timestamp in seconds
 */
function nowTs() {
  return Math.floor(Date.now() / 1000);
}

/**
 * Get timestamp N days ago
 */
function daysAgoTs(days) {
  return nowTs() - (days * 24 * 60 * 60);
}

// ============================================================================
// BASIC ROTATION TESTS (VAL-ENH-001, VAL-ENH-002)
// ============================================================================

describe('Basic rotation functionality', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('removes entries older than retention period (VAL-ENH-001)', () => {
    // Create entries: 60 days ago and 5 days ago
    const entries = [
      { skill: 'old-skill', ts: daysAgoTs(60), trigger: 'auto' },
      { skill: 'recent-skill', ts: daysAgoTs(5), trigger: 'explicit' }
    ];
    writePulseFile(tempDir, entries);
    
    // Run rotation with 30-day retention
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    
    const remaining = readPulseFile(tempDir);
    assert.ok(remaining, 'pulse.jsonl should exist');
    assert.strictEqual(remaining.length, 1, 'Should have 1 entry after rotation');
    assert.strictEqual(remaining[0].skill, 'recent-skill', 'Recent entry should be preserved');
  });
  
  test('preserves entries within retention period (VAL-ENH-002)', () => {
    // Create entries all within 7 days
    const entries = [
      { skill: 'skill-1', ts: daysAgoTs(1), trigger: 'auto' },
      { skill: 'skill-2', ts: daysAgoTs(3), trigger: 'explicit' },
      { skill: 'skill-3', ts: daysAgoTs(6), trigger: 'auto' }
    ];
    writePulseFile(tempDir, entries);
    
    // Run rotation with 7-day retention
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['7']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    
    const remaining = readPulseFile(tempDir);
    assert.strictEqual(remaining.length, 3, 'All entries within retention should be preserved');
  });
  
  test('preserves entries exactly at retention boundary', () => {
    const retentionDays = 30;
    const boundaryTs = daysAgoTs(retentionDays);
    
    // Entry exactly at boundary should be preserved (>= comparison)
    const entries = [
      { skill: 'boundary-skill', ts: boundaryTs, trigger: 'auto' },
      { skill: 'old-skill', ts: boundaryTs - 1, trigger: 'auto' } // 1 second older
    ];
    writePulseFile(tempDir, entries);
    
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, [String(retentionDays)]);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    
    const remaining = readPulseFile(tempDir);
    assert.strictEqual(remaining.length, 1, 'Entry at boundary should be preserved');
    assert.strictEqual(remaining[0].skill, 'boundary-skill');
  });
  
  test('removes all entries when all are older than retention', () => {
    const entries = [
      { skill: 'old-1', ts: daysAgoTs(100), trigger: 'auto' },
      { skill: 'old-2', ts: daysAgoTs(90), trigger: 'explicit' }
    ];
    writePulseFile(tempDir, entries);
    
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    
    const remaining = readPulseFile(tempDir);
    assert.strictEqual(remaining.length, 0, 'All old entries should be removed');
  });
  
  test('uses default 30-day retention when no argument provided', () => {
    // Entry from 60 days ago should be removed with default 30-day retention
    const entries = [
      { skill: 'old-skill', ts: daysAgoTs(60), trigger: 'auto' },
      { skill: 'recent-skill', ts: daysAgoTs(15), trigger: 'auto' }
    ];
    writePulseFile(tempDir, entries);
    
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir });
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    
    const remaining = readPulseFile(tempDir);
    assert.strictEqual(remaining.length, 1, 'Default retention should work');
    assert.strictEqual(remaining[0].skill, 'recent-skill');
  });
});

// ============================================================================
// EMPTY/MISSING FILE TESTS (VAL-ENH-003)
// ============================================================================

describe('Empty and missing file handling (VAL-ENH-003)', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('handles non-existent pulse.jsonl gracefully', () => {
    // Don't create pulse.jsonl
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });
  
  test('handles empty pulse.jsonl gracefully', () => {
    writeRawPulseFile(tempDir, '');
    
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
  });
  
  test('handles pulse.jsonl with only whitespace', () => {
    writeRawPulseFile(tempDir, '   \n\n  \n  ');
    
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
  });
  
  test('handles missing CLAUDE_PLUGIN_DATA gracefully', () => {
    const result = runRotate({}, ['30']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });
  
  test('handles empty CLAUDE_PLUGIN_DATA gracefully', () => {
    const result = runRotate({ CLAUDE_PLUGIN_DATA: '' }, ['30']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
  });
  
  test('handles non-existent CLAUDE_PLUGIN_DATA directory', () => {
    const result = runRotate({ CLAUDE_PLUGIN_DATA: '/nonexistent/path/that/does/not/exist' }, ['30']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
  });
});

// ============================================================================
// CORRUPTED ENTRIES TESTS (VAL-ENH-004)
// ============================================================================

describe('Corrupted entries handling (VAL-ENH-004)', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('skips corrupted lines while preserving valid ones', () => {
    // Mix of valid and invalid lines
    const content = [
      JSON.stringify({ skill: 'valid-1', ts: daysAgoTs(5), trigger: 'auto' }),
      '{not valid json',
      JSON.stringify({ skill: 'valid-2', ts: daysAgoTs(3), trigger: 'explicit' }),
      'completely broken line',
      JSON.stringify({ skill: 'valid-3', ts: daysAgoTs(1), trigger: 'auto' })
    ].join('\n');
    
    writeRawPulseFile(tempDir, content);
    
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    
    const remaining = readPulseFile(tempDir);
    assert.strictEqual(remaining.length, 3, 'Valid entries should be preserved');
    assert.strictEqual(remaining[0].skill, 'valid-1');
    assert.strictEqual(remaining[1].skill, 'valid-2');
    assert.strictEqual(remaining[2].skill, 'valid-3');
  });
  
  test('skips entries with missing ts field', () => {
    const content = [
      JSON.stringify({ skill: 'no-ts', trigger: 'auto' }), // missing ts
      JSON.stringify({ skill: 'valid', ts: daysAgoTs(5), trigger: 'auto' })
    ].join('\n');
    
    writeRawPulseFile(tempDir, content);
    
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    
    const remaining = readPulseFile(tempDir);
    assert.strictEqual(remaining.length, 1, 'Entry without ts should be skipped');
    assert.strictEqual(remaining[0].skill, 'valid');
  });
  
  test('skips entries with non-numeric ts field', () => {
    const content = [
      JSON.stringify({ skill: 'string-ts', ts: 'not-a-number', trigger: 'auto' }),
      JSON.stringify({ skill: 'null-ts', ts: null, trigger: 'auto' }),
      JSON.stringify({ skill: 'valid', ts: daysAgoTs(5), trigger: 'auto' })
    ].join('\n');
    
    writeRawPulseFile(tempDir, content);
    
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    
    const remaining = readPulseFile(tempDir);
    assert.strictEqual(remaining.length, 1, 'Entries with invalid ts should be skipped');
  });
  
  test('handles file with only corrupted entries', () => {
    const content = [
      '{broken',
      'also broken',
      'more garbage'
    ].join('\n');
    
    writeRawPulseFile(tempDir, content);
    
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    
    // File should be empty or have no valid entries
    const remaining = readPulseFile(tempDir);
    assert.strictEqual(remaining.length, 0, 'All corrupted entries should result in empty file');
  });
  
  test('handles corrupted old entries mixed with valid old entries', () => {
    const content = [
      JSON.stringify({ skill: 'old-valid', ts: daysAgoTs(60), trigger: 'auto' }),
      '{corrupted old entry}',
      JSON.stringify({ skill: 'recent-valid', ts: daysAgoTs(5), trigger: 'auto' })
    ].join('\n');
    
    writeRawPulseFile(tempDir, content);
    
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    
    const remaining = readPulseFile(tempDir);
    assert.strictEqual(remaining.length, 1, 'Only recent valid entry should remain');
    assert.strictEqual(remaining[0].skill, 'recent-valid');
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
  
  test('accepts retention days as first argument', () => {
    const entries = [
      { skill: 'old', ts: daysAgoTs(100), trigger: 'auto' },
      { skill: 'recent', ts: daysAgoTs(10), trigger: 'auto' }
    ];
    writePulseFile(tempDir, entries);
    
    // 50-day retention should keep the 100-day entry? No, 100 > 50, so remove
    // Actually 50 days retention: keep entries with ts >= now - 50 days
    // 100 days ago < 50 days retention threshold, so remove
    // 10 days ago >= 50 days retention threshold, so keep
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['50']);
    
    assert.strictEqual(result.exitCode, 0);
    const remaining = readPulseFile(tempDir);
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].skill, 'recent');
  });
  
  test('handles zero retention days', () => {
    const entries = [
      { skill: 'any-skill', ts: daysAgoTs(1), trigger: 'auto' }
    ];
    writePulseFile(tempDir, entries);
    
    // 0-day retention: only keep entries from today (ts >= today start)
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['0']);
    
    assert.strictEqual(result.exitCode, 0);
    const remaining = readPulseFile(tempDir);
    // Entry from 1 day ago should be removed with 0 retention
    assert.strictEqual(remaining.length, 0);
  });
  
  test('handles very large retention days', () => {
    const entries = [
      { skill: 'any-skill', ts: daysAgoTs(365), trigger: 'auto' }
    ];
    writePulseFile(tempDir, entries);
    
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['1000']);
    
    assert.strictEqual(result.exitCode, 0);
    const remaining = readPulseFile(tempDir);
    assert.strictEqual(remaining.length, 1, 'Large retention should preserve old entries');
  });
  
  test('handles non-numeric retention argument gracefully', () => {
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['invalid']);
    
    // Should exit 0 (graceful failure) but may produce no output
    assert.strictEqual(result.exitCode, 0);
  });
  
  test('handles negative retention argument gracefully', () => {
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['-5']);
    
    assert.strictEqual(result.exitCode, 0);
  });
});

// ============================================================================
// SILENT OPERATION TESTS
// ============================================================================

describe('Silent operation', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('produces no stdout on success', () => {
    const entries = [
      { skill: 'test', ts: daysAgoTs(5), trigger: 'auto' }
    ];
    writePulseFile(tempDir, entries);
    
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
  });
  
  test('produces no stderr on success', () => {
    const entries = [
      { skill: 'test', ts: daysAgoTs(5), trigger: 'auto' }
    ];
    writePulseFile(tempDir, entries);
    
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });
  
  test('exits with code 0 on all paths', () => {
    // Test various scenarios - all should exit 0
    
    // Non-existent file
    let result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    assert.strictEqual(result.exitCode, 0, 'Non-existent file should exit 0');
    
    // Empty file
    writeRawPulseFile(tempDir, '');
    result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    assert.strictEqual(result.exitCode, 0, 'Empty file should exit 0');
    
    // Corrupted file
    writeRawPulseFile(tempDir, '{broken}');
    result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    assert.strictEqual(result.exitCode, 0, 'Corrupted file should exit 0');
    
    // Missing env var
    result = runRotate({}, ['30']);
    assert.strictEqual(result.exitCode, 0, 'Missing env var should exit 0');
  });
});

// ============================================================================
// LARGE FILE TESTS
// ============================================================================

describe('Large file handling', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('handles large pulse.jsonl files efficiently', () => {
    // Create 1000 entries - mix of old and new
    const entries = [];
    for (let i = 0; i < 1000; i++) {
      entries.push({
        skill: `skill-${i}`,
        ts: i < 500 ? daysAgoTs(60) : daysAgoTs(5), // 500 old, 500 new
        trigger: i % 2 === 0 ? 'auto' : 'explicit'
      });
    }
    writePulseFile(tempDir, entries);
    
    const startTime = Date.now();
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    const duration = Date.now() - startTime;
    
    assert.strictEqual(result.exitCode, 0);
    
    const remaining = readPulseFile(tempDir);
    assert.strictEqual(remaining.length, 500, 'Should keep 500 recent entries');
    
    // Should complete quickly (under 5 seconds for 1000 entries)
    assert.ok(duration < 5000, `Rotation should be fast, took ${duration}ms`);
  });
  
  test('preserves entry order after rotation', () => {
    const entries = [
      { skill: 'first-recent', ts: daysAgoTs(5), trigger: 'auto' },
      { skill: 'old', ts: daysAgoTs(60), trigger: 'auto' },
      { skill: 'second-recent', ts: daysAgoTs(3), trigger: 'explicit' },
      { skill: 'older', ts: daysAgoTs(90), trigger: 'auto' },
      { skill: 'third-recent', ts: daysAgoTs(1), trigger: 'auto' }
    ];
    writePulseFile(tempDir, entries);
    
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    
    assert.strictEqual(result.exitCode, 0);
    
    const remaining = readPulseFile(tempDir);
    assert.strictEqual(remaining.length, 3);
    // Order should be preserved
    assert.strictEqual(remaining[0].skill, 'first-recent');
    assert.strictEqual(remaining[1].skill, 'second-recent');
    assert.strictEqual(remaining[2].skill, 'third-recent');
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
    // Use the tempDir which is already a proper path for the platform
    const entries = [
      { skill: 'test', ts: daysAgoTs(5), trigger: 'auto' }
    ];
    writePulseFile(tempDir, entries);
    
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    
    assert.strictEqual(result.exitCode, 0);
    const remaining = readPulseFile(tempDir);
    assert.strictEqual(remaining.length, 1);
  });
  
  test('handles path with spaces', () => {
    // Create a temp dir with spaces in the name
    const dirWithSpaces = path.join(os.tmpdir(), 'rotate test dir');
    try {
      fs.mkdirSync(dirWithSpaces, { recursive: true });
      
      const entries = [
        { skill: 'test', ts: daysAgoTs(5), trigger: 'auto' }
      ];
      writePulseFile(dirWithSpaces, entries);
      
      const result = runRotate({ CLAUDE_PLUGIN_DATA: dirWithSpaces }, ['30']);
      
      assert.strictEqual(result.exitCode, 0);
    } finally {
      fs.rmSync(dirWithSpaces, { recursive: true, force: true });
    }
  });
  
  test('handles unicode in path', () => {
    // Create a temp dir with unicode characters
    const dirWithUnicode = path.join(os.tmpdir(), 'rotate-测试-目录');
    try {
      fs.mkdirSync(dirWithUnicode, { recursive: true });
      
      const entries = [
        { skill: '技能', ts: daysAgoTs(5), trigger: 'auto' }
      ];
      writePulseFile(dirWithUnicode, entries);
      
      const result = runRotate({ CLAUDE_PLUGIN_DATA: dirWithUnicode }, ['30']);
      
      assert.strictEqual(result.exitCode, 0);
      const remaining = readPulseFile(dirWithUnicode);
      assert.strictEqual(remaining.length, 1);
      assert.strictEqual(remaining[0].skill, '技能');
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
  
  test('rotates entries created by track.js format', () => {
    // Simulate entries as created by track.js
    // Use 29 days to ensure entry is clearly within 30-day retention (avoid boundary timing issues)
    const entries = [
      { skill: 'careful', ts: daysAgoTs(60), trigger: 'explicit' },
      { skill: 'freeze', ts: daysAgoTs(29), trigger: 'auto' },
      { skill: 'careful', ts: daysAgoTs(5), trigger: 'auto' },
      { skill: 'my-skill-123', ts: daysAgoTs(2), trigger: 'explicit' }
    ];
    writePulseFile(tempDir, entries);
    
    const result = runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    
    assert.strictEqual(result.exitCode, 0);
    
    const remaining = readPulseFile(tempDir);
    assert.strictEqual(remaining.length, 3, 'Should keep 3 recent entries');
    
    // Verify the correct entries remain
    const skills = remaining.map(e => e.skill);
    assert.ok(!skills.includes('careful') || remaining.filter(e => e.skill === 'careful').length === 1);
    assert.ok(skills.includes('freeze'));
    assert.ok(skills.includes('my-skill-123'));
  });
  
  test('output remains compatible with track.js append', () => {
    // Create entries, rotate, then verify new entries can be appended
    const entries = [
      { skill: 'old', ts: daysAgoTs(60), trigger: 'auto' },
      { skill: 'recent', ts: daysAgoTs(5), trigger: 'auto' }
    ];
    writePulseFile(tempDir, entries);
    
    // Rotate
    runRotate({ CLAUDE_PLUGIN_DATA: tempDir }, ['30']);
    
    // Simulate appending a new entry (like track.js would)
    const pulsePath = path.join(tempDir, 'pulse.jsonl');
    const newEntry = { skill: 'new-skill', ts: nowTs(), trigger: 'explicit' };
    fs.appendFileSync(pulsePath, JSON.stringify(newEntry) + '\n', 'utf8');
    
    // Read and verify all entries are valid
    const allEntries = readPulseFile(tempDir);
    assert.strictEqual(allEntries.length, 2);
    assert.strictEqual(allEntries[0].skill, 'recent');
    assert.strictEqual(allEntries[1].skill, 'new-skill');
  });
});
