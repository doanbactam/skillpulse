/**
 * CLI Snapshot Tests
 * Tests for CLI output consistency and visual regression
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Snapshot storage directory
const SNAPSHOT_DIR = path.join(os.tmpdir(), 'skillpulse-snapshots');

describe('CLI Snapshot Tests', () => {
  let testHome;
  let analyticsFile;
  let skillsDir;

  beforeEach(() => {
    testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'skillpulse-snapshot-'));
    analyticsFile = path.join(testHome, '.claude', 'skills', 'pulse.jsonl');
    skillsDir = path.join(testHome, '.claude', 'skills');
  });

  afterEach(() => {
    fs.rmSync(testHome, { recursive: true, force: true });
  });

  /**
   * Run the pulse CLI script and return output
   */
  function runPulse(args = '7d') {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(process.cwd(), 'skills', 'pulse', 'bin', 'pulse.sh');

      const proc = spawn('bash', [scriptPath, args], {
        env: { ...process.env, HOME: testHome },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr, code });
        } else {
          reject(new Error(`CLI exited with code ${code}: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  /**
   * Create mock skill directories
   */
  function createMockSkills(skills) {
    for (const skill of skills) {
      const skillDir = path.join(skillsDir, skill.name);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, 'skill.json'),
        JSON.stringify({ name: skill.name, version: '1.0.0' })
      );
      if (skill.description) {
        fs.writeFileSync(
          path.join(skillDir, 'SKILL.md'),
          `---\ndescription:\n${skill.description}\n---\n`
        );
      }
    }
  }

  /**
   * Add analytics entries
   */
  function addAnalytics(entries) {
    fs.mkdirSync(path.dirname(analyticsFile), { recursive: true });
    for (const entry of entries) {
      fs.appendFileSync(analyticsFile, JSON.stringify(entry) + '\n');
    }
  }

  describe('Empty State Snapshots', () => {
    it('should show empty analytics correctly', async () => {
      createMockSkills([
        { name: 'skill1', description: 'First skill' },
        { name: 'skill2', description: 'Second skill' },
      ]);

      const { stdout } = await runPulse('7d');

      // Verify key elements are present
      assert.ok(stdout.includes('SkillPulse'));
      assert.ok(stdout.includes('0 used'));
      assert.ok(stdout.includes('2 unused') || stdout.includes('Cold'));
      assert.ok(stdout.includes('╭'));
      assert.ok(stdout.includes('╰'));
    });

    it('should show correct period labels', async () => {
      createMockSkills([]);

      const todayOutput = await runPulse('24h');
      const weekOutput = await runPulse('7d');
      const allOutput = await runPulse('all');

      assert.ok(todayOutput.stdout.includes('today'));
      assert.ok(weekOutput.stdout.includes('7 days'));
      assert.ok(allOutput.stdout.includes('all time'));
    });
  });

  describe('Populated State Snapshots', () => {
    it('should show skill usage correctly', async () => {
      const now = Math.floor(Date.now() / 1000);

      createMockSkills([
        { name: 'frequently-used', description: 'Used often' },
        { name: 'rarely-used', description: 'Used rarely' },
      ]);

      addAnalytics([
        { skill: 'frequently-used', ts: now - 1000, outcome: 'success' },
        { skill: 'frequently-used', ts: now - 2000, outcome: 'success' },
        { skill: 'frequently-used', ts: now - 3000, outcome: 'success' },
        { skill: 'rarely-used', ts: now - 4000, outcome: 'success' },
      ]);

      const { stdout } = await runPulse('7d');

      assert.ok(stdout.includes('2 used'));
      assert.ok(stdout.includes('frequently-used'));
      assert.ok(stdout.includes('3 calls')); // Top skill shows 3 calls
    });

    it('should show bar visualization', async () => {
      const now = Math.floor(Date.now() / 1000);

      createMockSkills([{ name: 'test', description: 'Test' }]);

      // Add enough calls to show bar
      for (let i = 0; i < 10; i++) {
        addAnalytics([{ skill: 'test', ts: now - i * 100, outcome: 'success' }]);
      }

      const { stdout } = await runPulse('7d');

      // Check for bar character
      assert.ok(stdout.includes('█'));
    });
  });

  describe('ASCII Box Consistency', () => {
    it('should render complete ASCII box', async () => {
      createMockSkills([]);

      const { stdout } = await runPulse('7d');

      // All box characters should be present
      const boxChars = ['╭', '╮', '╰', '╯', '│', '─'];
      for (const char of boxChars) {
        assert.ok(stdout.includes(char), `Missing box character: ${char}`);
      }
    });

    it('should have balanced box characters', async () => {
      createMockSkills([]);

      const { stdout } = await runPulse('7d');

      // Count opening and closing chars
      const topLeft = (stdout.match(/╭/g) || []).length;
      const topRight = (stdout.match(/╮/g) || []).length;
      const bottomLeft = (stdout.match(/╰/g) || []).length;
      const bottomRight = (stdout.match(/╯/g) || []).length;

      // Should have balanced corners
      assert.strictEqual(topLeft, bottomLeft, 'Top-left and bottom-left count mismatch');
      assert.strictEqual(topRight, bottomRight, 'Top-right and bottom-right count mismatch');
    });
  });

  describe('Output Format Consistency', () => {
    it('should maintain consistent skill name format', async () => {
      const now = Math.floor(Date.now() / 1000);

      createMockSkills([
        { name: 'very-long-skill-name-here', description: 'Long name' },
        { name: 'short', description: 'Short' },
      ]);

      addAnalytics([
        { skill: 'very-long-skill-name-here', ts: now - 1000, outcome: 'success' },
        { skill: 'short', ts: now - 2000, outcome: 'success' },
      ]);

      const { stdout } = await runPulse('7d');

      // Skills should be prefixed with /
      assert.ok(stdout.includes('/very-long-skill-name-here'));
      assert.ok(stdout.includes('/short'));
    });

    it('should format numbers consistently', async () => {
      const now = Math.floor(Date.now() / 1000);

      createMockSkills([{ name: 'test', description: 'Test' }]);

      // Create various call counts
      for (let i = 0; i < 99; i++) {
        addAnalytics([{ skill: 'test', ts: now - i * 100, outcome: 'success' }]);
      }

      const { stdout } = await runPulse('7d');

      // Should show "99 calls" not "99 call" or other format
      assert.ok(stdout.includes('99 calls'));
    });
  });

  describe('Help Text Consistency', () => {
    it('should always show help tips at bottom', async () => {
      createMockSkills([]);

      const { stdout } = await runPulse('7d');

      // Help sections should be present
      assert.ok(stdout.includes('Remove unused'));
      assert.ok(stdout.includes('Usage:'));
    });

    it('should show correct usage format', async () => {
      createMockSkills([]);

      const { stdout } = await runPulse('7d');

      // Should show period options
      assert.ok(stdout.includes('[24h|7d|30d|all]'));
    });
  });

  describe('Cold Section', () => {
    it('should list unused skills', async () => {
      createMockSkills([
        { name: 'unused1', description: 'Not used' },
        { name: 'unused2', description: 'Also not used' },
        { name: 'used1', description: 'Used' },
      ]);

      addAnalytics([
        { skill: 'used1', ts: Date.now() / 1000 - 1000, outcome: 'success' },
      ]);

      const { stdout } = await runPulse('7d');

      assert.ok(stdout.includes('Cold'));
      assert.ok(stdout.includes('/unused1') || stdout.includes('/unused2'));
    });

    it('should truncate many unused skills', async () => {
      const unusedSkills = Array.from({ length: 10 }, (_, i) => ({
        name: `unused${i}`,
        description: `Skill ${i}`,
      }));

      createMockSkills([...unusedSkills, { name: 'used', description: 'Used' }]);

      addAnalytics([
        { skill: 'used', ts: Date.now() / 1000 - 1000, outcome: 'success' },
      ]);

      const { stdout } = await runPulse('7d');

      // Should show truncation message
      assert.ok(stdout.includes('more'));
    });
  });

  describe('Ranking Display', () => {
    it('should rank skills by call count descending', async () => {
      const now = Math.floor(Date.now() / 1000);

      createMockSkills([
        { name: 'top', description: 'Most used' },
        { name: 'middle', description: 'Middle' },
        { name: 'bottom', description: 'Least used' },
      ]);

      // Add different call counts
      addAnalytics([
        { skill: 'bottom', ts: now - 1000, outcome: 'success' },
        { skill: 'top', ts: now - 2000, outcome: 'success' },
        { skill: 'top', ts: now - 3000, outcome: 'success' },
        { skill: 'top', ts: now - 4000, outcome: 'success' },
        { skill: 'middle', ts: now - 5000, outcome: 'success' },
        { skill: 'middle', ts: now - 6000, outcome: 'success' },
      ]);

      const { stdout } = await runPulse('7d');

      // Find positions of skills in output
      const topPos = stdout.indexOf('top');
      const middlePos = stdout.indexOf('middle');
      const bottomPos = stdout.indexOf('bottom');

      // Top should appear before middle, middle before bottom
      assert.ok(topPos < middlePos, 'Top skill should appear before middle');
      assert.ok(middlePos < bottomPos, 'Middle skill should appear before bottom');
    });
  });

  describe('Error Handling Output', () => {
    it('should handle missing analytics gracefully', async () => {
      createMockSkills([]);

      // Don't create analytics file
      const { stdout } = await runPulse('7d');

      // Should not crash, should show empty state
      assert.ok(stdout.includes('SkillPulse'));
      assert.ok(stdout.includes('0 used'));
    });

    it('should handle malformed analytics gracefully', async () => {
      createMockSkills([]);

      // Create file with some bad data
      fs.mkdirSync(path.dirname(analyticsFile), { recursive: true });
      fs.writeFileSync(analyticsFile, 'invalid line\n{"skill":"valid","ts":123}\nmore invalid\n');

      const { stdout } = await runPulse('7d');

      // Should show valid entries
      assert.ok(stdout.includes('valid'));
    });
  });

  describe('Output Stability', () => {
    it('should produce consistent output for same input', async () => {
      const now = Math.floor(Date.now() / 1000);

      createMockSkills([{ name: 'test', description: 'Test skill' }]);
      addAnalytics([
        { skill: 'test', ts: now - 1000, outcome: 'success' },
        { skill: 'test', ts: now - 2000, outcome: 'success' },
      ]);

      const output1 = await runPulse('7d');
      const output2 = await runPulse('7d');

      // Outputs should be identical
      assert.strictEqual(output1.stdout, output2.stdout);
    });

    it('should handle different periods correctly', async () => {
      const now = Math.floor(Date.now() / 1000);

      createMockSkills([{ name: 'test', description: 'Test' }]);

      // Recent entry
      addAnalytics([{ skill: 'test', ts: now - 1000, outcome: 'success' }]);

      // Old entry (outside 24h)
      addAnalytics([{ skill: 'test', ts: now - 100000, outcome: 'success' }]);

      const output24h = await runPulse('24h');
      const outputAll = await runPulse('all');

      // 24h should show 1 call, all should show 2
      assert.ok(output24h.stdout.includes('1 calls'));
      assert.ok(outputAll.stdout.includes('2 calls'));
    });
  });

  describe('Visual Regression', () => {
    it('should maintain box width consistency', async () => {
      createMockSkills([]);

      const { stdout } = await runPulse('7d');

      const lines = stdout.split('\n');
      const boxLines = lines.filter(line => line.includes('│'));

      // All box lines should have same length (fixed width)
      if (boxLines.length > 0) {
        const expectedLength = boxLines[0].length;
        for (const line of boxLines) {
          // Allow some tolerance for trailing whitespace differences
          assert.ok(
            Math.abs(line.length - expectedLength) <= 1,
            `Line length mismatch: expected ${expectedLength}, got ${line.length}`
          );
        }
      }
    });

    it('should not have broken box characters', async () => {
      createMockSkills([]);

      const { stdout } = await runPulse('7d');

      // Check for common broken character patterns
      assert.ok(!stdout.includes('??'), 'Should not have broken characters');
      assert.ok(!stdout.includes('  '), 'Should not have double spaces (except indentation)');
    });
  });
});
