/**
 * Property-Based Tests
 * Tests that verify invariants and properties hold true across random inputs
 * Similar to QuickCheck in Haskell or fast-check in JavaScript
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as Storage from '../../src/storage.js';
import { getPeriod, Today, Week, Month, AllTime } from '../../src/periods.js';
import { LogPulse, GetSkillStats } from '../../src/handlers.js';

// Test utilities
const TEST_DIR = path.join(os.tmpdir(), `skillpulse-property-test-${process.pid}`);
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

// Random generators
const Random = {
  // Generate random integer between min and max (inclusive)
  int(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  // Generate random array of specified length
  array(length, generator) {
    return Array.from({ length }, () => generator());
  },

  // Generate random skill name
  skillName() {
    const prefixes = ['test', 'demo', 'sample', 'mock', 'fake'];
    const suffixes = ['skill', 'tool', 'plugin', 'extension', 'helper'];
    const prefix = prefixes[this.int(0, prefixes.length - 1)];
    const suffix = suffixes[this.int(0, suffixes.length - 1)];
    return `${prefix}-${suffix}-${this.int(1, 999)}`;
  },

  // Generate random timestamp
  timestamp(options = {}) {
    const { min = 0, max = Date.now() / 1000 } = options;
    return this.int(min, max);
  },

  // Generate random outcome
  outcome() {
    const outcomes = ['success', 'error', 'abort'];
    return outcomes[this.int(0, outcomes.length - 1)];
  },

  // Generate random analytics entry
  entry(options = {}) {
    return {
      skill: options.skill ?? this.skillName(),
      ts: options.ts ?? this.timestamp(),
      outcome: options.outcome ?? this.outcome(),
      pid: options.pid ?? process.pid,
    };
  },

  // Generate random string
  string(options = {}) {
    const { length = 10, charset = 'abcdefghijklmnopqrstuvwxyz' } = options;
    let result = '';
    for (let i = 0; i < length; i++) {
      result += charset[this.int(0, charset.length - 1)];
    }
    return result;
  },

  // Random item from array
  oneOf(array) {
    return array[this.int(0, array.length - 1)];
  },

  // Random subset of array
  subset(array, minSize = 0) {
    const size = this.int(minSize, array.length);
    const shuffled = [...array].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, size);
  },
};

describe('Property-Based Tests', () => {
  beforeEach(setupTestDir);
  afterEach(cleanupTestDir);

  describe('Storage Properties', () => {
    it('should preserve all entries written', () => {
      const count = Random.int(10, 100);
      const entries = Random.array(count, () => Random.entry());

      for (const entry of entries) {
        Storage.appendEntrySync(entry);
      }

      const readEntries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(readEntries.length, count);
    });

    it('should maintain entry order when reading', () => {
      const count = Random.int(10, 50);
      const entries = Random.array(count, () => Random.entry());

      for (const entry of entries) {
        Storage.appendEntrySync(entry);
      }

      const readEntries = [...Storage.readEntriesSince(0)];

      // Verify order is preserved
      for (let i = 0; i < count; i++) {
        assert.strictEqual(readEntries[i].skill, entries[i].skill);
        assert.strictEqual(readEntries[i].ts, entries[i].ts);
      }
    });

    it('should count all calls correctly', () => {
      const skillCount = Random.int(5, 20);
      const skills = Random.array(skillCount, () => Random.skillName());

      // Add random number of calls for each skill
      const expectedCounts = {};
      for (const skill of skills) {
        const calls = Random.int(1, 50);
        expectedCounts[skill] = calls;

        for (let i = 0; i < calls; i++) {
          Storage.appendEntrySync({
            skill,
            ts: Date.now() / 1000 - i,
            outcome: Random.outcome(),
          });
        }
      }

      const entries = [...Storage.readEntriesSince(0)];
      const stats = Storage.aggregateStats(entries);

      // Verify counts match
      for (const skill of skills) {
        assert.strictEqual(stats[skill]?.calls, expectedCounts[skill]);
      }
    });

    it('should handle empty skills gracefully', () => {
      const count = Random.int(10, 50);
      const validSkill = 'valid-skill';

      // Mix valid and empty skill names
      for (let i = 0; i < count; i++) {
        Storage.appendEntrySync({
          skill: Math.random() > 0.5 ? validSkill : '',
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      const entries = [...Storage.readEntriesSince(0)];
      const stats = Storage.aggregateStats(entries);

      // Should have stats for both valid and empty skill
      assert.ok(stats[validSkill]);
      assert.ok(stats[''] || stats.undefined);
    });
  });

  describe('Period Properties', () => {
    it('should have cutoff in correct order', () => {
      const now = Random.timestamp();

      const todayCutoff = Today.cutoff(now);
      const weekCutoff = Week.cutoff(now);
      const monthCutoff = Month.cutoff(now);
      const allCutoff = AllTime.cutoff(now);

      // Periods should be ordered: all < month < week < today
      assert.strictEqual(allCutoff, 0);
      assert.ok(monthCutoff < weekCutoff);
      assert.ok(weekCutoff < todayCutoff);
      assert.ok(todayCutoff <= now);
    });

    it('should include all entries when period is all', () => {
      const count = Random.int(20, 100);
      const now = Date.now() / 1000;

      // Create entries spanning long time range
      for (let i = 0; i < count; i++) {
        Storage.appendEntrySync({
          skill: Random.skillName(),
          ts: now - Random.int(1000, 10000000), // Wide range
          outcome: 'success',
        });
      }

      const entries = [...Storage.readEntriesSince(AllTime.cutoff(now))];

      assert.strictEqual(entries.length, count);
    });

    it('should filter entries by cutoff correctly', () => {
      const now = Date.now() / 1000;
      const day = 86400;

      // Create entries at different time points
      const timePoints = [
        { ts: now - 1000, expected: true },      // Recent
        { ts: now - day - 1000, expected: false }, // Old
        { ts: now - day / 2, expected: true },    // Within 24h
        { ts: now - day * 2, expected: false },   // Outside 24h
      ];

      for (const point of timePoints) {
        Storage.appendEntrySync({
          skill: 'test',
          ts: point.ts,
          outcome: 'success',
        });
      }

      const entries = [...Storage.readEntriesSince(Today.cutoff(now))];
      const includedTs = entries.map(e => e.ts);

      for (const point of timePoints) {
        if (point.expected) {
          assert.ok(includedTs.includes(point.ts), `Should include ts=${point.ts}`);
        } else {
          assert.ok(!includedTs.includes(point.ts), `Should exclude ts=${point.ts}`);
        }
      }
    });
  });

  describe('Aggregation Properties', () => {
    it('should sum calls correctly', () => {
      const skillCount = Random.int(3, 10);
      const skills = Random.array(skillCount, () => Random.skillName());

      let totalCalls = 0;
      for (const skill of skills) {
        const calls = Random.int(1, 20);
        totalCalls += calls;

        for (let i = 0; i < calls; i++) {
          Storage.appendEntrySync({
            skill,
            ts: Date.now() / 1000 - i,
            outcome: 'success',
          });
        }
      }

      const entries = [...Storage.readEntriesSince(0)];
      const stats = Storage.aggregateStats(entries);

      const sumCalls = Object.values(stats).reduce((sum, s) => sum + s.calls, 0);
      assert.strictEqual(sumCalls, totalCalls);
    });

    it('should have stats.calls >= stats.success + stats.error + stats.abort', () => {
      const count = Random.int(50, 200);
      const outcomes = ['success', 'error', 'abort', 'unknown'];

      for (let i = 0; i < count; i++) {
        Storage.appendEntrySync({
          skill: Random.skillName(),
          ts: Date.now() / 1000 - i,
          outcome: Random.oneOf(outcomes),
        });
      }

      const entries = [...Storage.readEntriesSince(0)];
      const stats = Storage.aggregateStats(entries);

      for (const skillStats of Object.values(stats)) {
        const knownOutcomes = (skillStats.success || 0) +
                             (skillStats.error || 0) +
                             (skillStats.abort || 0);
        assert.ok(skillStats.calls >= knownOutcomes);
      }
    });

    it('should sort stats by calls descending', () => {
      const skillCount = Random.int(5, 15);
      const skills = Random.array(skillCount, () => Random.skillName());

      for (const skill of skills) {
        const calls = Random.int(1, 50);
        for (let i = 0; i < calls; i++) {
          Storage.appendEntrySync({
            skill,
            ts: Date.now() / 1000 - i,
            outcome: 'success',
          });
        }
      }

      const result = GetSkillStats.handle({ period: '7d' });
      const data = JSON.parse(result.content[0].text);

      // Verify descending order
      for (let i = 1; i < data.stats.length; i++) {
        assert.ok(data.stats[i - 1].calls >= data.stats[i].calls);
      }
    });

    it('should handle duplicate skill names correctly', () => {
      const skill = Random.skillName();
      const count = Random.int(10, 100);

      for (let i = 0; i < count; i++) {
        Storage.appendEntrySync({
          skill,
          ts: Date.now() / 1000 - i,
          outcome: Random.outcome(),
        });
      }

      const entries = [...Storage.readEntriesSince(0)];
      const stats = Storage.aggregateStats(entries);

      // Should have single entry for the skill
      assert.ok(stats[skill]);
      assert.strictEqual(stats[skill].calls, count);
    });
  });

  describe('Handler Properties', () => {
    it('should always return content array from handlers', async () => {
      const handlers = [
        () => await LogPulse.handle({ skill: Random.skillName() }),
        () => GetSkillStats.handle({ period: Random.oneOf(['24h', '7d', '30d', 'all']) }),
      ];

      for (const handler of handlers) {
        const result = handler();
        assert.ok(Array.isArray(result.content));
        assert.ok(result.content.length > 0);
        assert.strictEqual(result.content[0].type, 'text');
      }
    });

    it('should include skill name in log_pulse response', async () => {
      const skillNames = Random.array(10, () => Random.skillName());

      for (const skill of skillNames) {
        const result = LogPulse.handle({ skill });
        const text = result.content[0].text;

        assert.ok(text.includes(skill) || text.includes('Logged'));
      }
    });

    it('should include period in get_skill_stats response', () => {
      const periods = ['24h', '7d', '30d', 'all'];

      for (const period of periods) {
        const result = GetSkillStats.handle({ period });
        const data = JSON.parse(result.content[0].text);

        assert.strictEqual(data.period, period);
      }
    });
  });

  describe('Round-Trip Properties', () => {
    it('should preserve data through write-read cycle', () => {
      const original = Random.array(Random.int(10, 50), () => Random.entry());

      for (const entry of original) {
        Storage.appendEntrySync(entry);
      }

      const readEntries = [...Storage.readEntriesSince(0)];

      assert.strictEqual(readEntries.length, original.length);

      for (let i = 0; i < original.length; i++) {
        assert.strictEqual(readEntries[i].skill, original[i].skill);
        assert.strictEqual(readEntries[i].ts, original[i].ts);
        assert.strictEqual(readEntries[i].outcome, original[i].outcome);
      }
    });

    it('should preserve data through aggregate-stats cycle', () => {
      const entries = Random.array(Random.int(20, 100), () =>
        Random.entry({ skill: Random.oneOf(['a', 'b', 'c', 'd', 'e']) })
      );

      for (const entry of entries) {
        Storage.appendEntrySync(entry);
      }

      const readEntries = [...Storage.readEntriesSince(0)];
      const stats = Storage.aggregateStats(readEntries);

      // Reconstruct calls from stats
      let totalFromStats = 0;
      for (const skillStats of Object.values(stats)) {
        totalFromStats += skillStats.calls;
      }

      assert.strictEqual(totalFromStats, entries.length);
    });
  });

  describe('Idempotence Properties', () => {
    it('should return same stats for multiple reads', () => {
      const count = Random.int(10, 50);
      for (let i = 0; i < count; i++) {
        Storage.appendEntrySync(Random.entry());
      }

      const stats1 = Storage.aggregateStats([...Storage.readEntriesSince(0)]);
      const stats2 = Storage.aggregateStats([...Storage.readEntriesSince(0)]);

      assert.deepStrictEqual(stats1, stats2);
    });

    it('should handle multiple ensureStorage calls', () => {
      Storage.ensureStorage();
      Storage.ensureStorage();
      Storage.ensureStorage();

      assert.ok(fs.existsSync(path.dirname(MOCK_ANALYTICS_FILE)));
    });
  });

  describe('Commutativity Properties', () => {
    it('should produce same stats regardless of entry order', () => {
      const entries = Random.array(20, () => Random.entry());

      // Write in original order
      for (const entry of entries) {
        Storage.appendEntrySync(entry);
      }
      const stats1 = Storage.aggregateStats([...Storage.readEntriesSince(0)]);

      // Clear and write in reverse order
      fs.writeFileSync(MOCK_ANALYTICS_FILE, '');
      for (const entry of [...entries].reverse()) {
        Storage.appendEntrySync(entry);
      }
      const stats2 = Storage.aggregateStats([...Storage.readEntriesSince(0)]);

      // Stats should be identical (aggregation is order-independent)
      const keys1 = Object.keys(stats1).sort();
      const keys2 = Object.keys(stats2).sort();

      assert.deepStrictEqual(keys1, keys2);
      for (const key of keys1) {
        assert.strictEqual(stats1[key].calls, stats2[key].calls);
      }
    });
  });

  describe('Monoid Properties', () => {
    it('should aggregate empty entries to empty stats', () => {
      const stats = Storage.aggregateStats([]);
      assert.deepStrictEqual(stats, {});
    });

    it('should be associative: aggregate(a + b) == aggregate(a) + aggregate(b)', () => {
      const entriesA = Random.array(10, () => Random.entry({ skill: 'a' }));
      const entriesB = Random.array(10, () => Random.entry({ skill: 'b' }));

      const statsAB = Storage.aggregateStats([...entriesA, ...entriesB]);
      const statsA = Storage.aggregateStats(entriesA);
      const statsB = Storage.aggregateStats(entriesB);

      // Merge stats manually
      const merged = { ...statsA };
      for (const [key, value] of Object.entries(statsB)) {
        if (!merged[key]) {
          merged[key] = { calls: 0, success: 0, error: 0, abort: 0 };
        }
        merged[key].calls += value.calls;
        merged[key].success += value.success || 0;
        merged[key].error += value.error || 0;
        merged[key].abort += value.abort || 0;
      }

      assert.strictEqual(statsAB.a.calls, merged.a.calls);
      assert.strictEqual(statsAB.b.calls, merged.b.calls);
    });
  });

  describe('Boundary Properties', () => {
    it('should handle cutoff at exactly entry timestamp', () => {
      const now = Date.now() / 1000;
      const exactEntry = { skill: 'exact', ts: now, outcome: 'success' };
      Storage.appendEntrySync(exactEntry);

      const entries = [...Storage.readEntriesSince(now)];
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].skill, 'exact');
    });

    it('should handle cutoff just before entry timestamp', () => {
      const now = Date.now() / 1000;
      const entry = { skill: 'after', ts: now + 1, outcome: 'success' };
      Storage.appendEntrySync(entry);

      const entries = [...Storage.readEntriesSince(now)];
      assert.strictEqual(entries.length, 1);
    });

    it('should handle cutoff just after entry timestamp', () => {
      const now = Date.now() / 1000;
      const entry = { skill: 'before', ts: now - 1, outcome: 'success' };
      Storage.appendEntrySync(entry);

      const entries = [...Storage.readEntriesSince(now)];
      assert.strictEqual(entries.length, 0);
    });
  });
});

/**
 * Fuzz Testing - Random Input Generation
 */
