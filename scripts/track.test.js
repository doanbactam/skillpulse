/**
 * Unit tests for track.js - SkillPulse tracking script
 * 
 * Tests cover:
 * - SKILL.md detection (forward slash, backslash, mixed)
 * - Skill name extraction from various path depths
 * - Trigger classification (explicit vs auto)
 * - JSONL output format validation
 * - Error handling (missing env vars, invalid input)
 * - Cross-platform path handling
 * 
 * Uses Node.js built-in test runner (node:test) and assertions (node:assert).
 * Tests are isolated and deterministic - no shared state between tests.
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const os = require('os');

// Path to the script under test
const TRACK_SCRIPT_PATH = path.join(__dirname, 'track.js');

/**
 * Helper to create a unique temp directory for each test
 * This ensures test isolation
 */
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'track-test-'));
}

/**
 * Helper to run track.js with given environment variables
 * Returns { stdout, stderr, exitCode }
 */
function runTrack(env) {
  const result = {
    stdout: '',
    stderr: '',
    exitCode: null
  };
  
  try {
    result.stdout = execSync(
      `node "${TRACK_SCRIPT_PATH}"`,
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
 * Returns array of parsed entries
 */
function readPulseFile(dir) {
  const pulsePath = path.join(dir, 'pulse.jsonl');
  if (!fs.existsSync(pulsePath)) {
    return null;
  }
  const content = fs.readFileSync(pulsePath, 'utf8');
  return content.trim().split('\n').map(line => JSON.parse(line));
}

// ============================================================================
// SKILL.md DETECTION TESTS (VAL-TEST-002, VAL-PLAT-001, VAL-PLAT-002, VAL-PLAT-003)
// ============================================================================

describe('SKILL.md detection', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    // Cleanup temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('detects SKILL.md with forward slash path (Unix-style)', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/home/user/.claude/skills/careful/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
    assert.ok(entries, 'pulse.jsonl should be created');
    assert.strictEqual(entries.length, 1, 'Should have one entry');
    assert.strictEqual(entries[0].skill, 'careful', 'Skill name should be "careful"');
  });
  
  test('detects SKILL.md with backslash path (Windows-style)', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'C:\\Users\\name\\.claude\\skills\\careful\\SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.ok(entries, 'pulse.jsonl should be created');
    assert.strictEqual(entries.length, 1, 'Should have one entry');
    assert.strictEqual(entries[0].skill, 'careful', 'Skill name should be extracted from backslash path');
  });
  
  test('detects SKILL.md with mixed separators', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'C:/Users\\name/.claude\\skills/careful/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.ok(entries, 'pulse.jsonl should be created');
    assert.strictEqual(entries.length, 1, 'Should have one entry');
    assert.strictEqual(entries[0].skill, 'careful', 'Skill name should be extracted from mixed path');
  });
  
  test('is case-sensitive for SKILL.md (lowercase skill.md not detected)', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/careful/skill.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(entries, null, 'pulse.jsonl should NOT be created for lowercase skill.md');
  });
  
  test('is case-sensitive for SKILL.md (SKILL.MD uppercase not detected)', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/careful/SKILL.MD' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(entries, null, 'pulse.jsonl should NOT be created for uppercase SKILL.MD');
  });
  
  test('ignores non-SKILL.md files', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/home/user/README.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(entries, null, 'pulse.jsonl should NOT be created for README.md');
  });
  
  test('ignores files that end with SKILL.md but are not exact match', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/home/user/NOTSKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(entries, null, 'pulse.jsonl should NOT be created');
  });
});

// ============================================================================
// SKILL NAME EXTRACTION TESTS (VAL-TRACK-002, VAL-TRACK-009, VAL-TRACK-010)
// ============================================================================

describe('Skill name extraction', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('extracts skill name from simple path', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/my-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(entries[0].skill, 'my-skill');
  });
  
  test('extracts skill name from deeply nested path', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/a/b/c/d/e/deep-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(entries[0].skill, 'deep-skill', 'Should extract immediate parent directory');
  });
  
  test('extracts skill name with hyphens', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/my-skill-123/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(entries[0].skill, 'my-skill-123');
  });
  
  test('extracts skill name with underscores', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/skill_name/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(entries[0].skill, 'skill_name');
  });
  
  test('extracts skill name with numbers', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/skill123/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(entries[0].skill, 'skill123');
  });
  
  test('extracts skill name with mixed special characters', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/my-skill_v2-final/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(entries[0].skill, 'my-skill_v2-final');
  });
  
  test('extracts skill name from Windows UNC path', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '\\\\server\\share\\skills\\network-skill\\SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(entries[0].skill, 'network-skill');
  });
});

