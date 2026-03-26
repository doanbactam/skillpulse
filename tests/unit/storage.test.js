/**
 * Unit Tests for Storage Layer
 * Tests for analytics storage, retrieval, and aggregation
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as Storage from '../../src/storage.js';

// Test utilities
const TEST_DIR = path.join(os.tmpdir(), `skillpulse-test-${process.pid}`);
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

describe('Storage Layer', () => {
  beforeEach(() => {
    setupTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  describe('ensureStorage', () => {
    it('should create analytics directory if it does not exist', () => {
      // Remove the directory first to test creation
      const analyticsDir = path.dirname(MOCK_ANALYTICS_FILE);
      fs.rmSync(analyticsDir, { recursive: true, force: true });
      assert.ok(!fs.existsSync(analyticsDir));

      Storage.ensureStorage();

      assert.ok(fs.existsSync(analyticsDir));
    });

    it('should be idempotent - calling multiple times is safe', () => {
      Storage.ensureStorage();
      Storage.ensureStorage();
      Storage.ensureStorage();

      assert.ok(fs.existsSync(path.dirname(MOCK_ANALYTICS_FILE)));
    });
  });

  describe('appendEntry', () => {
    it('should append a single entry to analytics file', () => {
      const entry = {
        skill: 'test-skill',
        ts: 1234567890,
        outcome: 'success',
        pid: 12345,
      };

      Storage.appendEntrySync(entry);

      assert.ok(fs.existsSync(MOCK_ANALYTICS_FILE));
      const content = fs.readFileSync(MOCK_ANALYTICS_FILE, 'utf-8');
      assert.strictEqual(content.trim(), JSON.stringify(entry));
    });

    it('should append multiple entries on separate lines', () => {
      const entry1 = { skill: 'skill1', ts: 1000, outcome: 'success' };
      const entry2 = { skill: 'skill2', ts: 2000, outcome: 'error' };

      Storage.appendEntrySync(entry1);
      Storage.appendEntrySync(entry2);

      const content = fs.readFileSync(MOCK_ANALYTICS_FILE, 'utf-8');
      const lines = content.trim().split('\n');

      assert.deepStrictEqual(JSON.parse(lines[0]), entry1);
      assert.deepStrictEqual(JSON.parse(lines[1]), entry2);
    });

    it('should create directory if it does not exist', () => {
      const analyticsDir = path.dirname(MOCK_ANALYTICS_FILE);
      fs.rmSync(analyticsDir, { recursive: true, force: true });

      const entry = { skill: 'test', ts: 1000, outcome: 'success' };
      Storage.appendEntrySync(entry);

      assert.ok(fs.existsSync(MOCK_ANALYTICS_FILE));
    });
  });

  describe('readEntriesSince', () => {
    it('should return empty generator when file does not exist', () => {
      const entries = [...Storage.readEntriesSince(0)];
      assert.deepStrictEqual(entries, []);
    });

    it('should filter entries by cutoff timestamp', () => {
      const now = Date.now() / 1000;
      const oldEntry = { skill: 'old', ts: now - 10000, outcome: 'success' };
      const newEntry = { skill: 'new', ts: now - 100, outcome: 'success' };

      Storage.appendEntrySync(oldEntry);
      Storage.appendEntrySync(newEntry);

      const cutoff = now - 5000;
      const entries = [...Storage.readEntriesSince(cutoff)];

      assert.strictEqual(entries.length, 1);
      assert.deepStrictEqual(entries[0], newEntry);
    });

    it('should include entries exactly at cutoff', () => {
      const now = Date.now() / 1000;
      const entry = { skill: 'test', ts: now, outcome: 'success' };

      Storage.appendEntrySync(entry);

      const entries = [...Storage.readEntriesSince(now)];

      assert.strictEqual(entries.length, 1);
      assert.deepStrictEqual(entries[0], entry);
    });

    it('should skip malformed JSON lines', () => {
      fs.writeFileSync(
        MOCK_ANALYTICS_FILE,
        '{"skill":"valid","ts":1000,"outcome":"success"}\n' +
        'invalid json line\n' +
        '{"skill":"also-valid","ts":2000,"outcome":"error"}\n'
      );

      const entries = [...Storage.readEntriesSince(0)];

      assert.strictEqual(entries.length, 2);
      assert.strictEqual(entries[0].skill, 'valid');
      assert.strictEqual(entries[1].skill, 'also-valid');
    });

    it('should skip empty lines', () => {
      fs.writeFileSync(
        MOCK_ANALYTICS_FILE,
        '{"skill":"valid","ts":1000}\n\n\n'
      );

      const entries = [...Storage.readEntriesSince(0)];

      assert.strictEqual(entries.length, 1);
    });
  });

  describe('aggregateStats', () => {
    it('should return empty object for no entries', () => {
      const stats = Storage.aggregateStats([]);
      assert.deepStrictEqual(stats, {});
    });

    it('should count calls per skill', () => {
      const entries = [
        { skill: 'skill1', ts: 1000, outcome: 'success' },
        { skill: 'skill1', ts: 2000, outcome: 'success' },
        { skill: 'skill2', ts: 3000, outcome: 'success' },
      ];

      const stats = Storage.aggregateStats(entries);

      assert.strictEqual(stats.skill1.calls, 2);
      assert.strictEqual(stats.skill2.calls, 1);
    });

    it('should count outcomes correctly', () => {
      const entries = [
        { skill: 'skill1', ts: 1000, outcome: 'success' },
        { skill: 'skill1', ts: 2000, outcome: 'success' },
        { skill: 'skill1', ts: 3000, outcome: 'error' },
        { skill: 'skill1', ts: 4000, outcome: 'abort' },
      ];

      const stats = Storage.aggregateStats(entries);

      assert.strictEqual(stats.skill1.calls, 4);
      assert.strictEqual(stats.skill1.success, 2);
      assert.strictEqual(stats.skill1.error, 1);
      assert.strictEqual(stats.skill1.abort, 1);
    });

    it('should handle entries without outcome', () => {
      const entries = [
        { skill: 'skill1', ts: 1000 },
        { skill: 'skill1', ts: 2000, outcome: 'success' },
      ];

      const stats = Storage.aggregateStats(entries);

      assert.strictEqual(stats.skill1.calls, 2);
      assert.strictEqual(stats.skill1.success, 1);
    });

    it('should ignore unknown outcome types', () => {
      const entries = [
        { skill: 'skill1', ts: 1000, outcome: 'success' },
        { skill: 'skill1', ts: 2000, outcome: 'unknown' },
      ];

      const stats = Storage.aggregateStats(entries);

      assert.strictEqual(stats.skill1.calls, 2);
      assert.strictEqual(stats.skill1.success, 1);
      assert.strictEqual(stats.skill1.unknown, undefined);
    });
  });

  describe('listInstalledSkills', () => {
    it('should return empty generator when skills dir does not exist', () => {
      fs.rmSync(MOCK_SKILLS_DIR, { recursive: true, force: true });

      const skills = [...Storage.listInstalledSkills()];
      assert.deepStrictEqual(skills, []);
    });

    it('should list only directories', () => {
      fs.mkdirSync(path.join(MOCK_SKILLS_DIR, 'skill1'));
      fs.mkdirSync(path.join(MOCK_SKILLS_DIR, 'skill2'));
      fs.writeFileSync(path.join(MOCK_SKILLS_DIR, 'file.txt'), 'content');

      const skills = [...Storage.listInstalledSkills()];

      assert.strictEqual(skills.length, 2);
      assert.ok(skills.includes('skill1'));
      assert.ok(skills.includes('skill2'));
    });

    it('should list all skill directories', () => {
      const skillNames = ['careful', 'freeze', 'pulse', 'qa'];
      for (const name of skillNames) {
        fs.mkdirSync(path.join(MOCK_SKILLS_DIR, name));
      }

      const skills = [...Storage.listInstalledSkills()];

      for (const name of skillNames) {
        assert.ok(skills.includes(name), `Should include ${name}`);
      }
    });
  });

  describe('readSkillDescription', () => {
    it('should return default when skill directory does not exist', () => {
      const desc = Storage.readSkillDescription('nonexistent');
      assert.strictEqual(desc, 'No description');
    });

    it('should return default when SKILL.md does not exist', () => {
      fs.mkdirSync(path.join(MOCK_SKILLS_DIR, 'test-skill'));

      const desc = Storage.readSkillDescription('test-skill');
      assert.strictEqual(desc, 'No description');
    });

    it('should extract description from SKILL.md', () => {
      const skillDir = path.join(MOCK_SKILLS_DIR, 'test-skill');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\n' +
        'description:\n' +
        'This is a test skill description\n' +
        '---\n'
      );

      const desc = Storage.readSkillDescription('test-skill');
      assert.strictEqual(desc, 'This is a test skill description');
    });

    it('should truncate long descriptions to 80 chars', () => {
      const skillDir = path.join(MOCK_SKILLS_DIR, 'test-skill');
      fs.mkdirSync(skillDir);
      const longDesc = 'a'.repeat(100);
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        `---\ndescription:\n${longDesc}\n---\n`
      );

      const desc = Storage.readSkillDescription('test-skill');
      assert.strictEqual(desc.length, 80);
    });

    it('should handle multi-line descriptions (take first line)', () => {
      const skillDir = path.join(MOCK_SKILLS_DIR, 'test-skill');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\n' +
        'description:\n' +
        'First line\n' +
        'Second line\n' +
        '---\n'
      );

      const desc = Storage.readSkillDescription('test-skill');
      assert.strictEqual(desc, 'First line');
    });

    it('should handle malformed SKILL.md gracefully', () => {
      const skillDir = path.join(MOCK_SKILLS_DIR, 'test-skill');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        'invalid yaml content'
      );

      const desc = Storage.readSkillDescription('test-skill');
      assert.strictEqual(desc, 'No description');
    });

    it('should handle alternative frontmatter format with allowed-tools', () => {
      const skillDir = path.join(MOCK_SKILLS_DIR, 'test-skill');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\n' +
        'description:\n' +
        'Test description\n' +
        'allowed-tools:\n' +
        '  - bash\n' +
        '---\n'
      );

      const desc = Storage.readSkillDescription('test-skill');
      assert.strictEqual(desc, 'Test description');
    });
  });
});
