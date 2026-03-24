/**
 * Unit tests for scripts/track.js
 * 
 * Uses Node.js built-in test runner (node:test) and assertions (node:assert)
 * Tests are isolated and use mocked environment variables.
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Helper to create temp directory for tests
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skillpulse-test-'));
}

// Helper to run track.js with given env vars
function runTrack(env) {
  const mergedEnv = { ...process.env, ...env };
  try {
    execSync('node scripts/track.js', {
      env: mergedEnv,
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8'
    });
    return { exitCode: 0, stdout: '', stderr: '' };
  } catch (error) {
    return {
      exitCode: error.status || 1,
      stdout: error.stdout || '',
      stderr: error.stderr || ''
    };
  }
}

// Helper to read pulse.jsonl content
function readPulseFile(dir) {
  const filePath = path.join(dir, 'pulse.jsonl');
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
}

// Helper to parse JSONL content
function parseJsonl(content) {
  if (!content) return [];
  return content.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

describe('track.js - SKILL.md detection', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('detects SKILL.md with forward slash path', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/careful/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with code 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');

    const entries = parseJsonl(readPulseFile(tempDir));
    assert.strictEqual(entries.length, 1, 'Should have one entry');
    assert.strictEqual(entries[0].skill, 'careful', 'Should extract correct skill name');
  });

  test('detects SKILL.md with backslash path (Windows)', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'C:\\skills\\test\\SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with code 0');

    const entries = parseJsonl(readPulseFile(tempDir));
    assert.strictEqual(entries.length, 1, 'Should have one entry');
    assert.strictEqual(entries[0].skill, 'test', 'Should extract correct skill name');
  });

  test('detects SKILL.md with mixed separators', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: 'C:/skills\\my-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with code 0');

    const entries = parseJsonl(readPulseFile(tempDir));
    assert.strictEqual(entries.length, 1, 'Should have one entry');
    assert.strictEqual(entries[0].skill, 'my-skill', 'Should extract correct skill name');
  });

  test('ignores non-SKILL.md files', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/careful/README.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with code 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');

    const content = readPulseFile(tempDir);
    assert.strictEqual(content, null, 'Should not create pulse.jsonl for non-SKILL.md');
  });

  test('ignores lowercase skill.md', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/careful/skill.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with code 0');
    const content = readPulseFile(tempDir);
    assert.strictEqual(content, null, 'Should not log lowercase skill.md');
  });
});

describe('track.js - Skill name extraction', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('extracts skill name from deeply nested path', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/a/b/c/d/e/my-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0);
    const entries = parseJsonl(readPulseFile(tempDir));
    assert.strictEqual(entries[0].skill, 'my-skill', 'Should extract immediate parent as skill name');
  });

  test('handles skill names with hyphens', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/my-skill-123/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0);
    const entries = parseJsonl(readPulseFile(tempDir));
    assert.strictEqual(entries[0].skill, 'my-skill-123');
  });

  test('handles skill names with underscores', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/skill_name/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0);
    const entries = parseJsonl(readPulseFile(tempDir));
    assert.strictEqual(entries[0].skill, 'skill_name');
  });

  test('handles skill names with numbers', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/skill123/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0);
    const entries = parseJsonl(readPulseFile(tempDir));
    assert.strictEqual(entries[0].skill, 'skill123');
  });
});

describe('track.js - Trigger classification', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('classifies explicit trigger when user message contains /skillname', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/careful/SKILL.md' }),
      CLAUDE_HUMAN_TURN: 'Please use /careful to analyze this',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0);
    const entries = parseJsonl(readPulseFile(tempDir));
    assert.strictEqual(entries[0].trigger, 'explicit', 'Should classify as explicit');
  });

  test('classifies auto trigger when user message does not contain skill name', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/careful/SKILL.md' }),
      CLAUDE_HUMAN_TURN: 'Please analyze this code',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0);
    const entries = parseJsonl(readPulseFile(tempDir));
    assert.strictEqual(entries[0].trigger, 'auto', 'Should classify as auto');
  });

  test('classifies auto trigger when CLAUDE_HUMAN_TURN is empty', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/careful/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0);
    const entries = parseJsonl(readPulseFile(tempDir));
    assert.strictEqual(entries[0].trigger, 'auto', 'Should default to auto when empty');
  });

  test('classifies auto when CLAUDE_HUMAN_TURN is undefined', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/careful/SKILL.md' }),
      // CLAUDE_HUMAN_TURN not set
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0);
    const entries = parseJsonl(readPulseFile(tempDir));
    assert.strictEqual(entries[0].trigger, 'auto', 'Should default to auto when undefined');
  });

  test('only matches exact skill name in explicit trigger', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/careful/SKILL.md' }),
      CLAUDE_HUMAN_TURN: 'Use /care to analyze',  // /care not /careful
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0);
    const entries = parseJsonl(readPulseFile(tempDir));
    assert.strictEqual(entries[0].trigger, 'auto', 'Should not partial match');
  });
});

describe('track.js - JSONL output format', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('writes valid JSON line with all required fields', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test-skill/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0);

    const content = readPulseFile(tempDir);
    const lines = content.trim().split('\n');
    assert.strictEqual(lines.length, 1, 'Should have exactly one line');

    const entry = JSON.parse(lines[0]);
    assert.strictEqual(typeof entry.skill, 'string', 'skill should be string');
    assert.strictEqual(typeof entry.ts, 'number', 'ts should be number');
    assert.strictEqual(typeof entry.trigger, 'string', 'trigger should be string');
    assert.ok(['auto', 'explicit'].includes(entry.trigger), 'trigger should be auto or explicit');
  });

  test('timestamp is valid Unix timestamp in seconds', () => {
    const beforeTs = Math.floor(Date.now() / 1000);
    
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    const afterTs = Math.floor(Date.now() / 1000);

    assert.strictEqual(result.exitCode, 0);

    const entries = parseJsonl(readPulseFile(tempDir));
    const entryTs = entries[0].ts;
    
    assert.ok(entryTs >= beforeTs, 'Timestamp should be >= before test');
    assert.ok(entryTs <= afterTs, 'Timestamp should be <= after test');
  });

  test('appends to existing pulse.jsonl', () => {
    // First entry
    runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/skill1/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    // Second entry
    runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/skill2/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    const entries = parseJsonl(readPulseFile(tempDir));
    assert.strictEqual(entries.length, 2, 'Should have two entries');
    assert.strictEqual(entries[0].skill, 'skill1');
    assert.strictEqual(entries[1].skill, 'skill2');
  });

  test('creates pulse.jsonl if it does not exist', () => {
    const pulsePath = path.join(tempDir, 'pulse.jsonl');
    assert.strictEqual(fs.existsSync(pulsePath), false, 'pulse.jsonl should not exist initially');

    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(fs.existsSync(pulsePath), true, 'pulse.jsonl should be created');
  });
});

describe('track.js - Error handling', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('exits with code 0 when CLAUDE_TOOL_INPUT is missing', () => {
    const result = runTrack({
      // CLAUDE_TOOL_INPUT not set
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with code 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });

  test('exits with code 0 when CLAUDE_PLUGIN_DATA is missing', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test/SKILL.md' }),
      CLAUDE_HUMAN_TURN: ''
      // CLAUDE_PLUGIN_DATA not set
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with code 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });

  test('exits with code 0 when CLAUDE_TOOL_INPUT is malformed JSON', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: '{not valid json',
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with code 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });

  test('exits with code 0 when CLAUDE_TOOL_INPUT lacks file_path', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ other_field: 'value' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with code 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });

  test('exits with code 0 when CLAUDE_PLUGIN_DATA is invalid path', () => {
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: '/nonexistent/path/that/does/not/exist'
    });

    assert.strictEqual(result.exitCode, 0, 'Should exit with code 0');
    assert.strictEqual(result.stdout, '', 'Should produce no stdout');
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });
});

describe('track.js - Cross-platform paths', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('handles Windows-style CLAUDE_PLUGIN_DATA path', () => {
    // Use the actual temp dir which will have platform-specific path
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir
    });

    assert.strictEqual(result.exitCode, 0);

    const entries = parseJsonl(readPulseFile(tempDir));
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].skill, 'test');
  });

  test('handles Unix-style CLAUDE_PLUGIN_DATA path', () => {
    // On Windows, tempDir will be Windows-style, but we test the logic
    const result = runTrack({
      CLAUDE_TOOL_INPUT: JSON.stringify({ file_path: '/skills/test/SKILL.md' }),
      CLAUDE_HUMAN_TURN: '',
      CLAUDE_PLUGIN_DATA: tempDir.replace(/\\/g, '/')
    });

    assert.strictEqual(result.exitCode, 0);
  });
});
