/**
 * Analytics Storage Layer
 * Decoupled from presentation - can swap implementations without changing tools
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import lockfile from 'proper-lockfile';

// Default paths (can be overridden via setPaths for testing)
let _analyticsFile = path.join(os.homedir(), '.claude', 'skills', 'pulse.jsonl');
let _skillsDir = path.join(os.homedir(), '.claude', 'skills');

// Data retention configuration
const RETENTION_CONFIG = {
  maxAgeDays: 90, // Keep entries for 90 days by default
  maxEntries: 100000, // Maximum entries to keep (safety limit)
  cleanupInterval: 100, // Run cleanup every N writes
};

// Write counter for periodic cleanup
let _writeCounter = 0;

export const ANALYTICS_FILE = new Proxy({}, {
  get() { return _analyticsFile; },
  set(_, v) { _analyticsFile = v; return true; }
});
export const SKILLS_DIR = new Proxy({}, {
  get() { return _skillsDir; },
  set(_, v) { _skillsDir = v; return true; }
});

// For testing: override paths
export function setPaths(analyticsFile, skillsDir) {
  if (analyticsFile) _analyticsFile = analyticsFile;
  if (skillsDir) _skillsDir = skillsDir;
}

// For testing: reset to defaults
export function resetPaths() {
  _analyticsFile = path.join(os.homedir(), '.claude', 'skills', 'pulse.jsonl');
  _skillsDir = path.join(os.homedir(), '.claude', 'skills');
}

// Get actual path values (for when proxy might not work in all contexts)
export function getAnalyticsPath() { return _analyticsFile; }
export function getSkillsPath() { return _skillsDir; }

// Ensure directory exists (idempotent)
export function ensureStorage() {
  try {
    fs.mkdirSync(path.dirname(_analyticsFile), { recursive: true });
  } catch (error) {
    // If directory creation fails, we can't continue
    throw new Error(`Failed to create storage directory: ${error.message}`);
  }
}

/**
 * Clean up old entries based on retention policy
 * Removes entries older than maxAgeDays or keeps only maxEntries most recent
 */
export function cleanupOldEntries() {
  try {
    if (!fs.existsSync(_analyticsFile)) return;

    const content = fs.readFileSync(_analyticsFile, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());

    const now = Math.floor(Date.now() / 1000);
    const maxAge = RETENTION_CONFIG.maxAgeDays * 86400; // Convert days to seconds
    const cutoff = now - maxAge;

    // Filter entries: keep if recent or if we need to maintain maxEntries
    const entries = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        entries.push(entry);
      } catch {
        // Skip malformed entries
      }
    }

    // Sort by timestamp descending (newest first)
    entries.sort((a, b) => (b.ts || 0) - (a.ts || 0));

    // Keep entries that are either recent enough or within maxEntries limit
    const filtered = entries.filter((entry, index) =>
      (entry.ts || 0) >= cutoff || index < RETENTION_CONFIG.maxEntries
    );

    // Re-sort back to original order (oldest first for append)
    filtered.sort((a, b) => (a.ts || 0) - (b.ts || 0));

    // Write back only if we actually removed something
    if (filtered.length < entries.length) {
      const cleaned = filtered.map(e => JSON.stringify(e)).join('\n') + '\n';
      fs.writeFileSync(_analyticsFile, cleaned, 'utf8');
      console.error(`SkillPulse: Cleaned up ${entries.length - filtered.length} old entries`);
    }
  } catch (error) {
    console.error(`Failed to cleanup old entries: ${error.message}`);
    // Don't throw - cleanup failure shouldn't break logging
  }
}

/**
 * Set retention configuration
 * @param {Object} config - { maxAgeDays: number, maxEntries: number, cleanupInterval: number }
 */
export function setRetentionConfig(config) {
  if (config.maxAgeDays !== undefined) {
    RETENTION_CONFIG.maxAgeDays = Math.max(1, config.maxAgeDays);
  }
  if (config.maxEntries !== undefined) {
    RETENTION_CONFIG.maxEntries = Math.max(100, config.maxEntries);
  }
  if (config.cleanupInterval !== undefined) {
    RETENTION_CONFIG.cleanupInterval = Math.max(10, config.cleanupInterval);
  }
}