// ============================================================================
// TRIGGER CLASSIFICATION TESTS (VAL-TEST-003, VAL-TRACK-004, VAL-TRACK-005)
// ============================================================================

describe('Trigger classification', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('classifies explicit trigger when user message contains /skillname', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/careful/SKILL.md' }),
      CLAUDE_HUMAN_TURN: 'Please run /careful on this code',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(entries[0].trigger, 'explicit');
  });
  
  test('classifies auto trigger when user message does not contain skill name', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/careful/SKILL.md' }),
      CLAUDE_HUMAN_TURN: 'Please analyze this code',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(entries[0].trigger, 'auto');
  });
  
  test('classifies auto trigger when CLAUDE_HUMAN_TURN is empty', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/careful/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(entries[0].trigger, 'auto');
  });
  
  test('classifies auto trigger when CLAUDE_HUMAN_TURN is undefined', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/careful/SKILL.md' }),
      // CLAUDE_HUMAN_TURN not set
      CLAUDE_PLUGIN_DATA: tempDir
    };
    delete env.CLAUDE_HUMAN_TURN;
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(entries[0].trigger, 'auto');
  });
  
  test('classifies auto when user message contains different skill name', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/careful/SKILL.md' }),
      CLAUDE_HUMAN_TURN: 'Please run /freeze on this code',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    // Reading 'careful' but user asked for 'freeze' - this is auto
    assert.strictEqual(entries[0].trigger, 'auto');
  });
  
  test('classifies explicit for skill name with hyphens', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/my-skill-123/SKILL.md' }),
      CLAUDE_HUMAN_TURN: 'Run /my-skill-123 please',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(entries[0].trigger, 'explicit');
  });
  
  test('classifies explicit for skill name with underscores', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/skill_name/SKILL.md' }),
      CLAUDE_HUMAN_TURN: 'Run /skill_name please',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(entries[0].trigger, 'explicit');
  });
});

// ============================================================================
// JSONL OUTPUT FORMAT TESTS (VAL-TEST-004, VAL-TRACK-006)
// ============================================================================

describe('JSONL output format', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('outputs valid JSON on single line', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const pulsePath = path.join(tempDir, 'pulse.jsonl');
    const content = fs.readFileSync(pulsePath, 'utf8');
    
    // Should be valid JSON
    const parsed = JSON.parse(content.trim());
    assert.ok(parsed, 'Output should be valid JSON');
    
    // Should be single line (no newlines within the JSON)
    assert.strictEqual(content.trim().split('\n').length, 1, 'Should be single line');
  });
  
  test('contains all required fields', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.ok('skill' in entries[0], 'Should have skill field');
    assert.ok('ts' in entries[0], 'Should have ts field');
    assert.ok('trigger' in entries[0], 'Should have trigger field');
    assert.strictEqual(Object.keys(entries[0]).length, 3, 'Should have exactly 3 fields');
  });
  
  test('skill field is string', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(typeof entries[0].skill, 'string');
  });
  
  test('ts field is integer unix timestamp', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const beforeTs = Math.floor(Date.now() / 1000);
    const result = runTrack(env);
    const afterTs = Math.floor(Date.now() / 1000);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(typeof entries[0].ts, 'number');
    assert.ok(Number.isInteger(entries[0].ts), 'ts should be integer');
    assert.ok(entries[0].ts >= beforeTs, 'ts should be >= before timestamp');
    assert.ok(entries[0].ts <= afterTs, 'ts should be <= after timestamp');
  });
  
  test('trigger field is "auto" or "explicit"', () => {
    // Test auto
    let env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    let result = runTrack(env);
    let entries = readPulseFile(tempDir);
    assert.ok(['auto', 'explicit'].includes(entries[0].trigger));
    
    // Cleanup and test explicit
    fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = createTempDir();
    
    env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '/test-skill',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    result = runTrack(env);
    entries = readPulseFile(tempDir);
    assert.ok(['auto', 'explicit'].includes(entries[0].trigger));
  });
  
  test('appends to existing pulse.jsonl', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/skill-one/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    // First write
    runTrack(env);
    
    // Second write with different skill
    env.CLAUDE_TOOL_INPUT = JSON.stringify({ file_path: '/skills/skill-two/SKILL.md' });
    runTrack(env);
    
    const entries = readPulseFile(tempDir);
    assert.strictEqual(entries.length, 2, 'Should have 2 entries');
    assert.strictEqual(entries[0].skill, 'skill-one');
    assert.strictEqual(entries[1].skill, 'skill-two');
  });
  
  test('creates pulse.jsonl if it does not exist', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/new-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    // Ensure pulse.jsonl does not exist
    const pulsePath = path.join(tempDir, 'pulse.jsonl');
    assert.ok(!fs.existsSync(pulsePath), 'pulse.jsonl should not exist initially');
    
    const result = runTrack(env);
    assert.ok(fs.existsSync(pulsePath), 'pulse.jsonl should be created');
  });
});

