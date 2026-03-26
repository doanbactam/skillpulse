/**
 * Unit Tests for MCP Tool Handlers
 * Tests for LogPulse, GetSkillStats, and ListSkills tools
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as Storage from '../../src/storage.js';
import { LogPulse, GetSkillStats, ListSkills, Tools } from '../../src/handlers.js';

// Test utilities
const TEST_DIR = path.join(os.tmpdir(), `skillpulse-handlers-test-${process.pid}`);
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

describe('MCP Tool Handlers', () => {
  beforeEach(() => {
    setupTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  describe('LogPulse', () => {
    it('should have correct name', () => {
      assert.strictEqual(LogPulse.name, 'log_pulse');
    });

    it('should have valid schema', () => {
      assert.deepStrictEqual(LogPulse.schema.properties.skill.type, 'string');
      assert.deepStrictEqual(LogPulse.schema.properties.outcome.type, 'string');
      assert.deepStrictEqual(LogPulse.schema.properties.outcome.enum, ['success', 'error', 'abort']);
      assert.deepStrictEqual(LogPulse.schema.required, ['skill']);
    });

    it('should log skill usage with default outcome', async () => {
      const result = await LogPulse.handle({ skill: 'test-skill' });

      assert.strictEqual(result.content[0].type, 'text');
      assert.ok(result.content[0].text.includes('test-skill'));

      // Verify entry was written
      const content = fs.readFileSync(MOCK_ANALYTICS_FILE, 'utf-8');
      const entry = JSON.parse(content.trim());
      assert.strictEqual(entry.skill, 'test-skill');
      assert.strictEqual(entry.outcome, 'success');
    });

    it('should log skill usage with success outcome', async () => {
      const result = await LogPulse.handle({ skill: 'test-skill', outcome: 'success' });

      const content = fs.readFileSync(MOCK_ANALYTICS_FILE, 'utf-8');
      const entry = JSON.parse(content.trim());
      assert.strictEqual(entry.skill, 'test-skill');
      assert.strictEqual(entry.outcome, 'success');
    });

    it('should log skill usage with error outcome', async () => {
      await LogPulse.handle({ skill: 'failing-skill', outcome: 'error' });

      const content = fs.readFileSync(MOCK_ANALYTICS_FILE, 'utf-8');
      const entry = JSON.parse(content.trim());
      assert.strictEqual(entry.skill, 'failing-skill');
      assert.strictEqual(entry.outcome, 'error');
    });

    it('should log skill usage with abort outcome', async () => {
      await LogPulse.handle({ skill: 'aborted-skill', outcome: 'abort' });

      const content = fs.readFileSync(MOCK_ANALYTICS_FILE, 'utf-8');
      const entry = JSON.parse(content.trim());
      assert.strictEqual(entry.outcome, 'abort');
    });

    it('should include timestamp in entry', async () => {
      const before = Math.floor(Date.now() / 1000);
      LogPulse.handle({ skill: 'test' });
      const after = Math.floor(Date.now() / 1000);

      const content = fs.readFileSync(MOCK_ANALYTICS_FILE, 'utf-8');
      const entry = JSON.parse(content.trim());
      assert.ok(entry.ts >= before && entry.ts <= after);
    });

    it('should include process ID in entry', async () => {
      LogPulse.handle({ skill: 'test' });

      const content = fs.readFileSync(MOCK_ANALYTICS_FILE, 'utf-8');
      const entry = JSON.parse(content.trim());
      assert.strictEqual(entry.pid, process.pid);
    });
  });

  describe('GetSkillStats', () => {
    it('should have correct name', () => {
      assert.strictEqual(GetSkillStats.name, 'get_skill_stats');
    });

    it('should have valid schema', () => {
      assert.deepStrictEqual(GetSkillStats.schema.properties.period.type, 'string');
      assert.deepStrictEqual(GetSkillStats.schema.properties.period.enum, ['24h', '7d', '30d', 'all']);
    });

    it('should return empty stats for no entries', () => {
      const result = GetSkillStats.handle({ period: '7d' });

      assert.strictEqual(result.content[0].type, 'text');
      const data = JSON.parse(result.content[0].text);
      assert.strictEqual(data.period, '7d');
      assert.deepStrictEqual(data.stats, []);
    });

    it('should return stats for period 7d', () => {
      const now = Math.floor(Date.now() / 1000);
      const entry = { skill: 'test', ts: now - 1000, outcome: 'success' };
      Storage.appendEntrySync(entry);

      const result = GetSkillStats.handle({ period: '7d' });

      const data = JSON.parse(result.content[0].text);
      assert.strictEqual(data.period, '7d');
      assert.strictEqual(data.stats.length, 1);
      assert.strictEqual(data.stats[0].skill, 'test');
    });

    it('should filter entries by period 24h', () => {
      const now = Math.floor(Date.now() / 1000);
      Storage.appendEntrySync({ skill: 'recent', ts: now - 3600, outcome: 'success' });
      Storage.appendEntrySync({ skill: 'old', ts: now - 100_000, outcome: 'success' });

      const result = GetSkillStats.handle({ period: '24h' });

      const data = JSON.parse(result.content[0].text);
      assert.strictEqual(data.stats.length, 1);
      assert.strictEqual(data.stats[0].skill, 'recent');
    });

    it('should include all entries for period all', () => {
      const now = Math.floor(Date.now() / 1000);
      Storage.appendEntrySync({ skill: 'old', ts: now - 10_000_000, outcome: 'success' });
      Storage.appendEntrySync({ skill: 'new', ts: now - 1000, outcome: 'success' });

      const result = GetSkillStats.handle({ period: 'all' });

      const data = JSON.parse(result.content[0].text);
      assert.strictEqual(data.stats.length, 2);
    });

    it('should default to 7d period when not specified', () => {
      const result = GetSkillStats.handle({});

      const data = JSON.parse(result.content[0].text);
      assert.strictEqual(data.period, '7d');
    });

    it('should sort stats by call count descending', () => {
      const now = Math.floor(Date.now() / 1000);
      for (let i = 0; i < 5; i++) {
        Storage.appendEntrySync({ skill: 'skill1', ts: now - i * 100, outcome: 'success' });
      }
      for (let i = 0; i < 2; i++) {
        Storage.appendEntrySync({ skill: 'skill2', ts: now - i * 100, outcome: 'success' });
      }

      const result = GetSkillStats.handle({ period: '7d' });

      const data = JSON.parse(result.content[0].text);
      assert.strictEqual(data.stats[0].skill, 'skill1');
      assert.strictEqual(data.stats[0].calls, 5);
      assert.strictEqual(data.stats[1].skill, 'skill2');
      assert.strictEqual(data.stats[1].calls, 2);
    });

    it('should include outcome counts', () => {
      const now = Math.floor(Date.now() / 1000);
      Storage.appendEntrySync({ skill: 'test', ts: now - 1000, outcome: 'success' });
      Storage.appendEntrySync({ skill: 'test', ts: now - 2000, outcome: 'error' });
      Storage.appendEntrySync({ skill: 'test', ts: now - 3000, outcome: 'abort' });

      const result = GetSkillStats.handle({ period: '7d' });

      const data = JSON.parse(result.content[0].text);
      assert.strictEqual(data.stats[0].calls, 3);
      assert.strictEqual(data.stats[0].success, 1);
      assert.strictEqual(data.stats[0].error, 1);
      assert.strictEqual(data.stats[0].abort, 1);
    });
  });

  describe('ListSkills', () => {
    it('should have correct name', () => {
      assert.strictEqual(ListSkills.name, 'list_skills');
    });

    it('should have empty schema', () => {
      assert.deepStrictEqual(ListSkills.schema.properties, {});
    });

    it('should return empty list when no skills installed', () => {
      const result = ListSkills.handle({});

      const data = JSON.parse(result.content[0].text);
      assert.deepStrictEqual(data, []);
    });

    it('should list all installed skills', () => {
      fs.mkdirSync(path.join(MOCK_SKILLS_DIR, 'skill1'));
      fs.mkdirSync(path.join(MOCK_SKILLS_DIR, 'skill2'));

      const result = ListSkills.handle({});

      const data = JSON.parse(result.content[0].text);
      assert.strictEqual(data.length, 2);
      assert.ok(data.some(s => s.name === 'skill1'));
      assert.ok(data.some(s => s.name === 'skill2'));
    });

    it('should include skill descriptions', () => {
      const skillDir = path.join(MOCK_SKILLS_DIR, 'test-skill');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(
        path.join(skillDir, 'SKILL.md'),
        '---\ndescription:\nTest skill description\n---\n'
      );

      const result = ListSkills.handle({});

      const data = JSON.parse(result.content[0].text);
      const skill = data.find(s => s.name === 'test-skill');
      assert.ok(skill);
      assert.strictEqual(skill.description, 'Test skill description');
    });

    it('should return default description for skills without SKILL.md', () => {
      fs.mkdirSync(path.join(MOCK_SKILLS_DIR, 'no-desc'));

      const result = ListSkills.handle({});

      const data = JSON.parse(result.content[0].text);
      const skill = data.find(s => s.name === 'no-desc');
      assert.ok(skill);
      assert.strictEqual(skill.description, 'No description');
    });

    it('should ignore non-directories in skills folder', () => {
      fs.mkdirSync(path.join(MOCK_SKILLS_DIR, 'real-skill'));
      fs.writeFileSync(path.join(MOCK_SKILLS_DIR, 'not-a-skill.txt'), 'content');

      const result = ListSkills.handle({});

      const data = JSON.parse(result.content[0].text);
      assert.strictEqual(data.length, 1);
      assert.strictEqual(data[0].name, 'real-skill');
    });
  });

  describe('Tool Registry', () => {
    it('should export all tools', () => {
      assert.strictEqual(Tools.length, 3);
      assert.ok(Tools.includes(LogPulse));
      assert.ok(Tools.includes(GetSkillStats));
      assert.ok(Tools.includes(ListSkills));
    });
  });
});
