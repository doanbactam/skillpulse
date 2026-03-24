/**
 * Unit Tests for Period Variants
 * Tests for time period filtering and cutoff calculations
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { Today, Week, Month, AllTime, Periods, getPeriod } from '../../src/periods.js';

describe('Period Variants', () => {
  describe('Today (24h)', () => {
    it('should have correct name', () => {
      assert.strictEqual(Today.name, '24h');
    });

    it('should have correct label', () => {
      assert.strictEqual(Today.label, 'today');
    });

    it('should calculate cutoff as 24 hours ago', () => {
      const now = 1_000_000_000; // Fixed timestamp
      const expected = now - 86_400; // 24 * 60 * 60

      assert.strictEqual(Today.cutoff(now), expected);
    });

    it('should handle edge case at midnight', () => {
      const now = 1_723_456_789; // Arbitrary timestamp
      const cutoff = Today.cutoff(now);

      assert.strictEqual(cutoff, now - 86_400);
    });
  });

  describe('Week (7d)', () => {
    it('should have correct name', () => {
      assert.strictEqual(Week.name, '7d');
    });

    it('should have correct label', () => {
      assert.strictEqual(Week.label, '7 days');
    });

    it('should calculate cutoff as 7 days ago', () => {
      const now = 1_000_000_000;
      const expected = now - 604_800; // 7 * 24 * 60 * 60

      assert.strictEqual(Week.cutoff(now), expected);
    });
  });

  describe('Month (30d)', () => {
    it('should have correct name', () => {
      assert.strictEqual(Month.name, '30d');
    });

    it('should have correct label', () => {
      assert.strictEqual(Month.label, '30 days');
    });

    it('should calculate cutoff as 30 days ago', () => {
      const now = 1_000_000_000;
      const expected = now - 2_592_000; // 30 * 24 * 60 * 60

      assert.strictEqual(Month.cutoff(now), expected);
    });
  });

  describe('AllTime', () => {
    it('should have correct name', () => {
      assert.strictEqual(AllTime.name, 'all');
    });

    it('should have correct label', () => {
      assert.strictEqual(AllTime.label, 'all time');
    });

    it('should always return 0 as cutoff', () => {
      assert.strictEqual(AllTime.cutoff(100), 0);
      assert.strictEqual(AllTime.cutoff(1_000_000_000), 0);
      assert.strictEqual(AllTime.cutoff(0), 0);
    });
  });

  describe('Period Registry', () => {
    it('should map 24h to Today', () => {
      assert.strictEqual(Periods['24h'], Today);
    });

    it('should map 7d to Week', () => {
      assert.strictEqual(Periods['7d'], Week);
    });

    it('should map 30d to Month', () => {
      assert.strictEqual(Periods['30d'], Month);
    });

    it('should map all to AllTime', () => {
      assert.strictEqual(Periods.all, AllTime);
    });

    describe('Aliases', () => {
      it('should map today to Today', () => {
        assert.strictEqual(Periods.today, Today);
      });

      it('should map week to Week', () => {
        assert.strictEqual(Periods.week, Week);
      });

      it('should map month to Month', () => {
        assert.strictEqual(Periods.month, Month);
      });

      it('should map ever to AllTime', () => {
        assert.strictEqual(Periods.ever, AllTime);
      });
    });
  });

  describe('getPeriod', () => {
    it('should return Week for undefined input', () => {
      assert.strictEqual(getPeriod(undefined), Week);
    });

    it('should return correct period for valid keys', () => {
      assert.strictEqual(getPeriod('24h'), Today);
      assert.strictEqual(getPeriod('7d'), Week);
      assert.strictEqual(getPeriod('30d'), Month);
      assert.strictEqual(getPeriod('all'), AllTime);
    });

    it('should return correct period for alias keys', () => {
      assert.strictEqual(getPeriod('today'), Today);
      assert.strictEqual(getPeriod('week'), Week);
      assert.strictEqual(getPeriod('month'), Month);
      assert.strictEqual(getPeriod('ever'), AllTime);
    });

    it('should default to Week for invalid keys', () => {
      assert.strictEqual(getPeriod('invalid'), Week);
      assert.strictEqual(getPeriod(''), Week);
      assert.strictEqual(getPeriod('123'), Week);
    });

    it('should be case-sensitive', () => {
      assert.strictEqual(getPeriod('TODAY'), Week); // Returns default
      assert.strictEqual(getPeriod('Today'), Week); // Returns default
      assert.strictEqual(getPeriod('24H'), Week); // Returns default
    });
  });

  describe('Period Calculations', () => {
    it('should correctly filter entries for 24h period', () => {
      const now = Math.floor(Date.now() / 1000);
      const cutoff = Today.cutoff(now);

      // Recent entry (within 24h)
      const recent = { ts: now - 3600 }; // 1 hour ago
      assert.ok(recent.ts >= cutoff);

      // Old entry (outside 24h)
      const old = { ts: now - 100_000 }; // ~27 hours ago
      assert.ok(old.ts < cutoff);
    });

    it('should correctly filter entries for 7d period', () => {
      const now = Math.floor(Date.now() / 1000);
      const cutoff = Week.cutoff(now);

      // Recent entry (within 7d)
      const recent = { ts: now - 86_400 }; // 1 day ago
      assert.ok(recent.ts >= cutoff);

      // Old entry (outside 7d)
      const old = { ts: now - 700_000 }; // ~8 days ago
      assert.ok(old.ts < cutoff);
    });

    it('should correctly filter entries for 30d period', () => {
      const now = Math.floor(Date.now() / 1000);
      const cutoff = Month.cutoff(now);

      // Recent entry (within 30d)
      const recent = { ts: now - 604_800 }; // 7 days ago
      assert.ok(recent.ts >= cutoff);

      // Old entry (outside 30d)
      const old = { ts: now - 3_000_000 }; // ~34 days ago
      assert.ok(old.ts < cutoff);
    });

    it('should include all entries for all time period', () => {
      const now = Math.floor(Date.now() / 1000);
      const cutoff = AllTime.cutoff(now);

      // Any entry should be included
      assert.ok(cutoff === 0);
      assert.ok({ ts: 1000 }.ts >= cutoff);
      assert.ok({ ts: now }.ts >= cutoff);
    });
  });
});