// ============================================================================
// ERROR HANDLING TESTS (VAL-TEST-005, VAL-ERR-001 through VAL-ERR-010)
// ============================================================================

describe('Error handling', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('exits with code 0 on success (no output)', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });
  
  test('handles missing CLAUDE_PLUGIN_DATA gracefully', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: ''
      // CLAUDE_PLUGIN_DATA not set
    };
    
    const result = runTrack(env);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });
  
  test('handles empty CLAUDE_PLUGIN_DATA gracefully', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: ''
    };
    
    const result = runTrack(env);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });
  
  test('handles missing CLAUDE_TOOL_INPUT gracefully', () => {
    const env = {
      // CLAUDE_TOOL_INPUT not set
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });
  
  test('handles empty CLAUDE_TOOL_INPUT gracefully', () => {
    const env = {
      CLAUDE_TOOL_INPUT: '',
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });
  
  test('handles malformed JSON in CLAUDE_TOOL_INPUT gracefully', () => {
    const env = {
      CLAUDE_TOOL_INPUT: '{not valid json',
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });
  
  test('handles CLAUDE_TOOL_INPUT with non-object value', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify('not an object'),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });
  
  test('handles CLAUDE_TOOL_INPUT with null value', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify(null),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });
  
  test('handles CLAUDE_TOOL_INPUT with missing file_path field', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ other_field: 'value' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });
  
  test('handles CLAUDE_TOOL_INPUT with non-string file_path', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 123 }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });
  
  test('handles CLAUDE_TOOL_INPUT with empty file_path', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });
  
  test('handles write permission denied gracefully', () => {
    // Create a read-only directory
    const readOnlyDir = path.join(tempDir, 'readonly');
    fs.mkdirSync(readOnlyDir);
    
    // Make directory read-only (works on Unix-like systems)
    if (process.platform !== 'win32') {
      fs.chmodSync(readOnlyDir, 0o555);
      
      const env = {
        CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test-skill/SKILL.md' }),
        CLAUDE_HUMAN_TURN: '',
        CLAUDE_PLUGIN_DATA: readOnlyDir
      };
      
      const result = runTrack(env);
      
      assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
      assert.strictEqual(result.stdout, '', 'Should produce no stdout');
      assert.strictEqual(result.stderr, '', 'Should produce no stderr');
      
      // Restore permissions for cleanup
      fs.chmodSync(readOnlyDir, 0o755);
    } else {
      // On Windows, skip this test as chmod behaves differently
      assert.ok(true, 'Skipped on Windows');
    }
  });
  
  test('handles CLAUDE_HUMAN_TURN being null', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: null,
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(entries[0].trigger, 'auto', 'Should default to auto trigger');
  });
  
  test('handles non-existent CLAUDE_PLUGIN_DATA directory', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: '/nonexistent/path/that/does/not/exist'
    };
    
    const result = runTrack(env);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });
});

// ============================================================================
// CROSS-PLATFORM PATH HANDLING TESTS (VAL-TEST-006)
// ============================================================================

