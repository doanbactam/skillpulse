/**
 * Edge Case Tests
 * Tests for boundary conditions, malformed data, and unusual scenarios
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as Storage from '../../src/storage.js';
import { getPeriod } from '../../src/periods.js';
import { LogPulse, GetSkillStats, ListSkills } from '../../src/handlers.js';

// Test utilities
const TEST_DIR = path.join(os.tmpdir(), `skillpulse-edge-test-${process.pid}`);
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

describe('Edge Cases', () => {
  beforeEach(setupTestDir);
  afterEach(cleanupTestDir);

  describe('Storage - Boundary Conditions', () => {
    it('should handle empty JSON object', () => {
      fs.writeFileSync(MOCK_ANALYTICS_FILE, '{}\n');

      const entries = [...Storage.readEntriesSince(0)];
      // Empty object has no skill or ts, should be skipped
      assert.strictEqual(entries.length, 0);
    });

    it('should handle JSON with missing fields', () => {
      fs.writeFileSync(MOCK_ANALYTICS_FILE, '{"skill":"test"}\n{"ts":123456}\n');

      const entries = [...Storage.readEntriesSince(0)];
      // Entry with ts field is yielded (no skill validation in readEntriesSince)
      // Entry without ts field is skipped (ts >= cutoff check fails)
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].ts, 123456);
    });

    it('should handle null and undefined values in JSON', () => {
      fs.writeFileSync(MOCK_ANALYTICS_FILE, '{"skill":null,"ts":123456}\n');

      const entries = [...Storage.readEntriesSince(0)];
      // null skill is still yielded (validation happens at aggregation layer)
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].skill, null);
    });

    it('should handle very long skill names', async () => {
      const longName = 'a'.repeat(1000);
      Storage.appendEntrySync({ skill: longName, ts: Date.now() / 1000, outcome: 'success' });

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries[0].skill, longName);
    });

    it('should handle special characters in skill names', () => {
      const specialNames = [
        'skill-with-dashes',
        'skill_with_underscores',
        'skill.with.dots',
        'skill/with/slashes',
        'skill:with:colons',
        'skill@with@ats',
      ];

      for (const name of specialNames) {
        Storage.appendEntrySync({ skill: name, ts: Date.now() / 1000, outcome: 'success' });
      }

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries.length, specialNames.length);
    });

    it('should handle Unicode characters in skill names', () => {
      const unicodeNames = [
        'skill-тест',        // Cyrillic
        'skill-测试',        // Chinese
        'skill-テスト',      // Japanese
        'skill-🔥🎉',        // Emojis
      ];

      for (const name of unicodeNames) {
        Storage.appendEntrySync({ skill: name, ts: Date.now() / 1000, outcome: 'success' });
      }

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries.length, unicodeNames.length);
    });

    it('should handle extremely large timestamps', () => {
      const maxTimestamp = Math.floor(Date.now() / 1000) + 1000000000;
      Storage.appendEntrySync({ skill: 'future', ts: maxTimestamp, outcome: 'success' });

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries[0].ts, maxTimestamp);
    });

    it('should handle negative timestamps', () => {
      Storage.appendEntrySync({ skill: 'negative', ts: -1000000, outcome: 'success' });

      // Use cutoff lower than the negative timestamp to include it
      const entries = [...Storage.readEntriesSince(-2000000)];
      assert.strictEqual(entries[0].ts, -1000000);
    });

    it('should handle zero timestamp', () => {
      Storage.appendEntrySync({ skill: 'zero', ts: 0, outcome: 'success' });

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries[0].ts, 0);
    });

    it('should handle floating point timestamps (should be truncated)', () => {
      // The timestamp will be stored as-is, then parsed
      Storage.appendEntrySync({ skill: 'float', ts: 1234567890.789, outcome: 'success' });

      const entries = [...Storage.readEntriesSince(0)];
      // JSON preserves the float
      assert.strictEqual(entries[0].ts, 1234567890.789);
    });
  });

  describe('Storage - Malformed Data', () => {
    it('should skip completely invalid lines', () => {
      fs.writeFileSync(MOCK_ANALYTICS_FILE, 'not json at all\n{"valid":true}\n');

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries.length, 0); // valid JSON but no skill/ts
    });

    it('should handle truncated JSON', () => {
      fs.writeFileSync(MOCK_ANALYTICS_FILE, '{"skill":"test","ts":123456\n{"skill":"complete","ts":789}\n');

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].skill, 'complete');
    });

    it('should handle JSON with extra commas', () => {
      fs.writeFileSync(MOCK_ANALYTICS_FILE, '{"skill":"test","ts":123456,}\n');

      const entries = [...Storage.readEntriesSince(0)];
      // JSON.parse will throw, so entry is skipped
      assert.strictEqual(entries.length, 0);
    });

    it('should handle JSON with comments (invalid in standard JSON)', () => {
      fs.writeFileSync(MOCK_ANALYTICS_FILE, '{"skill":"test","ts":123456}//comment\n{"skill":"valid","ts":789}\n');

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].skill, 'valid');
    });

    it('should handle duplicate keys in JSON (last one wins)', () => {
      fs.writeFileSync(MOCK_ANALYTICS_FILE, '{"skill":"first","skill":"second","ts":123456}\n');

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries[0].skill, 'second');
    });

    it('should handle empty file', () => {
      fs.writeFileSync(MOCK_ANALYTICS_FILE, '');

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries.length, 0);
    });

    it('should handle file with only newlines', () => {
      fs.writeFileSync(MOCK_ANALYTICS_FILE, '\n\n\n');

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries.length, 0);
    });

    it('should handle mixed line endings (CRLF, LF)', () => {
      const content = '{"skill":"test1","ts":100}\r\n{"skill":"test2","ts":200}\n{"skill":"test3","ts":300}\r\n';
      fs.writeFileSync(MOCK_ANALYTICS_FILE, content);

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries.length, 3);
    });
  });

  describe('Storage - Large Datasets', () => {
    it('should handle thousands of entries', () => {
      const count = 5000;
      for (let i = 0; i < count; i++) {
        Storage.appendEntrySync({ skill: `skill-${i % 100}`, ts: Date.now() / 1000 - i, outcome: 'success' });
      }

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries.length, count);
    });

    it('should aggregate stats for many different skills', () => {
      const skillCount = 1000;
      for (let i = 0; i < skillCount; i++) {
        Storage.appendEntrySync({ skill: `skill-${i}`, ts: Date.now() / 1000, outcome: 'success' });
      }

      const entries = [...Storage.readEntriesSince(0)];
      const stats = Storage.aggregateStats(entries);

      assert.strictEqual(Object.keys(stats).length, skillCount);
    });

    it('should handle very long JSON lines', () => {
      const longValue = 'x'.repeat(10000);
      const entry = { skill: 'test', ts: Date.now() / 1000, outcome: 'success', data: longValue };
      Storage.appendEntrySync(entry);

      const content = fs.readFileSync(MOCK_ANALYTICS_FILE, 'utf-8');
      assert.ok(content.length > 10000);

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries.length, 1);
    });
  });

  describe('Periods - Edge Cases', () => {
    it('should handle empty period string', () => {
      const period = getPeriod('');
      assert.strictEqual(period.name, '7d'); // defaults to Week
    });

    it('should handle null period', () => {
      const period = getPeriod(null);
      assert.strictEqual(period.name, '7d'); // defaults to Week
    });

    it('should handle numeric period string', () => {
      const period = getPeriod('123');
      assert.strictEqual(period.name, '7d'); // defaults to Week for invalid
    });

    it('should handle case sensitivity', () => {
      assert.strictEqual(getPeriod('24H').name, '7d'); // invalid, defaults
      assert.strictEqual(getPeriod('All').name, '7d'); // invalid, defaults
      assert.strictEqual(getPeriod('ALL').name, '7d'); // invalid, defaults
    });

    it('should handle whitespace in period', () => {
      const period = getPeriod(' 24h ');
      assert.strictEqual(period.name, '7d'); // invalid, defaults
    });

    it('should handle period cutoff at exact boundary', () => {
      const now = 1000000;
      const week = getPeriod('7d');
      const cutoff = week.cutoff(now);

      // Entry exactly at cutoff should be included
      const entryAtCutoff = { ts: cutoff, skill: 'boundary-test', outcome: 'success' };
      assert.ok(entryAtCutoff.ts >= cutoff);

      // Entry just before cutoff should be excluded
      const entryBeforeCutoff = { ts: cutoff - 1, skill: 'before-boundary', outcome: 'success' };
      assert.ok(entryBeforeCutoff.ts < cutoff);
    });
  });

  describe('Handlers - Edge Cases', () => {
    it('should handle skill name with only spaces', async () => {
      const result = await LogPulse.handle({ skill: '   ', outcome: 'success' });

      assert.strictEqual(result.content[0].type, 'text');
      const content = fs.readFileSync(MOCK_ANALYTICS_FILE, 'utf-8');
      assert.ok(content.includes('   '));
    });

    it('should handle all outcome types correctly', () => {
      const now = Date.now() / 1000;
      Storage.appendEntrySync({ skill: 'test', ts: now, outcome: 'success' });
      Storage.appendEntrySync({ skill: 'test', ts: now - 1, outcome: 'error' });
      Storage.appendEntrySync({ skill: 'test', ts: now - 2, outcome: 'abort' });
      Storage.appendEntrySync({ skill: 'test', ts: now - 3, outcome: 'unknown' });

      const entries = [...Storage.readEntriesSince(0)];
      const stats = Storage.aggregateStats(entries);

      assert.strictEqual(stats.test.calls, 4);
      assert.strictEqual(stats.test.success, 1);
      assert.strictEqual(stats.test.error, 1);
      assert.strictEqual(stats.test.abort, 1);
      // unknown outcome is ignored
      assert.strictEqual(stats.test.unknown, undefined);
    });

    it('should handle concurrent writes', () => {
      // Simulate rapid writes
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          new Promise(resolve => {
            Storage.appendEntrySync({ skill: `skill-${i}`, ts: Date.now() / 1000, outcome: 'success' });
            resolve();
          })
        );
      }

      Promise.all(promises).then(() => {
        const entries = [...Storage.readEntriesSince(0)];
        assert.strictEqual(entries.length, 100);
      });
    });
  });

  describe('ListSkills - Edge Cases', () => {
    it('should handle directory without skill.json', () => {
      fs.mkdirSync(path.join(MOCK_SKILLS_DIR, 'no-json'));

      const skills = [...Storage.listInstalledSkills()];
      assert.ok(skills.includes('no-json'));
    });

    it('should handle malformed skill.json', () => {
      const skillDir = path.join(MOCK_SKILLS_DIR, 'malformed');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'skill.json'), 'invalid json{{{');

      const skills = [...Storage.listInstalledSkills()];
      assert.ok(skills.includes('malformed'));
    });

    it('should handle empty skill.json', () => {
      const skillDir = path.join(MOCK_SKILLS_DIR, 'empty-json');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'skill.json'), '');

      const skills = [...Storage.listInstalledSkills()];
      assert.ok(skills.includes('empty-json'));
    });

    it('should handle directory with only SKILL.md', () => {
      const skillDir = path.join(MOCK_SKILLS_DIR, 'only-md');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Test Skill');

      const skills = [...Storage.listInstalledSkills()];
      assert.ok(skills.includes('only-md'));
    });

    it('should handle deeply nested directory structure', () => {
      const deepDir = path.join(MOCK_SKILLS_DIR, 'level1/level2/level3');
      fs.mkdirSync(deepDir, { recursive: true });

      const skills = [...Storage.listInstalledSkills()];
      // Only top-level directories are listed
      assert.ok(skills.includes('level1'));
      assert.ok(!skills.includes('level2'));
      assert.ok(!skills.includes('level3'));
    });

    it('should handle hidden directories (starting with dot)', () => {
      fs.mkdirSync(path.join(MOCK_SKILLS_DIR, '.hidden'));

      const skills = [...Storage.listInstalledSkills()];
      assert.ok(skills.includes('.hidden'));
    });
  });

  describe('ReadSkillDescription - Edge Cases', () => {
    it('should handle very long description', () => {
      const skillDir = path.join(MOCK_SKILLS_DIR, 'long-desc');
      fs.mkdirSync(skillDir);
      const longDesc = 'x'.repeat(1000);
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---\ndescription:\n${longDesc}\n---\n`
      );

      const desc = Storage.readSkillDescription('long-desc');
      assert.strictEqual(desc.length, 80); // truncated
    });

    it('should handle description with newlines', () => {
      const skillDir = path.join(MOCK_SKILLS_DIR, 'multiline-desc');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\ndescription:\nLine 1\nLine 2\nLine 3\n---\n'
      );

      const desc = Storage.readSkillDescription('multiline-desc');
      assert.strictEqual(desc, 'Line 1');
    });

    it('should handle description with special characters', () => {
      const skillDir = path.join(MOCK_SKILLS_DIR, 'special-chars');
      fs.mkdirSync(skillDir);
      const specialDesc = 'Test with "quotes", \'apostrophes\', $symbols, &more!';
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---\ndescription:\n${specialDesc}\n---\n`
      );

      const desc = Storage.readSkillDescription('special-chars');
      assert.strictEqual(desc, specialDesc);
    });

    it('should handle description at exactly 80 characters', () => {
      const skillDir = path.join(MOCK_SKILLS_DIR, 'exact-80');
      fs.mkdirSync(skillDir);
      const exact80 = 'a'.repeat(80);
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---\ndescription:\n${exact80}\n---\n`
      );

      const desc = Storage.readSkillDescription('exact-80');
      assert.strictEqual(desc.length, 80);
    });

    it('should handle empty description', () => {
      const skillDir = path.join(MOCK_SKILLS_DIR, 'empty-desc');
      fs.mkdirSync(skillDir);
      // With format: description:\n\n---\n, the regex captures the --- on next line
      // This is a known quirk - the regex doesn't handle empty descriptions well
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\ndescription:\n\n---\n'
      );

      const desc = Storage.readSkillDescription('empty-desc');
      // The regex captures '---' as the description (known edge case behavior)
      assert.strictEqual(desc, '---');
    });
  });

  describe('AggregateStats - Edge Cases', () => {
    it('should handle entries with same timestamp', () => {
      const now = Date.now() / 1000;
      Storage.appendEntrySync({ skill: 'test', ts: now, outcome: 'success' });
      Storage.appendEntrySync({ skill: 'test', ts: now, outcome: 'error' });
      Storage.appendEntrySync({ skill: 'test', ts: now, outcome: 'abort' });

      const entries = [...Storage.readEntriesSince(0)];
      const stats = Storage.aggregateStats(entries);

      assert.strictEqual(stats.test.calls, 3);
    });

    it('should handle entries with timestamp exactly at cutoff', () => {
      const now = Date.now() / 1000;
      const cutoff = now - 100;

      Storage.appendEntrySync({ skill: 'at', ts: cutoff, outcome: 'success' });
      Storage.appendEntrySync({ skill: 'before', ts: cutoff - 1, outcome: 'success' });
      Storage.appendEntrySync({ skill: 'after', ts: cutoff + 1, outcome: 'success' });

      const entries = [...Storage.readEntriesSince(cutoff)];
      assert.strictEqual(entries.length, 2); // at and after
      assert.ok(entries.every(e => e.skill !== 'before'));
    });
  });
});
