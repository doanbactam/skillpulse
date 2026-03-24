/**
 * Unit tests for export.js - SkillPulse export functionality
 * 
 * Tests cover:
 * - JSON export produces valid JSON array
 * - CSV export produces valid CSV with correct headers
 * - Empty data produces valid empty output ([] for JSON, headers only for CSV)
 * - Export reads all entries from pulse.jsonl
 * - Error handling (missing CLAUDE_PLUGIN_DATA, corrupted entries)
 * 
 * Uses Node.js built-in test runner (node:test) and assertions (node:assert).
 * Tests are isolated and deterministic - no shared state between tests.
 * 
 * Fulfills:
 * - VAL-ENH-005: Export - produces valid JSON output
 * - VAL-ENH-006: Export - produces valid CSV output
 * - VAL-ENH-007: Export - handles empty data
 */

'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Path to the script under test
const EXPORT_SCRIPT_PATH = path.join(__dirname, 'export.js');

/**
 * Helper to create a unique temp directory for each test
 * This ensures test isolation
 */
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'export-test-'));
}

/**
 * Helper to run export.js with given environment variables and arguments
 * Returns { stdout, stderr, exitCode }
 */
function runExport(env, args = []) {
  const result = {
    stdout: '',
    stderr: '',
    exitCode: null
  };
  
  const argsStr = args.length > 0 ? ' ' + args.map(a => `"${a}"`).join(' ') : '';
  
  try {
    result.stdout = execSync(
      `node "${EXPORT_SCRIPT_PATH}"${argsStr}`,
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
 * Helper to create a pulse.jsonl file with given entries
 */
function createPulseFile(dir, entries) {
  const pulsePath = path.join(dir, 'pulse.jsonl');
  const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(pulsePath, content, 'utf8');
  return pulsePath;
}

// ============================================================================
// JSON EXPORT TESTS (VAL-ENH-005)
// ============================================================================

describe('JSON export', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('produces valid JSON array', () => {
    createPulseFile(tempDir, [
      { skill: 'careful', ts: 1711234567, trigger: 'auto' },
      { skill: 'freeze', ts: 1711234568, trigger: 'explicit' }
    ]);
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['json']);
    
    assert.strictEqual(result.exitCode, 0, 'Exit code should be 0');
    
    // Should be valid JSON
    const parsed = JSON.parse(result.stdout);
    assert.ok(Array.isArray(parsed), 'Output should be a JSON array');
  });
  
  test('includes all entries from pulse.jsonl', () => {
    const entries = [
      { skill: 'careful', ts: 1711234567, trigger: 'auto' },
      { skill: 'freeze', ts: 1711234568, trigger: 'explicit' },
      { skill: 'plugin-developer', ts: 1711234569, trigger: 'auto' }
    ];
    createPulseFile(tempDir, entries);
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['json']);
    const parsed = JSON.parse(result.stdout);
    
    assert.strictEqual(parsed.length, 3, 'Should have all 3 entries');
    assert.strictEqual(parsed[0].skill, 'careful');
    assert.strictEqual(parsed[1].skill, 'freeze');
    assert.strictEqual(parsed[2].skill, 'plugin-developer');
  });
  
  test('preserves entry fields', () => {
    createPulseFile(tempDir, [
      { skill: 'my-skill', ts: 1711234567, trigger: 'explicit' }
    ]);
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['json']);
    const parsed = JSON.parse(result.stdout);
    
    assert.strictEqual(parsed[0].skill, 'my-skill');
    assert.strictEqual(parsed[0].ts, 1711234567);
    assert.strictEqual(parsed[0].trigger, 'explicit');
    assert.strictEqual(Object.keys(parsed[0]).length, 3, 'Should have exactly 3 fields');
  });
  
  test('produces empty array for empty pulse.jsonl', () => {
    // Create empty pulse.jsonl
    const pulsePath = path.join(tempDir, 'pulse.jsonl');
    fs.writeFileSync(pulsePath, '', 'utf8');
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['json']);
    const parsed = JSON.parse(result.stdout);
    
    assert.strictEqual(result.exitCode, 0);
    assert.ok(Array.isArray(parsed), 'Should be an array');
    assert.strictEqual(parsed.length, 0, 'Should be empty array');
  });
  
  test('produces empty array for non-existent pulse.jsonl', () => {
    // Don't create pulse.jsonl
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['json']);
    const parsed = JSON.parse(result.stdout);
    
    assert.strictEqual(result.exitCode, 0);
    assert.ok(Array.isArray(parsed));
    assert.strictEqual(parsed.length, 0, 'Should be empty array when file missing');
  });
  
  test('skips corrupted entries and preserves valid ones', () => {
    const pulsePath = path.join(tempDir, 'pulse.jsonl');
    // Mix valid and invalid entries
    const content = `{"skill":"valid1","ts":1711234567,"trigger":"auto"}
{broken json here
{"skill":"valid2","ts":1711234568,"trigger":"explicit"}
{"skill":"valid3","ts":1711234569,"trigger":"auto"}`;
    fs.writeFileSync(pulsePath, content, 'utf8');
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['json']);
    const parsed = JSON.parse(result.stdout);
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(parsed.length, 3, 'Should have 3 valid entries, skipping corrupted');
    assert.strictEqual(parsed[0].skill, 'valid1');
    assert.strictEqual(parsed[1].skill, 'valid2');
    assert.strictEqual(parsed[2].skill, 'valid3');
  });
  
  test('handles entries with unicode skill names', () => {
    createPulseFile(tempDir, [
      { skill: '技能测试', ts: 1711234567, trigger: 'auto' }
    ]);
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['json']);
    const parsed = JSON.parse(result.stdout);
    
    assert.strictEqual(parsed[0].skill, '技能测试');
  });
  
  test('defaults to JSON format when no format specified', () => {
    createPulseFile(tempDir, [
      { skill: 'careful', ts: 1711234567, trigger: 'auto' }
    ]);
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir });
    const parsed = JSON.parse(result.stdout);
    
    assert.ok(Array.isArray(parsed), 'Default should be JSON array');
    assert.strictEqual(parsed.length, 1);
  });
});

