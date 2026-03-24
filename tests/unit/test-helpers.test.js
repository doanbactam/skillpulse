/**
 * Test Helper Functions Tests
 * Tests for the test utility functions in storage.js
 * These functions are used by other tests but need their own coverage
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as Storage from '../../src/storage.js';

// Store original paths for restoration
const ORIGINAL_ANALYTICS = Storage.getAnalyticsPath();
const ORIGINAL_SKILLS = Storage.getSkillsPath();

describe('Test Helper Functions', () => {
  afterEach(() => {
    // Always reset to original paths after each test
    Storage.resetPaths();
  });

  describe('setPaths', () => {
    it('should override analytics file path', () => {
      const newPath = '/tmp/test-analytics.jsonl';
      Storage.setPaths(newPath, null);

      assert.strictEqual(Storage.getAnalyticsPath(), newPath);
    });

    it('should override skills directory path', () => {
      const newPath = '/tmp/test-skills';
      Storage.setPaths(null, newPath);

      assert.strictEqual(Storage.getSkillsPath(), newPath);
    });

    it('should override both paths at once', () => {
      const analyticsPath = '/tmp/test-analytics.jsonl';
      const skillsPath = '/tmp/test-skills';

      Storage.setPaths(analyticsPath, skillsPath);

      assert.strictEqual(Storage.getAnalyticsPath(), analyticsPath);
      assert.strictEqual(Storage.getSkillsPath(), skillsPath);
    });

    it('should persist path changes across operations', () => {
      const testDir = path.join(os.tmpdir(), 'skillpulse-persistence-test');
      const analyticsFile = path.join(testDir, 'analytics.jsonl');
      const skillsDir = path.join(testDir, 'skills');

      Storage.setPaths(analyticsFile, skillsDir);

      // Create directory using overridden path
      Storage.ensureStorage();

      assert.ok(fs.existsSync(path.dirname(analyticsFile)));
      assert.ok(fs.existsSync(testDir));

      // Cleanup
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('should handle empty strings as paths', () => {
      Storage.setPaths('', '');

      // Empty strings are still set (though they may not work well)
      assert.strictEqual(Storage.getAnalyticsPath(), '');
      assert.strictEqual(Storage.getSkillsPath(), '');
    });

    it('should handle paths with special characters', () => {
      const specialPath = '/tmp/test path with spaces & symbols.jsonl';
      Storage.setPaths(specialPath, null);

      assert.strictEqual(Storage.getAnalyticsPath(), specialPath);
    });

    it('should allow updating only one path at a time', () => {
      const originalAnalytics = Storage.getAnalyticsPath();
      const originalSkills = Storage.getSkillsPath();

      // Update only analytics
      Storage.setPaths('/tmp/new-analytics.jsonl', null);
      assert.strictEqual(Storage.getAnalyticsPath(), '/tmp/new-analytics.jsonl');
      assert.strictEqual(Storage.getSkillsPath(), originalSkills);

      // Update only skills
      Storage.setPaths(null, '/tmp/new-skills');
      assert.strictEqual(Storage.getAnalyticsPath(), '/tmp/new-analytics.jsonl');
      assert.strictEqual(Storage.getSkillsPath(), '/tmp/new-skills');
    });
  });

  describe('resetPaths', () => {
    it('should reset to default analytics path', () => {
      // First override
      Storage.setPaths('/tmp/test.jsonl', null);
      assert.notStrictEqual(Storage.getAnalyticsPath(), ORIGINAL_ANALYTICS);

      // Then reset
      Storage.resetPaths();

      assert.strictEqual(Storage.getAnalyticsPath(), ORIGINAL_ANALYTICS);
    });

    it('should reset to default skills path', () => {
      // First override
      Storage.setPaths(null, '/tmp/test-skills');
      assert.notStrictEqual(Storage.getSkillsPath(), ORIGINAL_SKILLS);

      // Then reset
      Storage.resetPaths();

      assert.strictEqual(Storage.getSkillsPath(), ORIGINAL_SKILLS);
    });

    it('should reset both paths simultaneously', () => {
      // Override both
      Storage.setPaths('/tmp/a.jsonl', '/tmp/s');

      Storage.resetPaths();

      assert.strictEqual(Storage.getAnalyticsPath(), ORIGINAL_ANALYTICS);
      assert.strictEqual(Storage.getSkillsPath(), ORIGINAL_SKILLS);
    });

    it('should be idempotent - calling multiple times is safe', () => {
      Storage.setPaths('/tmp/test.jsonl', '/tmp/test');

      Storage.resetPaths();
      Storage.resetPaths();
      Storage.resetPaths();

      assert.strictEqual(Storage.getAnalyticsPath(), ORIGINAL_ANALYTICS);
      assert.strictEqual(Storage.getSkillsPath(), ORIGINAL_SKILLS);
    });

    it('should work after multiple setPaths calls', () => {
      Storage.setPaths('/tmp/test1.jsonl', '/tmp/skills1');
      Storage.setPaths('/tmp/test2.jsonl', '/tmp/skills2');
      Storage.setPaths('/tmp/test3.jsonl', '/tmp/skills3');

      Storage.resetPaths();

      assert.strictEqual(Storage.getAnalyticsPath(), ORIGINAL_ANALYTICS);
      assert.strictEqual(Storage.getSkillsPath(), ORIGINAL_SKILLS);
    });
  });

  describe('getAnalyticsPath', () => {
    it('should return default path initially', () => {
      Storage.resetPaths();

      const path = Storage.getAnalyticsPath();
      assert.ok(path.includes('.claude'));
      assert.ok(path.includes('pulse.jsonl'));
    });

    it('should return overridden path after setPaths', () => {
      const customPath = '/custom/analytics.jsonl';
      Storage.setPaths(customPath, null);

      assert.strictEqual(Storage.getAnalyticsPath(), customPath);
    });

    it('should reflect path changes immediately', () => {
      Storage.resetPaths();
      const initial = Storage.getAnalyticsPath();

      Storage.setPaths('/tmp/test1.jsonl', null);
      assert.strictEqual(Storage.getAnalyticsPath(), '/tmp/test1.jsonl');

      Storage.setPaths('/tmp/test2.jsonl', null);
      assert.strictEqual(Storage.getAnalyticsPath(), '/tmp/test2.jsonl');
    });

    it('should not be affected by resetPaths on other path', () => {
      Storage.setPaths('/tmp/analytics.jsonl', '/tmp/skills');

      const beforeReset = Storage.getAnalyticsPath();
      Storage.resetPaths();

      // resetPaths resets both
      assert.notStrictEqual(Storage.getAnalyticsPath(), beforeReset);
    });
  });

  describe('getSkillsPath', () => {
    it('should return default path initially', () => {
      Storage.resetPaths();

      const path = Storage.getSkillsPath();
      assert.ok(path.includes('.claude'));
      assert.ok(path.includes('skills'));
    });

    it('should return overridden path after setPaths', () => {
      const customPath = '/custom/skills';
      Storage.setPaths(null, customPath);

      assert.strictEqual(Storage.getSkillsPath(), customPath);
    });

    it('should reflect path changes immediately', () => {
      Storage.resetPaths();
      const initial = Storage.getSkillsPath();

      Storage.setPaths(null, '/tmp/skills1');
      assert.strictEqual(Storage.getSkillsPath(), '/tmp/skills1');

      Storage.setPaths(null, '/tmp/skills2');
      assert.strictEqual(Storage.getSkillsPath(), '/tmp/skills2');
    });
  });

  describe('Path Integration with Storage Operations', () => {
    it('should use overridden path in ensureStorage', () => {
      const testDir = path.join(os.tmpdir(), 'skillpulse-integration-test');
      const analyticsFile = path.join(testDir, 'test-analytics.jsonl');

      Storage.setPaths(analyticsFile, null);

      Storage.ensureStorage();

      assert.ok(fs.existsSync(path.dirname(analyticsFile)));

      // Cleanup
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('should use overridden path in appendEntry', () => {
      const testDir = path.join(os.tmpdir(), 'skillpulse-append-test');
      const analyticsFile = path.join(testDir, 'test-analytics.jsonl');

      Storage.setPaths(analyticsFile, null);

      Storage.appendEntry({ skill: 'test', ts: 123456, outcome: 'success' });

      assert.ok(fs.existsSync(analyticsFile));
      const content = fs.readFileSync(analyticsFile, 'utf-8');
      assert.ok(content.includes('test'));

      // Cleanup
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('should use overridden path in readEntriesSince', () => {
      const testDir = path.join(os.tmpdir(), 'skillpulse-read-test');
      const analyticsFile = path.join(testDir, 'test-analytics.jsonl');

      Storage.setPaths(analyticsFile, null);
      Storage.appendEntry({ skill: 'test', ts: 123456, outcome: 'success' });

      const entries = [...Storage.readEntriesSince(0)];

      assert.strictEqual(entries.length, 1);
      assert.strictEqual(entries[0].skill, 'test');

      // Cleanup
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('should use overridden skills path in listInstalledSkills', () => {
      const testDir = path.join(os.tmpdir(), 'skillpulse-list-test');
      const skillsDir = path.join(testDir, 'test-skills');

      Storage.setPaths(null, skillsDir);
      fs.mkdirSync(path.join(skillsDir, 'skill1'), { recursive: true });

      const skills = [...Storage.listInstalledSkills()];

      assert.ok(skills.includes('skill1'));

      // Cleanup
      fs.rmSync(testDir, { recursive: true, force: true });
    });

    it('should use overridden skills path in readSkillDescription', () => {
      const testDir = path.join(os.tmpdir(), 'skillpulse-desc-test');
      const skillsDir = path.join(testDir, 'test-skills');

      Storage.setPaths(null, skillsDir);

      const skillDir = path.join(skillsDir, 'test-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\ndescription:\nTest description\n---\n'
      );

      const desc = Storage.readSkillDescription('test-skill');

      assert.strictEqual(desc, 'Test description');

      // Cleanup
      fs.rmSync(testDir, { recursive: true, force: true });
    });
  });

  describe('Path Thread Safety (Simulated)', () => {
    it('should handle rapid path changes', () => {
      const paths = [];
      for (let i = 0; i < 100; i++) {
        Storage.setPaths(`/tmp/test${i}.jsonl`, `/tmp/skills${i}`);
        paths.push(Storage.getAnalyticsPath());
      }

      // Each set should be reflected
      for (let i = 0; i < 100; i++) {
        assert.strictEqual(paths[i], `/tmp/test${i}.jsonl`);
      }
    });

    it('should handle interleaved set and reset operations', () => {
      for (let i = 0; i < 10; i++) {
        Storage.setPaths(`/tmp/test${i}.jsonl`, null);
        assert.strictEqual(Storage.getAnalyticsPath(), `/tmp/test${i}.jsonl`);

        Storage.resetPaths();
        assert.strictEqual(Storage.getAnalyticsPath(), ORIGINAL_ANALYTICS);
      }
    });
  });

  describe('Default Path Values', () => {
    it('should construct analytics path correctly', () => {
      Storage.resetPaths();
      const path = Storage.getAnalyticsPath();

      assert.ok(path.endsWith('pulse.jsonl'));
      assert.ok(path.includes('.claude'));
      assert.ok(path.includes('skills'));
    });

    it('should construct skills path correctly', () => {
      Storage.resetPaths();
      const path = Storage.getSkillsPath();

      assert.ok(path.endsWith('skills'));
      assert.ok(path.includes('.claude'));
    });

    it('should use user home directory', () => {
      Storage.resetPaths();
      const homedir = os.homedir();

      const analyticsPath = Storage.getAnalyticsPath();
      const skillsPath = Storage.getSkillsPath();

      assert.ok(analyticsPath.startsWith(homedir));
      assert.ok(skillsPath.startsWith(homedir));
    });
  });
});
