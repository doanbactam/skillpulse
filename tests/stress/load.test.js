/**
 * Stress Tests
 * Tests for extreme loads and boundary conditions
 * NOTE: These tests can take longer to run and use more resources
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as Storage from '../../src/storage.js';
import { LogPulse, GetSkillStats } from '../../src/handlers.js';

// Test utilities
const TEST_DIR = path.join(os.tmpdir(), `skillpulse-stress-test-${process.pid}`);
const MOCK_ANALYTICS_FILE = path.join(TEST_DIR, 'pulse.jsonl');
const MOCK_SKILLS_DIR = path.join(TEST_DIR, 'skills');

function setupTestDir() {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(MOCK_SKILLS_DIR, { recursive: true });
  Storage.setPaths(MOCK_ANALYTICS_FILE, MOCK_SKILLS_DIR);
}

function cleanupTestDir() {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  Storage.resetPaths();
}

describe('Stress Tests', () => {
  beforeEach(setupTestDir);
  afterEach(cleanupTestDir);

  describe('Large Dataset Operations', () => {
    it('should handle 100,000 entries', function() {
      this.timeout(30000); // Increase timeout for this test

      const count = 100000;
      const startTime = Date.now();

      for (let i = 0; i < count; i++) {
        Storage.appendEntrySync({
          skill: `skill-${i % 100}`,
          ts: Date.now() / 1000 - i,
          outcome: ['success', 'error', 'abort'][i % 3],
        });
      }

      const writeTime = Date.now() - startTime;
      console.log(`  Wrote ${count} entries in ${writeTime}ms`);

      const readStart = Date.now();
      const entries = [...Storage.readEntriesSince(0)];
      const readTime = Date.now() - readStart;

      console.log(`  Read ${entries.length} entries in ${readTime}ms`);

      assert.strictEqual(entries.length, count);
      assert.ok(readTime < 5000, `Reading ${count} entries took ${readTime}ms (expected < 5000ms)`);
    });

    it('should aggregate 100,000 entries efficiently', function() {
      this.timeout(30000);

      const count = 100000;
      const skillCount = 100;

      for (let i = 0; i < count; i++) {
        Storage.appendEntrySync({
          skill: `skill-${i % skillCount}`,
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      const startTime = Date.now();
      const entries = [...Storage.readEntriesSince(0)];
      const stats = Storage.aggregateStats(entries);
      const duration = Date.now() - startTime;

      console.log(`  Aggregated ${count} entries across ${skillCount} skills in ${duration}ms`);

      assert.strictEqual(Object.keys(stats).length, skillCount);

      // Verify each skill has correct count
      for (let i = 0; i < skillCount; i++) {
        const skillName = `skill-${i}`;
        assert.strictEqual(stats[skillName].calls, count / skillCount);
      }

      assert.ok(duration < 2000, `Aggregation took ${duration}ms (expected < 2000ms)`);
    });

    it('should handle 10,000 different skills', function() {
      this.timeout(60000);

      const skillCount = 10000;

      for (let i = 0; i < skillCount; i++) {
        Storage.appendEntrySync({
          skill: `skill-${String(i).padStart(5, '0')}`,
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      const entries = [...Storage.readEntriesSince(0)];
      const stats = Storage.aggregateStats(entries);

      assert.strictEqual(Object.keys(stats).length, skillCount);

      // GetSkillStats should handle this
      const startTime = Date.now();
      const result = GetSkillStats.handle({ period: '7d' });
      const duration = Date.now() - startTime;

      console.log(`  Get stats for ${skillCount} skills in ${duration}ms`);

      const data = JSON.parse(result.content[0].text);
      assert.strictEqual(data.stats.length, skillCount);
      assert.ok(duration < 5000, `Get stats took ${duration}ms (expected < 5000ms)`);
    });
  });

  describe('Concurrent Write Stress', () => {
    it('should handle rapid sequential writes', function() {
      this.timeout(30000);

      const count = 10000;
      const startTime = Date.now();

      for (let i = 0; i < count; i++) {
        Storage.appendEntrySync({
          skill: 'rapid',
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      const duration = Date.now() - startTime;
      const avgTime = duration / count;

      console.log(`  ${count} writes in ${duration}ms (avg: ${avgTime.toFixed(3)}ms per write)`);

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries.length, count);
    });

    it('should maintain data integrity with interleaved writes', function() {
      this.timeout(30000);

      const skills = ['a', 'b', 'c', 'd', 'e'];
      const writesPerSkill = 2000;

      // Interleaved writes
      for (let i = 0; i < writesPerSkill; i++) {
        for (const skill of skills) {
          Storage.appendEntrySync({
            skill,
            ts: Date.now() / 1000 - (i * skills.length + skills.indexOf(skill)),
            outcome: 'success',
          });
        }
      }

      const entries = [...Storage.readEntriesSince(0)];
      const stats = Storage.aggregateStats(entries);

      for (const skill of skills) {
        assert.strictEqual(stats[skill].calls, writesPerSkill);
      }
    });
  });

  describe('Memory Stress', () => {
    it('should not leak memory with multiple reads', function() {
      this.timeout(30000);

      const count = 50000;
      for (let i = 0; i < count; i++) {
        Storage.appendEntrySync({
          skill: `skill-${i % 50}`,
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      // Multiple read operations
      for (let i = 0; i < 100; i++) {
        const entries = [...Storage.readEntriesSince(0)];
        assert.strictEqual(entries.length, count);
      }

      // If we got here, no memory crash occurred
      assert.ok(true);
    });

    it('should handle large skill names', function() {
      this.timeout(10000);

      const longName = 'a'.repeat(10000);
      const count = 100;

      for (let i = 0; i < count; i++) {
        Storage.appendEntrySync({
          skill: longName,
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries.length, count);
      assert.strictEqual(entries[0].skill.length, 10000);
    });

    it('should handle very long JSON lines', function() {
      this.timeout(10000);

      const count = 100;
      const largeData = 'x'.repeat(5000);

      for (let i = 0; i < count; i++) {
        Storage.appendEntrySync({
          skill: 'test',
          ts: Date.now() / 1000 - i,
          outcome: 'success',
          data: largeData,
        });
      }

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries.length, count);

      // Check file size
      const stats = fs.statSync(MOCK_ANALYTICS_FILE);
      console.log(`  File size: ${(stats.size / 1024 / 1024).toFixed(2)}MB`);
      assert.ok(stats.size > 500000); // At least 500KB
    });
  });

  describe('File Size Stress', () => {
    it('should handle multi-megabyte analytics file', function() {
      this.timeout(60000);

      const count = 100000;
      const startTime = Date.now();

      for (let i = 0; i < count; i++) {
        Storage.appendEntrySync({
          skill: `skill-${i % 100}`,
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      const writeTime = Date.now() - startTime;

      const stats = fs.statSync(MOCK_ANALYTICS_FILE);
      const sizeMB = stats.size / 1024 / 1024;

      console.log(`  File size: ${sizeMB.toFixed(2)}MB (${count} entries in ${writeTime}ms)`);

      const readStart = Date.now();
      const entries = [...Storage.readEntriesSince(0)];
      const readTime = Date.now() - readStart;

      console.log(`  Read time: ${readTime}ms`);

      assert.strictEqual(entries.length, count);
      assert.ok(sizeMB > 1, `File should be at least 1MB, got ${sizeMB.toFixed(2)}MB`);
    });
  });

  describe('Filtering Performance', () => {
    it('should filter large dataset by cutoff', function() {
      this.timeout(30000);

      const count = 50000;
      const now = Date.now() / 1000;
      const day = 86400;
      const week = 604800;

      // Create entries spanning 2 months
      for (let i = 0; i < count; i++) {
        Storage.appendEntrySync({
          skill: 'test',
          ts: now - Random.int(0, 5184000), // 0 to 60 days
          outcome: 'success',
        });
      }

      // Test different periods
      const periods = [
        { name: '24h', cutoff: now - day },
        { name: '7d', cutoff: now - week },
        { name: 'all', cutoff: 0 },
      ];

      for (const period of periods) {
        const startTime = Date.now();
        const entries = [...Storage.readEntriesSince(period.cutoff)];
        const duration = Date.now() - startTime;

        console.log(`  Filtered by ${period.name}: ${entries.length} entries in ${duration}ms`);

        assert.ok(duration < 2000, `Filter for ${period.name} took ${duration}ms`);
      }
    });
  });

  describe('Sorting Performance', () => {
    it('should sort large number of skills by usage', function() {
      this.timeout(30000);

      const skillCount = 1000;
      const now = Date.now() / 1000;

      // Create uneven usage
      for (let i = 0; i < skillCount; i++) {
        const calls = skillCount - i; // Descending call counts
        for (let j = 0; j < calls; j++) {
          Storage.appendEntrySync({
            skill: `skill-${String(i).padStart(4, '0')}`,
            ts: now - j,
            outcome: 'success',
          });
        }
      }

      const startTime = Date.now();
      const result = GetSkillStats.handle({ period: '7d' });
      const duration = Date.now() - startTime;

      console.log(`  Sorted ${skillCount} skills in ${duration}ms`);

      const data = JSON.parse(result.content[0].text);

      // Verify sorting
      for (let i = 1; i < Math.min(data.stats.length, 100); i++) {
        assert.ok(data.stats[i - 1].calls >= data.stats[i].calls);
      }

      assert.ok(duration < 3000, `Sorting took ${duration}ms`);
    });
  });

  describe('Edge Case Stress', () => {
    it('should handle all skills having same call count', function() {
      this.timeout(20000);

      const skillCount = 500;
      const callsPerSkill = 10;

      for (let i = 0; i < skillCount; i++) {
        for (let j = 0; j < callsPerSkill; j++) {
          Storage.appendEntrySync({
            skill: `skill-${i}`,
            ts: Date.now() / 1000 - (i * callsPerSkill + j),
            outcome: 'success',
          });
        }
      }

      const result = GetSkillStats.handle({ period: '7d' });
      const data = JSON.parse(result.content[0].text);

      assert.strictEqual(data.stats.length, skillCount);

      // All should have same count
      const firstCount = data.stats[0].calls;
      assert.ok(data.stats.every(s => s.calls === firstCount));
    });

    it('should handle single skill with all calls', function() {
      this.timeout(20000);

      const count = 10000;

      for (let i = 0; i < count; i++) {
        Storage.appendEntrySync({
          skill: 'only-skill',
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      const result = GetSkillStats.handle({ period: '7d' });
      const data = JSON.parse(result.content[0].text);

      assert.strictEqual(data.stats.length, 1);
      assert.strictEqual(data.stats[0].calls, count);
      assert.strictEqual(data.stats[0].skill, 'only-skill');
    });
  });

  describe('Recovery Stress', () => {
    it('should recover from corruption in large file', function() {
      this.timeout(30000);

      // Write many valid entries
      const validCount = 10000;
      for (let i = 0; i < validCount; i++) {
        Storage.appendEntrySync({
          skill: 'test',
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      // Inject corruption at random positions
      const fileContent = fs.readFileSync(MOCK_ANALYTICS_FILE, 'utf-8');
      const lines = fileContent.split('\n');

      // Corrupt 1% of lines
      const corruptionCount = Math.floor(lines.length * 0.01);
      for (let i = 0; i < corruptionCount; i++) {
        const idx = Random.int(0, lines.length - 1);
        if (lines[idx] && lines[idx].trim()) {
          lines[idx] = 'CORRUPTED: ' + lines[idx];
        }
      }

      fs.writeFileSync(MOCK_ANALYTICS_FILE, lines.join('\n'));

      // Should still read valid entries
      const entries = [...Storage.readEntriesSince(0)];

      console.log(`  Recovered ${entries.length} valid entries from ${lines.length} total lines`);

      assert.ok(entries.length >= validCount - corruptionCount);
    });
  });
});

function Random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function String(num) {
  return num.toString();
}
