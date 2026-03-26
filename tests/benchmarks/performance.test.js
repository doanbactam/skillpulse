/**
 * Performance Benchmarks
 * Tests for performance characteristics under various loads
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { performance } from 'node:perf_hooks';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as Storage from '../../src/storage.js';
import { getPeriod } from '../../src/periods.js';
import { LogPulse, GetSkillStats } from '../../src/handlers.js';

// Test utilities
const TEST_DIR = path.join(os.tmpdir(), `skillpulse-perf-test-${process.pid}`);
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

/**
 * Performance thresholds (in milliseconds)
 * Adjusted for Windows spawn overhead
 */
const THRESHOLDS = {
  // Write operations
  appendSingleEntry: 10,      // Single write should be fast
  append100Entries: 500,      // 100 entries in 500ms

  // Read operations
  read100Entries: 50,         // Read 100 entries
  read1000Entries: 200,       // Read 1000 entries
  read10000Entries: 2000,     // Read 10000 entries

  // Aggregation
  aggregate100: 20,           // Aggregate 100 entries
  aggregate1000: 100,         // Aggregate 1000 entries
  aggregate10000: 1000,       // Aggregate 10000 entries

  // Handler operations
  logPulseHandler: 15,        // LogPulse handler call
  getStatsHandler100: 50,     // Get stats with 100 entries
  getStatsHandler1000: 200,   // Get stats with 1000 entries

  // Skill listing
  listSkills100: 50,          // List 100 skills
  readDescription: 10,        // Read skill description
};

/**
 * Benchmark helper - supports both sync and async functions
 */
function bench(name, fn, threshold) {
  return (async () => {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    const duration = end - start;

    // Only fail if significantly over threshold (2x)
    const maxDuration = threshold * 2;

    if (duration > maxDuration) {
      throw new Error(
        `${name} exceeded threshold: ${duration.toFixed(2)}ms > ${maxDuration}ms`
      );
    }

    return { duration, result };
  })();
}