/**
 * Get current retention configuration
 */
export function getRetentionConfig() {
  return { ...RETENTION_CONFIG };
}

// Append a single entry with error handling and file locking
export async function appendEntry(entry) {
  try {
    ensureStorage();
    const line = JSON.stringify(entry) + '\n';

    // Ensure file exists before locking (required by proper-lockfile)
    if (!fs.existsSync(_analyticsFile)) {
      fs.writeFileSync(_analyticsFile, '', 'utf8');
    }

    // Acquire lock with timeout to prevent deadlocks
    const release = await lockfile.lock(_analyticsFile, {
      retries: {
        retries: 5,
        minTimeout: 50,
        maxTimeout: 200,
      },
    });

    try {
      fs.appendFileSync(_analyticsFile, line, 'utf8');
    } finally {
      await release();
    }

    // Periodic cleanup (runs every N writes to avoid overhead)
    _writeCounter++;
    if (_writeCounter >= RETENTION_CONFIG.cleanupInterval) {
      _writeCounter = 0;
      // Run cleanup asynchronously without blocking
      setImmediate(() => cleanupOldEntries());
    }
  } catch (error) {
    // Log error but don't crash the server
    console.error(`Failed to append entry to analytics file: ${error.message}`);
    throw new Error(`Failed to log skill usage: ${error.message}`);
  }
}

// Synchronous wrapper for backward compatibility (used by handlers)
export function appendEntrySync(entry) {
  try {
    ensureStorage();
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(_analyticsFile, line, 'utf8');
  } catch (error) {
    console.error(`Failed to append entry to analytics file: ${error.message}`);
    throw new Error(`Failed to log skill usage: ${error.message}`);
  }
}

// Read entries within time range
export function* readEntriesSince(cutoff) {
  if (!fs.existsSync(_analyticsFile)) return;

  const content = fs.readFileSync(_analyticsFile, 'utf-8');
  for (const line of content.split('\n')) {
    if (!line) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.ts >= cutoff) {
        yield entry;
      }
    } catch {
      // Skip malformed entries
    }
  }
}

// Aggregate stats from entries
export function aggregateStats(entries) {
  const stats = {};
  for (const entry of entries) {
    if (!stats[entry.skill]) {
      stats[entry.skill] = { calls: 0, success: 0, error: 0, abort: 0 };
    }
    stats[entry.skill].calls++;
    if (entry.outcome && stats[entry.skill][entry.outcome] !== undefined) {
      stats[entry.skill][entry.outcome]++;
    }
  }
  return stats;
}

// List installed skills
export function* listInstalledSkills() {
  try {
    const dirs = fs.readdirSync(_skillsDir, { withFileTypes: true });
    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      yield dir.name;
    }
  } catch {
    // Directory doesn't exist or can't be read
    return;
  }
}

// Read skill description
export function readSkillDescription(skillName) {
  const skillFile = path.join(_skillsDir, skillName, 'SKILL.md');
  try {
    const content = fs.readFileSync(skillFile, 'utf-8');
    // Try multiple patterns for different frontmatter formats
    // Pattern 1: description: "text" or description: 'text'
    let match = content.match(/^description:\s*["']([^"']+)["']/m);
    if (match) {
      const desc = match[1].trim().substring(0, 80);
      if (desc && desc !== '---' && desc !== '...') return desc;
    }
    // Pattern 2: description: followed by multiline content
    match = content.match(/^description:\s*\n([\s\S]*?)(?=\n---|\nallowed-tools:|name:|type:|$)/m);
    if (match) {
      const desc = match[1].trim().split('\n')[0].substring(0, 80);
      if (desc && desc !== '---' && desc !== '...') return desc;
    }
  } catch {
    // File doesn't exist or can't be read
  }
  return 'No description';
}
