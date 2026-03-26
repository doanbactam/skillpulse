/**
 * Test Utilities and Helpers
 * Reusable functions for testing SkillPulse
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as Storage from '../../src/storage.js';

/**
 * Create a temporary test directory with isolated paths
 */
export class TestEnvironment {
  constructor(name = `skillpulse-test-${process.pid}`) {
    this.testDir = path.join(os.tmpdir(), name);
    this.analyticsFile = path.join(this.testDir, 'pulse.jsonl');
    this.skillsDir = path.join(this.testDir, 'skills');
    this.created = false;
  }

  /**
   * Initialize the test environment
   */
  setup() {
    if (this.created) return;

    // Clean up any existing test directory
    this.cleanup();

    // Create fresh directories
    fs.mkdirSync(this.testDir, { recursive: true });
    fs.mkdirSync(this.skillsDir, { recursive: true });

    // Override storage paths
    Storage.setPaths(this.analyticsFile, this.skillsDir);

    this.created = true;
  }

  /**
   * Clean up the test environment
   */
  cleanup() {
    try {
      fs.rmSync(this.testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    } finally {
      Storage.resetPaths();
      this.created = false;
    }
  }

  /**
   * Create a mock skill directory
   */
  createSkill(name, options = {}) {
    const skillDir = path.join(this.skillsDir, name);
    fs.mkdirSync(skillDir, { recursive: true });

    // Create skill.json
    const skillJson = {
      name,
      version: options.version || '1.0.0',
      description: options.description || `Test skill: ${name}`,
    };
    fs.writeFileSync(
      path.join(skillDir, 'skill.json'),
      JSON.stringify(skillJson, null, 2)
    );

    // Create SKILL.md if provided
    if (options.skillMdContent !== undefined) {
      const content = options.skillMdContent === false
        ? ''
        : options.skillMdContent || `---\ndescription:\n${skillJson.description}\n---\n`;
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
    }

    return skillDir;
  }

  /**
   * Add analytics entries
   */
  addEntries(entries) {
    if (!Array.isArray(entries)) {
      entries = [entries];
    }

    for (const entry of entries) {
      const normalized = {
        skill: entry.skill,
        ts: entry.ts ?? Math.floor(Date.now() / 1000),
        outcome: entry.outcome ?? 'success',
        pid: entry.pid ?? process.pid,
      };
      Storage.appendEntrySync(normalized);
    }
  }

  /**
   * Create analytics entries with a time range
   */
  addTimeSeries(skillName, count, options = {}) {
    const {
      start = Date.now() / 1000,
      interval = 100,
      outcome = 'success',
    } = options;

    const entries = [];
    for (let i = 0; i < count; i++) {
      entries.push({
        skill: skillName,
        ts: Math.floor(start - (i * interval)),
        outcome,
      });
    }

    this.addEntries(entries);
    return entries;
  }

  /**
   * Read analytics file content
   */
  readAnalytics() {
    try {
      return fs.readFileSync(this.analyticsFile, 'utf-8');
    } catch {
      return '';
    }
  }

  /**
   * Get analytics entry count
   */
  getAnalyticsCount() {
    const content = this.readAnalytics();
    if (!content) return 0;
    return content.trim().split('\n').filter(l => l).length;
  }
}

/**
 * Analytics entry fixtures
 */
export const Fixtures = {
  /**
   * Create a standard analytics entry
   */
  entry(overrides = {}) {
    return {
      skill: 'test-skill',
      ts: Math.floor(Date.now() / 1000),
      outcome: 'success',
      pid: process.pid,
      ...overrides,
    };
  },

  /**
   * Create multiple entries for the same skill
   */
  entriesFor(skill, count, outcome = 'success') {
    const now = Math.floor(Date.now() / 1000);
    return Array.from({ length: count }, (_, i) => ({
      skill,
      ts: now - (i * 100),
      outcome,
      pid: process.pid,
    }));
  },

  /**
   * Create entries spanning multiple time periods
   */
  timeSeries() {
    const now = Math.floor(Date.now() / 1000);
    return {
      recent: { skill: 'recent', ts: now - 3600, outcome: 'success' },      // 1 hour ago
      today: { skill: 'today', ts: now - 43200, outcome: 'success' },        // 12 hours ago
      week: { skill: 'week', ts: now - 345600, outcome: 'success' },         // 4 days ago
      month: { skill: 'month', ts: now - 1728000, outcome: 'success' },       // 20 days ago
      old: { skill: 'old', ts: now - 10000000, outcome: 'success' },         // ~115 days ago
    };
  },
};

/**
 * Assertion helpers
 */
export const Assert = {
  /**
   * Assert that two arrays have the same contents (order-independent)
   */
  arrayEqual(actual, expected, message = '') {
    const actualSorted = [...actual].sort();
    const expectedSorted = [...expected].sort();
    const isEqual = actualSorted.length === expectedSorted.length &&
      actualSorted.every((val, i) => val === expectedSorted[i]);

    if (!isEqual) {
      throw new Error(
        `Array equality failed${message ? ': ' + message : ''}\n` +
        `Expected: ${JSON.stringify(expectedSorted)}\n` +
        `Actual: ${JSON.stringify(actualSorted)}`
      );
    }
  },

  /**
   * Assert that a file exists
   */
  fileExists(filePath, message = '') {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist${message ? ': ' + message : ''}: ${filePath}`);
    }
  },

  /**
   * Assert that a file does not exist
   */
  fileNotExists(filePath, message = '') {
    if (fs.existsSync(filePath)) {
      throw new Error(`File exists${message ? ': ' + message : ''}: ${filePath}`);
    }
  },

  /**
   * Assert that a JSON file contains valid JSON
   */
  validJson(filePath, message = '') {
    const content = fs.readFileSync(filePath, 'utf-8');
    try {
      JSON.parse(content);
    } catch (error) {
      throw new Error(`Invalid JSON${message ? ': ' + message : ''} in ${filePath}: ${error.message}`);
    }
  },

  /**
   * Assert that a JSONL file contains valid entries
   */
  validJsonl(filePath, message = '') {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l);

    for (let i = 0; i < lines.length; i++) {
      try {
        JSON.parse(lines[i]);
      } catch (error) {
        throw new Error(
          `Invalid JSONL${message ? ': ' + message : ''} at line ${i + 1}: ${error.message}`
        );
      }
    }
  },

  /**
   * Assert that a value is within a range
   */
  inRange(value, min, max, message = '') {
    if (value < min || value > max) {
      throw new Error(
        `Value ${value} not in range [${min}, ${max}]${message ? ': ' + message : ''}`
      );
    }
  },

  /**
   * Assert that a function throws
   */
  throws(fn, expectedError = null, message = '') {
    try {
      fn();
      throw new Error(`Function did not throw${message ? ': ' + message : ''}`);
    } catch (error) {
      if (expectedError && !error.message.includes(expectedError)) {
        throw new Error(
          `Expected error containing "${expectedError}", got "${error.message}"` +
          `${message ? ': ' + message : ''}`
        );
      }
    }
  },
};

/**
 * Time-related helpers
 */
export const Time = {
  /**
   * Get current timestamp in seconds
   */
  now() {
    return Math.floor(Date.now() / 1000);
  },

  /**
   * Get timestamp for N seconds ago
   */
  secondsAgo(n) {
    return this.now() - n;
  },

  /**
   * Get timestamp for N minutes ago
   */
  minutesAgo(n) {
    return this.now() - (n * 60);
  },

  /**
   * Get timestamp for N hours ago
   */
  hoursAgo(n) {
    return this.now() - (n * 3600);
  },

  /**
   * Get timestamp for N days ago
   */
  daysAgo(n) {
    return this.now() - (n * 86400);
  },

  /**
   * Time period constants in seconds
   */
  constants: {
    DAY: 86400,
    WEEK: 604800,
    MONTH: 2592000,
  },
};

/**
 * Mock helpers
 */
export const Mock = {
  /**
   * Create a mock skill directory structure
   */
  skillsList(names, env = new TestEnvironment()) {
    return names.map(name => env.createSkill(name));
  },

  /**
   * Create a mock analytics file with specific entries
   */
  analyticsFile(entries, env = new TestEnvironment()) {
    env.setup();
    env.addEntries(entries);
    return env.analyticsFile;
  },
};

// Export a default test environment instance
export function createTestEnv(name) {
  return new TestEnvironment(name);
}

// Export all utilities
export default {
  TestEnvironment,
  Fixtures,
  Assert,
  Time,
  Mock,
  createTestEnv,
};