describe('Cross-platform path handling', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('handles Unix absolute path', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/home/user/.claude/skills/unix-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(entries[0].skill, 'unix-skill');
  });
  
  test('handles Windows drive letter path', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'C:\\Users\\user\\.claude\\skills\\win-skill\\SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(entries[0].skill, 'win-skill');
  });
  
  test('handles relative path with forward slashes', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'skills/relative-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(entries[0].skill, 'relative-skill');
  });
  
  test('handles relative path with backslashes', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'skills\\relative-skill\\SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(entries[0].skill, 'relative-skill');
  });
  
  test('handles path with forward slashes after backslashes', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'C:\\Users\\user/skills/mixed-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(entries[0].skill, 'mixed-skill');
  });
  
  test('handles very long file paths', () => {
    // Create a very long path (> 260 characters, Windows limit)
    const longPath = '/a/' + 'very_long_directory_name_'.repeat(20) + '/skill/SKILL.md';
    
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: longPath }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    
    // Should handle without crashing
    assert.strictEqual(result.exitCode, 0);
    
    const entries = readPulseFile(tempDir);
    assert.strictEqual(entries[0].skill, 'skill');
  });
  
  test('handles path with spaces in skill name', () => {
    // Note: This tests the path handling, though skill names with spaces are unusual
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/skill with spaces/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(entries[0].skill, 'skill with spaces');
  });
});

// ============================================================================
// ISOLATION AND DETERMINISM TESTS (VAL-TEST-007)
// ============================================================================

describe('Test isolation and determinism', () => {
  test('tests use unique temp directories', () => {
    const tempDirs = [];
    
    // Create multiple temp dirs
    for (let i = 0; i < 5; i++) {
      const dir = createTempDir();
      tempDirs.push(dir);
    }
    
    // All should be unique
    const uniqueDirs = new Set(tempDirs);
    assert.strictEqual(uniqueDirs.size, 5, 'Each temp dir should be unique');
    
    // Cleanup
    tempDirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
  });
  
  test('same input produces same output (deterministic)', () => {
    const tempDir1 = createTempDir();
    const tempDir2 = createTempDir();
    
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/deterministic-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir1
    };
    
    runTrack(env);
    const entries1 = readPulseFile(tempDir1);
    
    env.CLAUDE_PLUGIN_DATA = tempDir2;
    runTrack(env);
    const entries2 = readPulseFile(tempDir2);
    
    // Same skill and trigger
    assert.strictEqual(entries1[0].skill, entries2[0].skill);
    assert.strictEqual(entries1[0].trigger, entries2[0].trigger);
    
    // Timestamps should be very close (within 1 second)
    const tsDiff = Math.abs(entries1[0].ts - entries2[0].ts);
    assert.ok(tsDiff <= 1, 'Timestamps should be within 1 second');
    
    // Cleanup
    fs.rmSync(tempDir1, { recursive: true, force: true });
    fs.rmSync(tempDir2, { recursive: true, force: true });
  });
  
  test('tests do not affect each other (no shared state)', () => {
    // Run two tests in sequence with different skills
    let tempDir1 = createTempDir();
    
    // First test
    let env1 = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/isolated-a/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir1
    };
    runTrack(env1);
    let entries1 = readPulseFile(tempDir1);
    assert.strictEqual(entries1.length, 1);
    assert.strictEqual(entries1[0].skill, 'isolated-a');
    
    // Cleanup and run second test with completely separate directory
    fs.rmSync(tempDir1, { recursive: true, force: true });
    
    let tempDir2 = createTempDir();
    let env2 = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/isolated-b/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir2
    };
    runTrack(env2);
    let entries2 = readPulseFile(tempDir2);
    
    // Should only have isolated-b, not isolated-a
    assert.strictEqual(entries2.length, 1);
    assert.strictEqual(entries2[0].skill, 'isolated-b');
    
    // Cleanup
    fs.rmSync(tempDir2, { recursive: true, force: true });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Edge cases', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('handles SKILL.md at root level (no parent directory)', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    
    // Should exit silently without creating log entry
    assert.strictEqual(result.exitCode, 0);
    const entries = readPulseFile(tempDir);
    assert.strictEqual(entries, null, 'Should not create entry for root-level SKILL.md');
  });
  
  test('handles path ending with just directory separator before SKILL.md', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills//SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    
    // Should handle gracefully
    assert.strictEqual(result.exitCode, 0);
  });
  
  test('handles unicode in file paths', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/技能测试/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(entries[0].skill, '技能测试');
  });
  
  test('handles CLAUDE_HUMAN_TURN with unicode characters', () => {
    const env = {
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/技能/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '请运行 /技能',
      CLAUDE_PLUGIN_DATA: tempDir
    };
    
    const result = runTrack(env);
    const entries = readPulseFile(tempDir);
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(entries[0].trigger, 'explicit');
  });
});