describe('Fuzz Tests', () => {
  beforeEach(setupTestDir);
  afterEach(cleanupTestDir);

  it('should handle random skill names', () => {
    const count = 100;

    for (let i = 0; i < count; i++) {
      const skillName = Random.string({
        length: Random.int(1, 50),
        charset: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_/@.:',
      });

      Storage.appendEntrySync({
        skill: skillName,
        ts: Date.now() / 1000 - i,
        outcome: 'success',
      });
    }

    const entries = [...Storage.readEntriesSince(0)];
    assert.strictEqual(entries.length, count);
  });

  it('should handle random timestamp ranges', () => {
    const count = 50;

    for (let i = 0; i < count; i++) {
      Storage.appendEntrySync({
        skill: 'test',
        ts: Random.int(-1000000000, Date.now() / 1000 + 1000000),
        outcome: 'success',
      });
    }

    // Should not crash
    const entries = [...Storage.readEntriesSince(0)];
    assert.strictEqual(entries.length, count);
  });

  it('should handle random outcome values', () => {
    const count = 100;

    for (let i = 0; i < count; i++) {
      Storage.appendEntrySync({
        skill: 'test',
        ts: Date.now() / 1000 - i,
        outcome: Random.int(0, 1) ? 'success' : 'error',
      });
    }

    const entries = [...Storage.readEntriesSince(0)];
    const stats = Storage.aggregateStats(entries);

    assert.ok(stats.test.calls >= stats.test.success + stats.test.error);
  });
});
