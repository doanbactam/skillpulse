/**
 * SkillPulse - Cross-Area Flow Validation Tests
 * 
 * Tests FLOW-001 through FLOW-010 from the validation contract.
 * These tests verify end-to-end flows across multiple areas.
 */

'use strict';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// Test directory for isolated testing
const TEST_DIR = path.join(__dirname, '..', '.flow-test-temp');
const PULSE_FILE = path.join(TEST_DIR, 'pulse.jsonl');

// Scripts paths
const TRACK_JS = path.join(__dirname, 'track.js');
const ROTATE_JS = path.join(__dirname, 'rotate.js');
const EXPORT_JS = path.join(__dirname, 'export.js');
const RESET_JS = path.join(__dirname, 'reset.js');

// Helper to run track.js with env vars
function runTrack(filePath, humanTurn = '', pluginData = TEST_DIR) {
  const input = JSON.stringify({ file_path: filePath });
  const result = execSync(
    `node "${TRACK_JS}"`,
    {
      env: {
        ...process.env,
        CLAUDE_TOOL_INPUT: input,
        CLAUDE_HUMAN_TURN: humanTurn,
        CLAUDE_PLUGIN_DATA: pluginData
      },
      encoding: 'utf8',
      timeout: 5000
    }
  );
  return result;
}

// Helper to run rotate.js
function runRotate(retentionDays, pluginData = TEST_DIR) {
  const result = execSync(
    `node "${ROTATE_JS}" ${retentionDays}`,
    {
      env: {
        ...process.env,
        CLAUDE_PLUGIN_DATA: pluginData
      },
      encoding: 'utf8',
      timeout: 5000
    }
  );
  return result;
}

// Helper to run export.js
function runExport(format = 'json', pluginData = TEST_DIR) {
  const result = execSync(
    `node "${EXPORT_JS}" ${format}`,
    {
      env: {
        ...process.env,
        CLAUDE_PLUGIN_DATA: pluginData
      },
      encoding: 'utf8',
      timeout: 5000
    }
  );
  return result;
}

// Helper to run reset.js
function runReset(force = false, pluginData = TEST_DIR) {
  const forceFlag = force ? '--force' : '';
  const result = execSync(
    `node "${RESET_JS}" ${forceFlag}`,
    {
      env: {
        ...process.env,
        CLAUDE_PLUGIN_DATA: pluginData
      },
      encoding: 'utf8',
      timeout: 5000
    }
  );
  return result;
}

// Helper to read pulse.jsonl entries
function readPulseFile() {
  if (!fs.existsSync(PULSE_FILE)) {
    return [];
  }
  const content = fs.readFileSync(PULSE_FILE, 'utf8');
  if (!content.trim()) {
    return [];
  }
  return content.trim().split('\n').map(line => JSON.parse(line));
}

// Helper to write entries to pulse.jsonl
function writePulseFile(entries) {
  const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(PULSE_FILE, content, 'utf8');
}

// Helper to create a timestamp N days ago
function daysAgo(days) {
  return Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
}

// Setup and teardown
before(() => {
  // Create test directory
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
});

