/**
 * Analytics Storage Layer
 * Decoupled from presentation - can swap implementations without changing tools
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// Default paths (can be overridden via setPaths for testing)
let _analyticsFile = path.join(os.homedir(), '.claude', 'skills', 'pulse.jsonl');
let _skillsDir = path.join(os.homedir(), '.claude', 'skills');

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
  fs.mkdirSync(path.dirname(_analyticsFile), { recursive: true });
}

// Append a single entry
export function appendEntry(entry) {
  ensureStorage();
  fs.appendFileSync(_analyticsFile, JSON.stringify(entry) + '\n');
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
    const match = content.match(/^description:\s*\n([\s\S]*?)(?=\n---|\nallowed-tools:|$)/m);
    if (match) {
      return match[1].trim().split('\n')[0].substring(0, 80);
    }
  } catch {
    // File doesn't exist or can't be read
  }
  return 'No description';
}