// ============================================================================
// CSV EXPORT TESTS (VAL-ENH-006)
// ============================================================================

describe('CSV export', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('produces valid CSV with headers', () => {
    createPulseFile(tempDir, [
      { skill: 'careful', ts: 1711234567, trigger: 'auto' }
    ]);
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['csv']);
    const lines = result.stdout.trim().split('\n');
    
    assert.strictEqual(result.exitCode, 0);
    assert.ok(lines.length >= 2, 'Should have header + at least one data row');
    assert.strictEqual(lines[0], 'skill,ts,trigger', 'Header should be skill,ts,trigger');
  });
  
  test('includes all entries as CSV rows', () => {
    createPulseFile(tempDir, [
      { skill: 'careful', ts: 1711234567, trigger: 'auto' },
      { skill: 'freeze', ts: 1711234568, trigger: 'explicit' },
      { skill: 'plugin-developer', ts: 1711234569, trigger: 'auto' }
    ]);
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['csv']);
    const lines = result.stdout.trim().split('\n');
    
    assert.strictEqual(lines.length, 4, 'Should have header + 3 data rows');
    assert.strictEqual(lines[1], 'careful,1711234567,auto');
    assert.strictEqual(lines[2], 'freeze,1711234568,explicit');
    assert.strictEqual(lines[3], 'plugin-developer,1711234569,auto');
  });
  
  test('produces headers only for empty pulse.jsonl', () => {
    // Create empty pulse.jsonl
    const pulsePath = path.join(tempDir, 'pulse.jsonl');
    fs.writeFileSync(pulsePath, '', 'utf8');
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['csv']);
    const lines = result.stdout.trim().split('\n');
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(lines.length, 1, 'Should have only header');
    assert.strictEqual(lines[0], 'skill,ts,trigger');
  });
  
  test('produces headers only for non-existent pulse.jsonl', () => {
    // Don't create pulse.jsonl
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['csv']);
    const lines = result.stdout.trim().split('\n');
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(lines.length, 1, 'Should have only header');
    assert.strictEqual(lines[0], 'skill,ts,trigger');
  });
  
  test('handles skill names with hyphens', () => {
    createPulseFile(tempDir, [
      { skill: 'my-skill-123', ts: 1711234567, trigger: 'auto' }
    ]);
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['csv']);
    const lines = result.stdout.trim().split('\n');
    
    assert.strictEqual(lines[1], 'my-skill-123,1711234567,auto');
  });
  
  test('handles skill names with underscores', () => {
    createPulseFile(tempDir, [
      { skill: 'skill_name', ts: 1711234567, trigger: 'explicit' }
    ]);
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['csv']);
    const lines = result.stdout.trim().split('\n');
    
    assert.strictEqual(lines[1], 'skill_name,1711234567,explicit');
  });
  
  test('handles skill names with unicode characters', () => {
    createPulseFile(tempDir, [
      { skill: '技能测试', ts: 1711234567, trigger: 'auto' }
    ]);
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['csv']);
    const lines = result.stdout.trim().split('\n');
    
    assert.strictEqual(lines[1], '技能测试,1711234567,auto');
  });
  
  test('skips corrupted entries in CSV export', () => {
    const pulsePath = path.join(tempDir, 'pulse.jsonl');
    const content = `{"skill":"valid1","ts":1711234567,"trigger":"auto"}
{broken json
{"skill":"valid2","ts":1711234568,"trigger":"explicit"}`;
    fs.writeFileSync(pulsePath, content, 'utf8');
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['csv']);
    const lines = result.stdout.trim().split('\n');
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(lines.length, 3, 'Should have header + 2 valid rows');
    assert.strictEqual(lines[1], 'valid1,1711234567,auto');
    assert.strictEqual(lines[2], 'valid2,1711234568,explicit');
  });
  
  test('handles entries with missing fields gracefully', () => {
    const pulsePath = path.join(tempDir, 'pulse.jsonl');
    // Entry with missing trigger field
    const content = `{"skill":"partial","ts":1711234567}
{"skill":"complete","ts":1711234568,"trigger":"explicit"}`;
    fs.writeFileSync(pulsePath, content, 'utf8');
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['csv']);
    const lines = result.stdout.trim().split('\n');
    
    assert.strictEqual(result.exitCode, 0);
    // Should skip incomplete entry or handle gracefully
    assert.ok(lines.length >= 2, 'Should have at least header and one valid entry');
  });
});