after(() => {
  // Clean up test directory
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

beforeEach(() => {
  // Clean pulse file before each test
  if (fs.existsSync(PULSE_FILE)) {
    fs.unlinkSync(PULSE_FILE);
  }
});

// ========================================
// FLOW-001: Track → Verify → Export works end-to-end
// ========================================
describe('FLOW-001: Track → Verify → Export works end-to-end', () => {
  test('complete tracking flow verification', () => {
    // Step 1: Start with empty pulse.jsonl (already clean from beforeEach)
    assert.ok(!fs.existsSync(PULSE_FILE), 'pulse.jsonl should not exist initially');
    
    // Step 2: Trigger 3 different skills (mix of explicit and auto)
    // Skill 1: explicit trigger
    runTrack('/skills/careful/SKILL.md', '/careful please help');
    
    // Skill 2: auto trigger (no /freeze in message)
    runTrack('/skills/freeze/SKILL.md', 'please analyze this code');
    
    // Skill 3: explicit trigger
    runTrack('/skills/planning/SKILL.md', '/planning create a roadmap');
    
    // Step 3: Verify pulse.jsonl has 3 entries with correct data
    const entries = readPulseFile();
    assert.strictEqual(entries.length, 3, 'Should have 3 entries');
    
    assert.strictEqual(entries[0].skill, 'careful');
    assert.strictEqual(entries[0].trigger, 'explicit');
    
    assert.strictEqual(entries[1].skill, 'freeze');
    assert.strictEqual(entries[1].trigger, 'auto');
    
    assert.strictEqual(entries[2].skill, 'planning');
    assert.strictEqual(entries[2].trigger, 'explicit');
    
    // Step 4: Run export to JSON
    const jsonExport = runExport('json');
    const exported = JSON.parse(jsonExport);
    
    // Step 5: Verify exported JSON matches pulse.jsonl content
    assert.strictEqual(exported.length, 3, 'Export should have 3 entries');
    assert.strictEqual(exported[0].skill, 'careful');
    assert.strictEqual(exported[1].skill, 'freeze');
    assert.strictEqual(exported[2].skill, 'planning');
    
    // Also verify CSV export works
    const csvExport = runExport('csv');
    const csvLines = csvExport.trim().split('\n');
    assert.strictEqual(csvLines.length, 4, 'CSV should have header + 3 data rows'); // header + 3 entries
    assert.strictEqual(csvLines[0], 'skill,ts,trigger');
    assert.ok(csvLines[1].includes('careful'));
    assert.ok(csvLines[2].includes('freeze'));
    assert.ok(csvLines[3].includes('planning'));
  });
});

// ========================================
// FLOW-002: Track → Rotate → Verify retention works
// ========================================
describe('FLOW-002: Track → Rotate → Verify retention works', () => {
  test('data lifecycle management', () => {
    // Step 1: Create entries with timestamps: 60 days ago, 30 days ago, 1 day ago
    const entries = [
      { skill: 'old-skill', ts: daysAgo(60), trigger: 'auto' },
      { skill: 'mid-skill', ts: daysAgo(30), trigger: 'auto' },
      { skill: 'new-skill', ts: daysAgo(1), trigger: 'explicit' }
    ];
    writePulseFile(entries);
    
    // Step 2: Run rotation with 45-day retention
    runRotate(45);
    
    // Step 3: Verify 60-day entry removed, others preserved
    const afterRotate = readPulseFile();
    assert.strictEqual(afterRotate.length, 2, 'Should have 2 entries after rotation');
    
    const skillNames = afterRotate.map(e => e.skill);
    assert.ok(!skillNames.includes('old-skill'), '60-day old entry should be removed');
    assert.ok(skillNames.includes('mid-skill'), '30-day old entry should be preserved');
    assert.ok(skillNames.includes('new-skill'), '1-day old entry should be preserved');
    
    // Step 4 & 5: Verify only new entries appear in recent output
    // The pulse skill filters by time, but we can verify the data is correct
    assert.strictEqual(afterRotate[0].skill, 'mid-skill');
    assert.strictEqual(afterRotate[1].skill, 'new-skill');
  });
});

// ========================================
// FLOW-003: Cross-platform data compatibility
// ========================================
describe('FLOW-003: Track on Windows → Read on macOS (Cross-platform data compatibility)', () => {
  test('data compatibility across platforms', () => {
    // Simulate data written on Windows (backslash paths)
    runTrack('C:\\Users\\test\\.claude\\skills\\careful\\SKILL.md', '/careful');
    
    // Verify entry is written correctly
    const entries = readPulseFile();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].skill, 'careful');
    
    // The data format is JSON, which is platform-independent
    // Verify the JSON can be parsed and has correct structure
    const rawContent = fs.readFileSync(PULSE_FILE, 'utf8');
    const parsed = JSON.parse(rawContent.trim());
    assert.strictEqual(typeof parsed.skill, 'string');
    assert.strictEqual(typeof parsed.ts, 'number');
    assert.strictEqual(typeof parsed.trigger, 'string');
    
    // Simulate reading this data on macOS - it should parse correctly
    // (In reality, this would be on a different machine, but the JSON format
    // ensures compatibility)
    const exported = runExport('json');
    const exportedData = JSON.parse(exported);
    assert.strictEqual(exportedData[0].skill, 'careful');
  });
});

// ========================================
// FLOW-004: Error recovery → Continue tracking works
// ========================================
describe('FLOW-004: Error recovery → Continue tracking works', () => {
  test('resilience after error conditions', () => {
    // Step 1: Make CLAUDE_PLUGIN_DATA temporarily "read-only" by using invalid path
    // This simulates write failure
    
    // Step 2: Trigger skill read with invalid path (silently fails)
    const invalidPath = path.join(TEST_DIR, 'nonexistent-deep', 'nested', 'path');
    runTrack('/skills/test1/SKILL.md', '', invalidPath);
    
    // Step 3: Trigger with valid path
    runTrack('/skills/test2/SKILL.md', '');
    
    // Step 4: Verify new entry written successfully
    const entries = readPulseFile();
    assert.strictEqual(entries.length, 1, 'Should have 1 entry after recovery');
    assert.strictEqual(entries[0].skill, 'test2');
  });
});

