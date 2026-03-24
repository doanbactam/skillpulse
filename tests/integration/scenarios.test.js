/**
 * Integration Scenarios Tests
 * Real-world usage patterns and workflows
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as Storage from '../../src/storage.js';
import { LogPulse, GetSkillStats, ListSkills } from '../../src/handlers.js';

// Test utilities
const TEST_DIR = path.join(os.tmpdir(), `skillpulse-scenarios-test-${process.pid}`);
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

describe('Integration Scenarios', () => {
  beforeEach(setupTestDir);
  afterEach(cleanupTestDir);

  describe('Daily Workflow Scenario', () => {
    it('should track typical daily skill usage', () => {
      const now = Date.now() / 1000;
      const dayAgo = now - 86400;

      // User starts their day
      // 1. Uses /careful before a destructive operation
      LogPulse.handle({ skill: 'careful', outcome: 'success' });

      // 2. Does some development with /browse
      for (let i = 0; i < 5; i++) {
        LogPulse.handle({
          skill: 'browse',
          ts: now - Random(0, 3600),
          outcome: 'success',
        });
      }

      // 3. Runs tests with /qa
      LogPulse.handle({ skill: 'qa', outcome: 'success' });
      LogPulse.handle({ skill: 'qa', outcome: 'error' }); // Found bugs
      LogPulse.handle({ skill: 'qa', outcome: 'success' }); // Bugs fixed

      // 4. Reviews code with /review
      LogPulse.handle({ skill: 'review', outcome: 'success' });

      // Check daily stats
      const stats = GetSkillStats.handle({ period: '24h' });
      const data = JSON.parse(stats.content[0].text);

      assert.ok(data.stats.some(s => s.skill === 'browse' && s.calls >= 5));
      assert.ok(data.stats.some(s => s.skill === 'qa' && s.calls === 3));
      assert.ok(data.stats.some(s => s.skill === 'qa' && s.error === 1));
    });

    it('should show skill discovery pattern', () => {
      const skills = [
        'careful', 'freeze', 'qa', 'review', 'browse',
        'baseline-ui', 'shadcn', 'frontend-design',
      ];

      // Create skill directories
      for (const skill of skills) {
        const skillDir = path.join(MOCK_SKILLS_DIR, skill);
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(
          path.join(skillDir, 'skill.json'),
          JSON.stringify({ name: skill, version: '1.0.0' })
        );
      }

      // User uses some skills
      const usedSkills = ['qa', 'review', 'browse'];
      for (const skill of usedSkills) {
        for (let i = 0; i < Random(2, 10); i++) {
          LogPulse.handle({ skill, outcome: 'success' });
        }
      }

      // Get stats to discover unused skills
      const stats = GetSkillStats.handle({ period: '7d' });
      const data = JSON.parse(stats.content[0].text);

      const usedSkillNames = data.stats.map(s => s.skill);
      const allSkills = [...Storage.listInstalledSkills()];

      // Find unused skills
      const unused = allSkills.filter(s => !usedSkillNames.includes(s) && s !== 'pulse');

      assert.ok(unused.length > 0, 'Should have some unused skills to discover');
    });
  });

  describe('Skill Cleanup Workflow', () => {
    it('should identify candidates for removal', () => {
      const now = Date.now() / 1000;
      const weekAgo = now - 604800;

      // Setup: 10 skills installed
      const allSkills = ['skill1', 'skill2', 'skill3', 'skill4', 'skill5',
                        'skill6', 'skill7', 'skill8', 'skill9', 'skill10'];

      for (const skill of allSkills) {
        const skillDir = path.join(MOCK_SKILLS_DIR, skill);
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(
          path.join(skillDir, 'skill.json'),
          JSON.stringify({ name: skill, version: '1.0.0' })
        );
      }

      // Only 3 skills have been used in the past week
      const activeSkills = ['skill1', 'skill2', 'skill3'];
      for (const skill of activeSkills) {
        const calls = Random(5, 20);
        for (let i = 0; i < calls; i++) {
          LogPulse.handle({
            skill,
            ts: now - Random(0, 604800),
            outcome: 'success',
          });
        }
      }

      // skill4 was used but only a month ago (not in past week)
      for (let i = 0; i < 5; i++) {
        LogPulse.handle({
          skill: 'skill4',
          ts: now - Random(604800, 2592000),
          outcome: 'success',
        });
      }

      // Check 7d stats
      const stats = GetSkillStats.handle({ period: '7d' });
      const data = JSON.parse(stats.content[0].text);

      const usedInWeek = data.stats.map(s => s.skill);
      assert.strictEqual(usedInWeek.length, 3);
      assert.ok(usedInWeek.includes('skill1'));
      assert.ok(!usedInWeek.includes('skill4')); // Used but not in 7d window

      // Recommendation: skills 5-10 have never been used
      // skill4 hasn't been used in a week
    });

    it('should track outcome patterns for quality assessment', () => {
      // Skill with high error rate
      for (let i = 0; i < 10; i++) {
        LogPulse.handle({
          skill: 'buggy-skill',
          ts: Date.now() / 1000 - i * 100,
          outcome: i < 7 ? 'error' : 'success', // 70% error rate
        });
      }

      // Reliable skill
      for (let i = 0; i < 10; i++) {
        LogPulse.handle({
          skill: 'reliable-skill',
          ts: Date.now() / 1000 - i * 100,
          outcome: 'success',
        });
      }

      const stats = GetSkillStats.handle({ period: '7d' });
      const data = JSON.parse(stats.content[0].text);

      const buggy = data.stats.find(s => s.skill === 'buggy-skill');
      const reliable = data.stats.find(s => s.skill === 'reliable-skill');

      assert.strictEqual(buggy.error, 7);
      assert.strictEqual(buggy.success, 3);
      assert.strictEqual(reliable.success, 10);
      assert.strictEqual(reliable.error, undefined);

      // Calculate error rates
      const buggyErrorRate = buggy.error / buggy.calls;
      const reliableErrorRate = (reliable.error || 0) / reliable.calls;

      assert.ok(buggyErrorRate > reliableErrorRate);
    });
  });

  describe('Time-Based Analysis', () => {
    it('should compare usage across time periods', () => {
      const now = Date.now() / 1000;

      // Old favorites (used a lot in the past month)
      const oldSkills = ['legacy-tool', 'old-helper'];
      for (const skill of oldSkills) {
        for (let i = 0; i < 50; i++) {
          LogPulse.handle({
            skill,
            ts: now - Random(604800, 2592000), // 1-4 weeks ago
            outcome: 'success',
          });
        }
      }

      // Current favorites (used recently)
      const newSkills = ['new-tool', 'modern-helper'];
      for (const skill of newSkills) {
        for (let i = 0; i < 30; i++) {
          LogPulse.handle({
            skill,
            ts: now - Random(0, 604800), // Past week
            outcome: 'success',
          });
        }
      }

      // Compare 7d vs 30d stats
      const stats7d = GetSkillStats.handle({ period: '7d' });
      const stats30d = GetSkillStats.handle({ period: '30d' });

      const data7d = JSON.parse(stats7d.content[0].text);
      const data30d = JSON.parse(stats30d.content[0].text);

      const recentTop = data7d.stats[0];
      const monthTop = data30d.stats[0];

      // Top skill in 7d should be from new skills
      assert.ok(newSkills.includes(recentTop.skill));

      // Top skill in 30d should have more calls than in 7d
      assert.ok(monthTop.calls >= recentTop.calls);
    });

    it('should detect trending skills', () => {
      const now = Date.now() / 1000;

      // Trending: used more in last 24h than average
      const trendingSkill = 'hot-new-tool';
      // Base usage: 5 calls per day for past week
      for (let day = 1; day <= 6; day++) {
        for (let i = 0; i < 5; i++) {
          LogPulse.handle({
            skill: trendingSkill,
            ts: now - (day * 86400) - (i * 1000),
            outcome: 'success',
          });
        }
      }
      // Today: 20 calls
      for (let i = 0; i < 20; i++) {
        LogPulse.handle({
          skill: trendingSkill,
          ts: now - (i * 100),
          outcome: 'success',
        });
      }

      // Steady skill: consistent usage
      const steadySkill = 'reliable-tool';
      for (let day = 0; day <= 6; day++) {
        for (let i = 0; i < 10; i++) {
          LogPulse.handle({
            skill: steadySkill,
            ts: now - (day * 86400) - (i * 1000),
            outcome: 'success',
          });
        }
      }

      const stats24h = GetSkillStats.handle({ period: '24h' });
      const stats7d = GetSkillStats.handle({ period: '7d' });

      const data24h = JSON.parse(stats24h.content[0].text);
      const data7d = JSON.parse(stats7d.content[0].text);

      const trending24h = data24h.stats.find(s => s.skill === trendingSkill);
      const steady24h = data24h.stats.find(s => s.skill === steadySkill);

      // Trending skill should be top in 24h
      assert.ok(trending24h.calls > steady24h.calls);
    });
  });

  describe('Multi-Skill Session', () => {
    it('should track a complex development session', () => {
      const sessionStart = Date.now() / 1000;

      // Session: Debug a failing test
      // 1. Use /investigate to understand the issue
      LogPulse.handle({ skill: 'investigate', outcome: 'success', ts: sessionStart });

      // 2. Try multiple fixes (some fail)
      LogPulse.handle({ skill: 'freeze', outcome: 'success', ts: sessionStart + 10 });
      LogPulse.handle({ skill: 'careful', outcome: 'success', ts: sessionStart + 20 });
      LogPulse.handle({ skill: 'browse', outcome: 'error', ts: sessionStart + 30 }); // Test failed
      LogPulse.handle({ skill: 'browse', outcome: 'success', ts: sessionStart + 40 }); // Retry passed
      LogPulse.handle({ skill: 'qa', outcome: 'success', ts: sessionStart + 50 }); // Full QA pass
      LogPulse.handle({ skill: 'review', outcome: 'success', ts: sessionStart + 60 }); // Review changes

      // Analyze the session
      const stats = GetSkillStats.handle({ period: '7d' });
      const data = JSON.parse(stats.content[0].text);

      assert.ok(data.stats.length >= 5); // At least 5 different skills used

      // Check that browse has both success and error
      const browseStats = data.stats.find(s => s.skill === 'browse');
      assert.ok(browseStats);
      assert.strictEqual(browseStats.calls, 2);
      assert.strictEqual(browseStats.error, 1);
      assert.strictEqual(browseStats.success, 1);
    });

    it('should handle concurrent skill usage patterns', () => {
      const now = Date.now() / 1000;

      // Simulate working on multiple features
      const features = ['feature-a', 'feature-b', 'feature-c'];
      const commonSkills = ['browse', 'freeze', 'careful'];

      for (const feature of features) {
        // Each feature uses common skills plus its own
        for (const skill of [...commonSkills, feature]) {
          const calls = Random(2, 5);
          for (let i = 0; i < calls; i++) {
            LogPulse.handle({
              skill,
              ts: now - Random(0, 86400),
              outcome: RandomOneOf(['success', 'success', 'success', 'error']),
            });
          }
        }
      }

      const stats = GetSkillStats.handle({ period: '24h' });
      const data = JSON.parse(stats.content[0].text);

      // Common skills should have more calls
      const browseStats = data.stats.find(s => s.skill === 'browse');
      const featureAStats = data.stats.find(s => s.skill === 'feature-a');

      assert.ok(browseStats.calls > featureAStats.calls);
    });
  });

  describe('Data Migration Scenarios', () => {
    it('should handle existing analytics file on upgrade', () => {
      const oldFormatEntries = [
        { skill: 'old-skill', ts: Date.now() / 1000 - 1000000, outcome: 'success' },
        { skill: 'another-old', ts: Date.now() / 1000 - 500000, outcome: 'error' },
      ];

      // Simulate existing file (before "upgrade")
      for (const entry of oldFormatEntries) {
        Storage.appendEntry(entry);
      }

      // After "upgrade", new entries are added
      const newFormatEntries = [
        { skill: 'new-skill', ts: Date.now() / 1000 - 1000, outcome: 'success', pid: 12345 },
      ];

      for (const entry of newFormatEntries) {
        Storage.appendEntry(entry);
      }

      // Should read all entries regardless of format version
      const entries = [...Storage.readEntriesSince(0)];

      assert.ok(entries.length >= 3);
      assert.ok(entries.some(e => e.skill === 'old-skill'));
      assert.ok(entries.some(e => e.skill === 'new-skill'));
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('should continue working after partial corruption', () => {
      // Write some valid entries
      for (let i = 0; i < 5; i++) {
        Storage.appendEntry({
          skill: `skill-${i}`,
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      // Append some corrupted data
      fs.appendFileSync(MOCK_ANALYTICS_FILE, 'corrupted line\n{invalid json\n');

      // Continue with valid entries
      for (let i = 5; i < 10; i++) {
        Storage.appendEntry({
          skill: `skill-${i}`,
          ts: Date.now() / 1000 - i,
          outcome: 'success',
        });
      }

      // Should read only valid entries
      const entries = [...Storage.readEntriesSince(0)];

      assert.strictEqual(entries.length, 10);
    });

    it('should recover from missing directory', () => {
      // Remove analytics directory
      fs.rmSync(path.dirname(MOCK_ANALYTICS_FILE), { recursive: true, force: true });

      // Should recreate and work
      Storage.appendEntry({
        skill: 'test',
        ts: Date.now() / 1000,
        outcome: 'success',
      });

      assert.ok(fs.existsSync(MOCK_ANALYTICS_FILE));

      const entries = [...Storage.readEntriesSince(0)];
      assert.strictEqual(entries.length, 1);
    });
  });

  describe('Cross-Tool Integration', () => {
    it('should list skills with descriptions', () => {
      // Create skills with descriptions
      const skills = [
        { name: 'careful', desc: 'Safety guardrails' },
        { name: 'freeze', desc: 'Scope limiter' },
        { name: 'qa', desc: 'QA testing' },
      ];

      for (const { name, desc } of skills) {
        const skillDir = path.join(MOCK_SKILLS_DIR, name);
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(
          path.join(skillDir, 'SKILL.md'),
          `---\ndescription:\n${desc}\n---\n`
        );
      }

      // List skills
      const result = ListSkills.handle({});
      const data = JSON.parse(result.content[0].text);

      assert.ok(Array.isArray(data));
      assert.ok(data.length >= 3);

      for (const { name, desc } of skills) {
        const skill = data.find(s => s.name === name);
        assert.ok(skill);
        assert.ok(skill.description.includes(desc.split(' ')[0]));
      }
    });

    it('should correlate usage with descriptions', () => {
      // Setup skills
      const skills = [
        { name: 'frequently-used', desc: 'Used often' },
        { name: 'rarely-used', desc: 'Used rarely' },
      ];

      for (const { name, desc } of skills) {
        const skillDir = path.join(MOCK_SKILLS_DIR, name);
        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(
          path.join(skillDir, 'SKILL.md'),
          `---\ndescription:\n${desc}\n---\n`
        );
      }

      // Use them unevenly
      for (let i = 0; i < 20; i++) {
        LogPulse.handle({ skill: 'frequently-used', outcome: 'success' });
      }
      LogPulse.handle({ skill: 'rarely-used', outcome: 'success' });

      // Get stats
      const stats = GetSkillStats.handle({ period: '7d' });
      const statsData = JSON.parse(stats.content[0].text);

      // Get list with descriptions
      const list = ListSkills.handle({});
      const listData = JSON.parse(list.content[0].text);

      // Correlate
      const frequentWithDesc = listData.find(s => s.name === 'frequently-used');
      assert.ok(frequentWithDesc);
      assert.ok(frequentWithDesc.description);

      const frequentStats = statsData.stats.find(s => s.skill === 'frequently-used');
      assert.ok(frequentStats.calls >= 20);
    });
  });
});

// Helper function for random integers
function Random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Helper function for random item from array
function RandomOneOf(array) {
  return array[Random(0, array.length - 1)];
}