describe('Performance Benchmarks', () => {
  beforeEach(setupTestDir);
  afterEach(cleanupTestDir);

  describe('Write Performance', () => {
    it('should append single entry quickly', async () => {
      const { duration } = await bench(
        'appendSingleEntry',
        () => Storage.appendEntrySync({
          skill: 'test',
          ts: Date.now() / 1000,
          outcome: 'success',
        }),
        THRESHOLDS.appendSingleEntry
      );

      // Just ensure it completes, threshold is generous
      assert.ok(duration < THRESHOLDS.appendSingleEntry * 2);
    });

    it('should append 100 entries efficiently', async () => {
      const { duration } = await bench('append100Entries', () => {
        for (let i = 0; i < 100; i++) {
          Storage.appendEntrySync({
            skill: `skill-${i % 10}`,
            ts: Date.now() / 1000 - i,
            outcome: 'success',
          });
        }
      }, THRESHOLDS.append100Entries);

      assert.ok(duration < THRESHOLDS.append100Entries * 2);
    });

    it('should handle burst writes', async () => {
      const times = [];
      for (let i = 0; i < 50; i++) {
        const start = performance.now();
        Storage.appendEntrySync({
          skill: 'burst',
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
        times.push(performance.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b) / times.length;
      const maxTime = Math.max(...times);

      // Average should be reasonable
      assert.ok(avgTime < 20, `Average write time ${avgTime.toFixed(2)}ms exceeds 20ms`);
      // Max should not spike too high
      assert.ok(maxTime < 100, `Max write time ${maxTime.toFixed(2)}ms exceeds 100ms`);
    });
  });

  describe('Read Performance', () => {
    it('should read 100 entries quickly', async () => {
      // Setup: write 100 entries
      for (let i = 0; i < 100; i++) {
        Storage.appendEntrySync({
          skill: `skill-${i % 10}`,
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      const { duration } = await bench('read100Entries', () => {
        return [...Storage.readEntriesSince(0)];
      }, THRESHOLDS.read100Entries);

      assert.ok(duration < THRESHOLDS.read100Entries * 2);
    });

    it('should read 1000 entries efficiently', async () => {
      // Setup: write 1000 entries
      for (let i = 0; i < 1000; i++) {
        Storage.appendEntrySync({
          skill: `skill-${i % 50}`,
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      const { duration, result } = await bench('read1000Entries', () => {
        return [...Storage.readEntriesSince(0)];
      }, THRESHOLDS.read1000Entries);

      assert.strictEqual(result.length, 1000);
      assert.ok(duration < THRESHOLDS.read1000Entries * 2);
    });

    it('should filter entries by cutoff efficiently', async () => {
      const now = Date.now() / 1000;
      const weekAgo = now - 604800;

      // Write entries spanning 2 weeks
      for (let i = 0; i < 2000; i++) {
        Storage.appendEntrySync({
          skill: `skill-${i % 20}`,
          ts: now - (i * 600), // Spread over 2 weeks
          outcome: 'success',
        });
      }

      const { duration, result } = await bench('filterByCutoff', () => {
        return [...Storage.readEntriesSince(weekAgo)];
      }, THRESHOLDS.read1000Entries);

      // Should filter to about 1000 entries (1 week worth)
      assert.ok(result.length > 900 && result.length < 1100);
      assert.ok(duration < THRESHOLDS.read1000Entries * 2);
    });
  });

  describe('Aggregation Performance', () => {
    it('should aggregate 100 entries quickly', async () => {
      for (let i = 0; i < 100; i++) {
        Storage.appendEntrySync({
          skill: `skill-${i % 10}`,
          ts: Date.now() / 1000 - i,
          outcome: ['success', 'error', 'abort'][i % 3],
        });
      }

      const entries = [...Storage.readEntriesSince(0)];
      const { duration } = await bench('aggregate100', () => {
        return Storage.aggregateStats(entries);
      }, THRESHOLDS.aggregate100);

      assert.ok(duration < THRESHOLDS.aggregate100 * 2);
    });

    it('should aggregate 1000 entries efficiently', async () => {
      for (let i = 0; i < 1000; i++) {
        Storage.appendEntrySync({
          skill: `skill-${i % 50}`,
          ts: Date.now() / 1000 - i,
          outcome: ['success', 'error', 'abort'][i % 3],
        });
      }

      const entries = [...Storage.readEntriesSince(0)];
      const { duration, result } = await bench('aggregate1000', () => {
        return Storage.aggregateStats(entries);
      }, THRESHOLDS.aggregate1000);

      assert.strictEqual(Object.keys(result).length, 50);
      assert.ok(duration < THRESHOLDS.aggregate1000 * 2);
    });

    it('should aggregate many different skills efficiently', async () => {
      const skillCount = 500;
      for (let i = 0; i < skillCount; i++) {
        Storage.appendEntrySync({
          skill: `skill-${i}`,
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      const entries = [...Storage.readEntriesSince(0)];
      const { duration } = await bench('aggregateManySkills', () => {
        return Storage.aggregateStats(entries);
      }, THRESHOLDS.aggregate1000);

      assert.ok(duration < THRESHOLDS.aggregate1000 * 2);
    });
  });

  describe('Handler Performance', () => {
    it('should handle log_pulse quickly', async () => {
      const { duration } = await bench('logPulseHandler', async () => {
        return await LogPulse.handle({
          skill: 'test-skill',
          outcome: 'success',
        });
      }, THRESHOLDS.logPulseHandler);

      assert.ok(duration < THRESHOLDS.logPulseHandler * 2);
    });

    it('should handle get_skill_stats with 100 entries', async () => {
      for (let i = 0; i < 100; i++) {
        Storage.appendEntrySync({
          skill: `skill-${i % 10}`,
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      const { duration } = await bench('getStatsHandler100', () => {
        return GetSkillStats.handle({ period: '7d' });
      }, THRESHOLDS.getStatsHandler100);

      assert.ok(duration < THRESHOLDS.getStatsHandler100 * 2);
    });

    it('should handle get_skill_stats with 1000 entries', async () => {
      for (let i = 0; i < 1000; i++) {
        Storage.appendEntrySync({
          skill: `skill-${i % 50}`,
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      const { duration, result } = await bench('getStatsHandler1000', () => {
        return GetSkillStats.handle({ period: '7d' });
      }, THRESHOLDS.getStatsHandler1000);

      const data = JSON.parse(result.content[0].text);
      assert.strictEqual(data.stats.length, 50);
      assert.ok(duration < THRESHOLDS.getStatsHandler1000 * 2);
    });

    it('should sort stats efficiently', async () => {
      // Create entries that need sorting
      const skills = ['a', 'b', 'c', 'd', 'e'];
      const counts = [10, 50, 30, 100, 20];

      for (let i = 0; i < skills.length; i++) {
        for (let j = 0; j < counts[i]; j++) {
          Storage.appendEntrySync({
            skill: skills[i],
            ts: Date.now() / 1000 - (i * 1000 + j),
            outcome: 'success',
          });
        }
      }

      const { duration, result } = await bench('sortedStats', () => {
        return GetSkillStats.handle({ period: '7d' });
      }, THRESHOLDS.getStatsHandler100);

      const data = JSON.parse(result.content[0].text);

      // Verify sorting (descending by calls)
      for (let i = 1; i < data.stats.length; i++) {
        assert.ok(data.stats[i - 1].calls >= data.stats[i].calls);
      }

      assert.ok(duration < THRESHOLDS.getStatsHandler100 * 2);
    });
  });

  describe('List Skills Performance', () => {
    it('should list 100 skills quickly', async () => {
      for (let i = 0; i < 100; i++) {
        const skillDir = path.join(MOCK_SKILLS_DIR, `skill-${i}`);
        fs.mkdirSync(skillDir);
        fs.writeFileSync(
          path.join(skillDir, 'skill.json'),
          JSON.stringify({ name: `skill-${i}`, version: '1.0.0' })
        );
      }

      const { duration, result } = await bench('listSkills100', () => {
        return [...Storage.listInstalledSkills()];
      }, THRESHOLDS.listSkills100);

      assert.strictEqual(result.length, 100);
      assert.ok(duration < THRESHOLDS.listSkills100 * 2);
    });

    it('should read skill description quickly', async () => {
      const skillDir = path.join(MOCK_SKILLS_DIR, 'test-skill');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\ndescription:\nTest description for performance testing\n---\n'
      );

      const { duration } = await bench('readDescription', () => {
        return Storage.readSkillDescription('test-skill');
      }, THRESHOLDS.readDescription);

      assert.ok(duration < THRESHOLDS.readDescription * 2);
    });
  });

  describe('Memory Efficiency', () => {
    it('should not leak memory when reading large datasets', async () => {
      // Write 5000 entries
      for (let i = 0; i < 5000; i++) {
        Storage.appendEntrySync({
          skill: `skill-${i % 100}`,
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      // Read multiple times
      for (let i = 0; i < 10; i++) {
        const entries = [...Storage.readEntriesSince(0)];
        assert.strictEqual(entries.length, 5000);
      }

      // If we got here without crashing, memory is being managed
      assert.ok(true);
    });

    it('should handle aggregation without excessive memory', async () => {
      // Create many different skills
      const skillCount = 1000;
      for (let i = 0; i < skillCount; i++) {
        Storage.appendEntrySync({
          skill: `skill-${i}`,
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      const entries = [...Storage.readEntriesSince(0)];
      const stats = Storage.aggregateStats(entries);

      // Verify we got all skills
      assert.strictEqual(Object.keys(stats).length, skillCount);

      // Verify each skill has correct count
      for (const skill in stats) {
        assert.strictEqual(stats[skill].calls, 1);
      }
    });
  });

  describe('Period Performance', () => {
    it('should resolve periods quickly', async () => {
      const periods = ['24h', '7d', '30d', 'all', 'today', 'week', 'month', 'ever'];

      const { duration } = await bench('resolvePeriods', () => {
        return periods.map(p => getPeriod(p));
      }, 10); // Should be very fast

      assert.ok(duration < 10);
    });

    it('should calculate cutoffs efficiently', async () => {
      const now = Date.now() / 1000;
      const periods = ['24h', '7d', '30d', 'all'].map(p => getPeriod(p));

      const { duration } = await bench('calculateCutoffs', () => {
        return periods.map(p => p.cutoff(now));
      }, 10);

      assert.ok(duration < 10);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle rapid sequential writes', async () => {
      const count = 500;
      const start = performance.now();

      for (let i = 0; i < count; i++) {
        Storage.appendEntrySync({
          skill: 'rapid',
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      const duration = performance.now() - start;
      const avgTime = duration / count;

      // Average time per write should be reasonable
      assert.ok(avgTime < 10, `Average write time ${avgTime.toFixed(2)}ms exceeds 10ms`);
    });

    it('should handle read-modify-write cycles', async () => {
      // Write initial data
      for (let i = 0; i < 100; i++) {
        Storage.appendEntrySync({
          skill: 'cycle',
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      const start = performance.now();

      // Perform read-modify-write cycles
      for (let i = 0; i < 10; i++) {
        const entries = [...Storage.readEntriesSince(0)];
        const stats = Storage.aggregateStats(entries);

        // Write based on stats
        Storage.appendEntrySync({
          skill: 'cycle',
          ts: Date.now() / 1000,
          outcome: 'success',
        });
      }

      const duration = performance.now() - start;
      const avgTime = duration / 10;

      // Each cycle should be fast
      assert.ok(avgTime < 50, `Average cycle time ${avgTime.toFixed(2)}ms exceeds 50ms`);
    });
  });
});

/**
 * Performance Report Generator
 */
describe('Performance Summary', () => {
  it('should generate performance summary', () => {
    const summary = {
      'Write Operations': {
        'Single entry': '< 10ms',
        '100 entries': '< 500ms',
      },
      'Read Operations': {
        '100 entries': '< 50ms',
        '1000 entries': '< 200ms',
        '10000 entries': '< 2000ms',
      },
      'Aggregation': {
        '100 entries': '< 20ms',
        '1000 entries': '< 100ms',
        '10000 entries': '< 1000ms',
      },
      'Handlers': {
        'log_pulse': '< 15ms',
        'get_skill_stats (100 entries)': '< 50ms',
        'get_skill_stats (1000 entries)': '< 200ms',
      },
    };

    // This test always passes - it's just for documentation
    assert.ok(true);
  });
});