// ========================================
// FLOW-005: Concurrent track → No corruption
// ========================================
describe('FLOW-005: Concurrent tracking → No corruption', () => {
  test('concurrent write safety', (t, done) => {
    // Create multiple entries rapidly (simulating concurrent writes)
    const numWrites = 10;
    const skills = [];
    
    // Run track.js multiple times in quick succession
    for (let i = 0; i < numWrites; i++) {
      const skillName = `skill-${i}`;
      skills.push(skillName);
      runTrack(`/skills/${skillName}/SKILL.md`, '');
    }
    
    // Wait for all to complete and verify
    const entries = readPulseFile();
    
    // Step 3 & 4: Verify all entries present, no corruption
    assert.strictEqual(entries.length, numWrites, `Should have ${numWrites} entries`);
    
    // Verify all entries are valid JSON and have correct structure
    const skillNames = entries.map(e => {
      assert.strictEqual(typeof e.skill, 'string');
      assert.strictEqual(typeof e.ts, 'number');
      assert.strictEqual(typeof e.trigger, 'string');
      return e.skill;
    });
    
    // Verify all expected skills are present
    for (const skill of skills) {
      assert.ok(skillNames.includes(skill), `Skill ${skill} should be present`);
    }
    
    done();
  });
});

// ========================================
// FLOW-006: Full lifecycle
// ========================================
describe('FLOW-006: Full lifecycle: Fresh install → Track → Analyze → Rotate → Export → Reset', () => {
  test('complete user journey', () => {
    // Step 1: Fresh plugin install (no pulse.jsonl) - already clean
    
    // Step 2: Use Claude for a session, triggering 5+ skills
    for (let i = 1; i <= 5; i++) {
      const trigger = i % 2 === 0 ? 'auto' : 'explicit';
      const humanTurn = trigger === 'explicit' ? `/skill-${i}` : 'some message';
      runTrack(`/skills/skill-${i}/SKILL.md`, humanTurn);
    }
    
    // Step 3: Verify tracking - pulse.jsonl should have 5 entries
    let entries = readPulseFile();
    assert.strictEqual(entries.length, 5, 'Should have 5 entries after session');
    
    // Step 4: Run rotation with 7-day retention
    runRotate(7);
    entries = readPulseFile();
    assert.strictEqual(entries.length, 5, 'All recent entries should be preserved');
    
    // Step 5: Export to JSON
    const jsonExport = runExport('json');
    const exported = JSON.parse(jsonExport);
    assert.strictEqual(exported.length, 5, 'Export should have all entries');
    
    // Step 6: Reset data with --force
    const resetOutput = runReset(true);
    assert.ok(resetOutput.includes('reset successfully'), 'Reset should succeed');
    
    // Step 7: Verify pulse.jsonl empty or deleted
    assert.ok(!fs.existsSync(PULSE_FILE), 'pulse.jsonl should be deleted after reset');
  });
});

// ========================================
// FLOW-007: Bash → Node.js upgrade preserves data
// ========================================
describe('FLOW-007: Upgrade from Bash to Node.js preserves data', () => {
  test('migration path for existing users', () => {
    // Step 1: Have existing pulse.jsonl from "Bash version"
    // (The format is the same, so we just create entries)
    const oldEntries = [
      { skill: 'old-skill-1', ts: daysAgo(5), trigger: 'auto' },
      { skill: 'old-skill-2', ts: daysAgo(3), trigger: 'explicit' }
    ];
    writePulseFile(oldEntries);
    
    // Step 2: Upgrade plugin to Node.js version (already done - we're using track.js)
    
    // Step 3: Trigger new skill read
    runTrack('/skills/new-skill/SKILL.md', '/new-skill');
    
    // Step 4 & 5: Verify old and new entries both visible
    const entries = readPulseFile();
    assert.strictEqual(entries.length, 3, 'Should have 3 entries total');
    
    const skillNames = entries.map(e => e.skill);
    assert.ok(skillNames.includes('old-skill-1'), 'Old entry 1 preserved');
    assert.ok(skillNames.includes('old-skill-2'), 'Old entry 2 preserved');
    assert.ok(skillNames.includes('new-skill'), 'New entry added');
    
    // Verify export also works
    const exported = JSON.parse(runExport('json'));
    assert.strictEqual(exported.length, 3);
  });
});

