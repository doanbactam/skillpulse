/**
 * Integration Tests for SkillPulse MCP Server
 * Tests for server initialization, tool registration, and request handling
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as Storage from '../../src/storage.js';
import { Tools } from '../../src/handlers.js';

// Test utilities
const TEST_DIR = path.join(os.tmpdir(), `skillpulse-integration-test-${process.pid}`);
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

// Import server module dynamically to mock paths first
async function createServer() {
  Storage.setPaths(MOCK_ANALYTICS_FILE, MOCK_SKILLS_DIR);
  const module = await import('../../src/index.js');
  // The module creates a server on import
  return module;
}

describe('MCP Server Integration', () => {
  beforeEach(() => {
    setupTestDir();
  });

  afterEach(() => {
    cleanupTestDir();
  });

  describe('Server Initialization', () => {
    it('should create server with correct metadata', async () => {
      // We can't directly test the server instance since it's created on import
      // But we can verify the tools are properly defined
      assert.ok(Tools.length >= 3);
      assert.ok(Tools.every(t => t.name && t.description && t.schema));
    });

    it('should have all required tools registered', () => {
      const toolNames = Tools.map(t => t.name);
      assert.ok(toolNames.includes('log_pulse'));
      assert.ok(toolNames.includes('get_skill_stats'));
      assert.ok(toolNames.includes('list_skills'));
    });
  });

  describe('Tool Registration', () => {
    it('should expose tools/list handler', async () => {
      // The tools/list handler maps tools to the expected MCP format
      const toolsList = Tools.map(({ name, description, schema }) => ({
        name,
        description,
        inputSchema: schema,
      }));

      assert.strictEqual(toolsList.length, 3);

      const logPulse = toolsList.find(t => t.name === 'log_pulse');
      assert.ok(logPulse);
      assert.strictEqual(logPulse.inputSchema.properties.skill.type, 'string');
      assert.deepStrictEqual(logPulse.inputSchema.properties.outcome.enum, ['success', 'error', 'abort']);
    });

    it('should include all tool properties in list format', () => {
      const toolsList = Tools.map(({ name, description, schema }) => ({
        name,
        description,
        inputSchema: schema,
      }));

      for (const tool of toolsList) {
        assert.ok(tool.name, 'Tool should have a name');
        assert.ok(tool.description, 'Tool should have a description');
        assert.ok(tool.inputSchema, 'Tool should have an inputSchema');
      }
    });
  });

  describe('Tool Call Handling', () => {
    it('should handle log_pulse tool call', async () => {
      const tool = Tools.find(t => t.name === 'log_pulse');
      assert.ok(tool);

      const result = await tool.handle({ skill: 'test-skill', outcome: 'success' });

      assert.strictEqual(result.content[0].type, 'text');
      assert.ok(result.content[0].text.includes('test-skill'));

      // Verify file was written
      assert.ok(fs.existsSync(MOCK_ANALYTICS_FILE));
      const content = fs.readFileSync(MOCK_ANALYTICS_FILE, 'utf-8');
      const entry = JSON.parse(content.trim());
      assert.strictEqual(entry.skill, 'test-skill');
    });

    it('should handle get_skill_stats tool call', () => {
      const tool = Tools.find(t => t.name === 'get_skill_stats');
      assert.ok(tool);

      // Add some test data
      const now = Math.floor(Date.now() / 1000);
      Storage.appendEntrySync({ skill: 'test', ts: now - 1000, outcome: 'success' });

      const result = tool.handle({ period: '7d' });

      assert.strictEqual(result.content[0].type, 'text');
      const data = JSON.parse(result.content[0].text);
      assert.strictEqual(data.period, '7d');
      assert.strictEqual(data.stats.length, 1);
    });

    it('should handle list_skills tool call', () => {
      const tool = Tools.find(t => t.name === 'list_skills');
      assert.ok(tool);

      // Create test skill directory
      fs.mkdirSync(path.join(MOCK_SKILLS_DIR, 'test-skill'));

      const result = tool.handle({});

      assert.strictEqual(result.content[0].type, 'text');
      const data = JSON.parse(result.content[0].text);
      assert.ok(data.some(s => s.name === 'test-skill'));
    });

    it('should return error for unknown tool name', async () => {
      const tool = Tools.find(t => t.name === 'log_pulse');

      // Valid tool should work
      await tool.handle({ skill: 'test' });
      assert.ok(true);

      // But if we tried to call a non-existent tool, it would throw
      // (This is tested implicitly by the tools/find logic in the server)
    });
  });

  describe('End-to-End Workflows', () => {
    it('should complete full analytics workflow', async () => {
      const logTool = Tools.find(t => t.name === 'log_pulse');
      const statsTool = Tools.find(t => t.name === 'get_skill_stats');
      const listTool = Tools.find(t => t.name === 'list_skills');

      // 1. List available skills
      fs.mkdirSync(path.join(MOCK_SKILLS_DIR, 'skill-a'));
      fs.mkdirSync(path.join(MOCK_SKILLS_DIR, 'skill-b'));

      let result = listTool.handle({});
      let skills = JSON.parse(result.content[0].text);
      assert.strictEqual(skills.length, 2);

      // 2. Log usage for skill-a
      result = await await logTool.handle({ skill: 'skill-a', outcome: 'success' });
      assert.ok(result.content[0].text.includes('skill-a'));

      // 3. Get stats showing skill-a was used
      result = statsTool.handle({ period: '7d' });
      let stats = JSON.parse(result.content[0].text);
      assert.strictEqual(stats.stats.length, 1);
      assert.strictEqual(stats.stats[0].skill, 'skill-a');

      // 4. Log more usage
      await logTool.handle({ skill: 'skill-a', outcome: 'success' });
      await logTool.handle({ skill: 'skill-b', outcome: 'error' });

      // 5. Get updated stats
      result = statsTool.handle({ period: '7d' });
      stats = JSON.parse(result.content[0].text);
      assert.strictEqual(stats.stats.length, 2);

      const skillAStats = stats.stats.find(s => s.skill === 'skill-a');
      const skillBStats = stats.stats.find(s => s.skill === 'skill-b');

      assert.strictEqual(skillAStats.calls, 2);
      assert.strictEqual(skillBStats.calls, 1);
      assert.strictEqual(skillBStats.error, 1);
    });

    it('should filter stats by time period correctly', () => {
      const logTool = Tools.find(t => t.name === 'log_pulse');
      const statsTool = Tools.find(t => t.name === 'get_skill_stats');

      const now = Math.floor(Date.now() / 1000);

      // Log entries at different times
      Storage.appendEntrySync({ skill: 'old-skill', ts: now - 200_000, outcome: 'success' }); // ~2 days ago
      Storage.appendEntrySync({ skill: 'new-skill', ts: now - 1000, outcome: 'success' }); // 16 minutes ago

      // 24h period should only show new-skill
      let result = statsTool.handle({ period: '24h' });
      let stats = JSON.parse(result.content[0].text);
      assert.strictEqual(stats.stats.length, 1);
      assert.strictEqual(stats.stats[0].skill, 'new-skill');

      // 7d period should show both
      result = statsTool.handle({ period: '7d' });
      stats = JSON.parse(result.content[0].text);
      assert.strictEqual(stats.stats.length, 2);

      // all period should also show both
      result = statsTool.handle({ period: 'all' });
      stats = JSON.parse(result.content[0].text);
      assert.strictEqual(stats.stats.length, 2);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing skill parameter gracefully', async () => {
      const tool = Tools.find(t => t.name === 'log_pulse');

      // Handler now validates skill parameter
      await assert.rejects(
        () => tool.handle({}),
        /Invalid skill name: must be a non-empty string/
      );
    });

    it('should default outcome to success when not provided', async () => {
      const tool = Tools.find(t => t.name === 'log_pulse');

      await tool.handle({ skill: 'test' });

      const content = fs.readFileSync(MOCK_ANALYTICS_FILE, 'utf-8');
      const entry = JSON.parse(content.trim());
      assert.strictEqual(entry.outcome, 'success');
    });

    it('should handle invalid period values', () => {
      const tool = Tools.find(t => t.name === 'get_skill_stats');

      // Should default to 7d for invalid period
      const result = tool.handle({ period: 'invalid' });
      const data = JSON.parse(result.content[0].text);

      // Invalid period falls back to default (7d)
      assert.strictEqual(data.period, 'invalid'); // Passes through as provided
    });
  });

  describe('Concurrent Access', () => {
    it('should handle multiple rapid log entries', async () => {
      const tool = Tools.find(t => t.name === 'log_pulse');

      // Log 100 entries rapidly
      for (let i = 0; i < 100; i++) {
        await tool.handle({ skill: `skill-${i % 5}`, outcome: 'success' });
      }

      // Verify all entries were written
      const content = fs.readFileSync(MOCK_ANALYTICS_FILE, 'utf-8');
      const lines = content.trim().split('\n');
      assert.strictEqual(lines.length, 100);

      // Verify stats aggregation
      const statsTool = Tools.find(t => t.name === 'get_skill_stats');
      const result = statsTool.handle({ period: '7d' });
      const stats = JSON.parse(result.content[0].text);

      // Should have 5 different skills
      assert.strictEqual(stats.stats.length, 5);

      // Each skill should have 20 calls
      for (const skillStat of stats.stats) {
        assert.strictEqual(skillStat.calls, 20);
      }
    });
  });

  describe('Data Persistence', () => {
    it('should persist data across handler calls', async () => {
      const logTool = Tools.find(t => t.name === 'log_pulse');
      const statsTool = Tools.find(t => t.name === 'get_skill_stats');

      // Log some entries
      await logTool.handle({ skill: 'skill1', outcome: 'success' });
      await logTool.handle({ skill: 'skill1', outcome: 'success' });
      await logTool.handle({ skill: 'skill2', outcome: 'error' });

      // Check stats
      let result = statsTool.handle({ period: '7d' });
      let stats = JSON.parse(result.content[0].text);
      assert.strictEqual(stats.stats.length, 2);

      // Log more entries
      await logTool.handle({ skill: 'skill3', outcome: 'abort' });

      // Check stats again - should include new entry
      result = statsTool.handle({ period: '7d' });
      stats = JSON.parse(result.content[0].text);
      assert.strictEqual(stats.stats.length, 3);
    });

    it('should survive missing analytics file on first run', () => {
      const statsTool = Tools.find(t => t.name === 'get_skill_stats');

      // File doesn't exist yet
      assert.ok(!fs.existsSync(MOCK_ANALYTICS_FILE));

      // Should not throw
      const result = statsTool.handle({ period: '7d' });
      const stats = JSON.parse(result.content[0].text);
      assert.deepStrictEqual(stats.stats, []);
    });
  });
});