// ============================================================================
// ERROR HANDLING TESTS (VAL-ENH-007)
// ============================================================================

describe('Error handling', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('exits with code 0 on success', () => {
    createPulseFile(tempDir, [
      { skill: 'test', ts: 1711234567, trigger: 'auto' }
    ]);
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['json']);
    assert.strictEqual(result.exitCode, 0);
  });
  
  test('handles missing CLAUDE_PLUGIN_DATA gracefully', () => {
    const result = runExport({}, ['json']);
    
    assert.strictEqual(result.exitCode, 0);
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.length, 0, 'Should return empty array');
  });
  
  test('handles empty CLAUDE_PLUGIN_DATA gracefully', () => {
    const result = runExport({ CLAUDE_PLUGIN_DATA: '' }, ['json']);
    
    assert.strictEqual(result.exitCode, 0);
    const parsed = JSON.parse(result.stdout);
    assert.strictEqual(parsed.length, 0);
  });
  
  test('handles invalid format argument gracefully', () => {
    createPulseFile(tempDir, [
      { skill: 'test', ts: 1711234567, trigger: 'auto' }
    ]);
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['invalid']);
    
    // Should default to JSON or handle gracefully
    assert.strictEqual(result.exitCode, 0);
  });
  
  test('handles case-insensitive format argument', () => {
    createPulseFile(tempDir, [
      { skill: 'test', ts: 1711234567, trigger: 'auto' }
    ]);
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['CSV']);
    const lines = result.stdout.trim().split('\n');
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(lines[0], 'skill,ts,trigger');
  });
  
  test('produces no stderr on success', () => {
    createPulseFile(tempDir, [
      { skill: 'test', ts: 1711234567, trigger: 'auto' }
    ]);
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['json']);
    assert.strictEqual(result.stderr, '', 'Should produce no stderr');
  });
  
  test('handles pulse.jsonl with only empty lines', () => {
    const pulsePath = path.join(tempDir, 'pulse.jsonl');
    fs.writeFileSync(pulsePath, '\n\n\n', 'utf8');
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['json']);
    const parsed = JSON.parse(result.stdout);
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(parsed.length, 0, 'Empty lines should result in empty array');
  });
});

// ============================================================================
// LARGE FILE HANDLING TESTS
// ============================================================================

describe('Large file handling', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('handles 100 entries correctly', () => {
    const entries = [];
    for (let i = 0; i < 100; i++) {
      entries.push({ skill: `skill-${i}`, ts: 1711234567 + i, trigger: i % 2 === 0 ? 'auto' : 'explicit' });
    }
    createPulseFile(tempDir, entries);
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['json']);
    const parsed = JSON.parse(result.stdout);
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(parsed.length, 100);
    assert.strictEqual(parsed[0].skill, 'skill-0');
    assert.strictEqual(parsed[99].skill, 'skill-99');
  });
  
  test('CSV handles 100 entries correctly', () => {
    const entries = [];
    for (let i = 0; i < 100; i++) {
      entries.push({ skill: `skill-${i}`, ts: 1711234567 + i, trigger: 'auto' });
    }
    createPulseFile(tempDir, entries);
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['csv']);
    const lines = result.stdout.trim().split('\n');
    
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(lines.length, 101, 'Should have header + 100 data rows');
  });
});

// ============================================================================
// INTEGRATION WITH PULSE SKILL TESTS
// ============================================================================

describe('Integration readiness', () => {
  let tempDir;
  
  beforeEach(() => {
    tempDir = createTempDir();
  });
  
  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  
  test('export output can be piped to file', () => {
    createPulseFile(tempDir, [
      { skill: 'careful', ts: 1711234567, trigger: 'auto' },
      { skill: 'freeze', ts: 1711234568, trigger: 'explicit' }
    ]);
    
    const outputPath = path.join(tempDir, 'export.json');
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['json']);
    
    // Write output to file
    fs.writeFileSync(outputPath, result.stdout, 'utf8');
    
    // Verify file is valid JSON
    const fileContent = fs.readFileSync(outputPath, 'utf8');
    const parsed = JSON.parse(fileContent);
    assert.strictEqual(parsed.length, 2);
  });
  
  test('CSV output can be imported by standard CSV parsers', () => {
    createPulseFile(tempDir, [
      { skill: 'careful', ts: 1711234567, trigger: 'auto' }
    ]);
    
    const result = runExport({ CLAUDE_PLUGIN_DATA: tempDir }, ['csv']);
    
    // Verify CSV structure: no quotes needed for simple values
    assert.ok(!result.stdout.includes('"'), 'Simple values should not be quoted');
    
    // Verify comma separation
    const lines = result.stdout.trim().split('\n');
    assert.strictEqual(lines[1].split(',').length, 3, 'Each row should have 3 columns');
  });
});