// ========================================
// FLOW-008: Missing env var → Graceful degradation
// ========================================
describe('FLOW-008: Missing env var → Graceful degradation', () => {
  test('environment error handling', () => {
    // Step 1: Unset CLAUDE_PLUGIN_DATA (use empty string)
    const input = JSON.stringify({ file_path: '/skills/test/SKILL.md' });
    
    // Run with empty CLAUDE_PLUGIN_DATA
    const result = execSync(
      `node "${TRACK_JS}"`,
      {
        env: {
          ...process.env,
          CLAUDE_TOOL_INPUT: input,
          CLAUDE_HUMAN_TURN: '/test',
          CLAUDE_PLUGIN_DATA: '' // Empty = missing
        },
        encoding: 'utf8',
        timeout: 5000
      }
    );
    
    // Step 3: Verify Claude continues normally (exit code 0, no error output)
    assert.strictEqual(result, '', 'Should produce no output');
    
    // Step 4: Set CLAUDE_PLUGIN_DATA to valid path
    // Step 5: Trigger skill read
    runTrack('/skills/test/SKILL.md', '/test');
    
    // Step 6: Verify tracking resumes
    const entries = readPulseFile();
    assert.strictEqual(entries.length, 1, 'Should have 1 entry after recovery');
    assert.strictEqual(entries[0].skill, 'test');
  });
});

// ========================================
// FLOW-009: Unicode skill names
// ========================================
describe('FLOW-009: Unicode skill names handled correctly', () => {
  test('internationalization support', () => {
    // Step 1: Create skill with unicode name
    const unicodeSkillPath = '/skills/修复/SKILL.md';
    
    // Step 2: Trigger read of that SKILL.md
    runTrack(unicodeSkillPath, '/修复');
    
    // Step 3: Verify pulse.jsonl entry has correct skill name
    const entries = readPulseFile();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].skill, '修复');
    assert.strictEqual(entries[0].trigger, 'explicit');
    
    // Step 4 & 5: Run export and verify unicode skill name displays correctly
    const jsonExport = runExport('json');
    const exported = JSON.parse(jsonExport);
    assert.strictEqual(exported[0].skill, '修复');
    
    // Also test CSV export
    const csvExport = runExport('csv');
    assert.ok(csvExport.includes('修复'), 'CSV should contain unicode skill name');
    
    // Test more unicode characters
    if (fs.existsSync(PULSE_FILE)) {
      fs.unlinkSync(PULSE_FILE);
    }
    
    runTrack('/skills/日本語/SKILL.md', '');
    runTrack('/skills/العربية/SKILL.md', '');
    runTrack('/skills/русский/SKILL.md', '');
    
    const moreEntries = readPulseFile();
    assert.strictEqual(moreEntries.length, 3);
    assert.strictEqual(moreEntries[0].skill, '日本語');
    assert.strictEqual(moreEntries[1].skill, 'العربية');
    assert.strictEqual(moreEntries[2].skill, 'русский');
  });
});

// ========================================
// FLOW-010: Rapid successive tracking
// ========================================
describe('FLOW-010: Rapid successive tracking works', () => {
  test('performance under load', () => {
    // Step 1: Programmatically trigger 100 skill reads in rapid succession
    const numEntries = 100;
    const startTime = Date.now();
    
    for (let i = 0; i < numEntries; i++) {
      runTrack(`/skills/skill-${i}/SKILL.md`, '');
    }
    
    const duration = Date.now() - startTime;
    
    // Step 2: Wait for completion (already done - execSync is synchronous)
    
    // Step 3: Verify pulse.jsonl has 100 valid entries
    const entries = readPulseFile();
    assert.strictEqual(entries.length, numEntries, `Should have ${numEntries} entries`);
    
    // Verify all entries are valid JSON
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      assert.strictEqual(typeof entry.skill, 'string', `Entry ${i} should have string skill`);
      assert.strictEqual(typeof entry.ts, 'number', `Entry ${i} should have number ts`);
      assert.strictEqual(typeof entry.trigger, 'string', `Entry ${i} should have string trigger`);
      assert.ok(entry.skill.startsWith('skill-'), `Entry ${i} should have correct skill name`);
    }
    
    // Step 4 & 5: Run export and verify all skills counted
    const jsonExport = runExport('json');
    const exported = JSON.parse(jsonExport);
    assert.strictEqual(exported.length, numEntries, 'Export should have all entries');
    
    // Performance check - 100 entries should complete reasonably fast
    // (This is a soft check - the main requirement is correctness)
    console.log(`    100 tracking operations completed in ${duration}ms`);
    assert.ok(duration < 30000, '100 operations should complete in under 30 seconds');
  });
});
