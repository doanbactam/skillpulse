/**
 * Analytics Storage Layer
 * Decoupled from presentation - can swap implementations without changing tools
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

export const ANALYTICS_FILE = path.join(os.homedir(), '.claude', 'skills', 'pulse.jsonl');
export const SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');

// Ensure directory exists (idempotent)
export function ensureStorage() {
  fs.mkdirSync(path.dirname(ANALYTICS_FILE), { recursive: true });
}

// Append a single entry
export function appendEntry(entry) {
  ensureStorage();
  fs.appendFileSync(ANALYTICS_FILE, JSON.stringify(entry) + '\n');
}

// Read entries within time range
export function* readEntriesSince(cutoff) {
  if (!fs.existsSync(ANALYTICS_FILE)) return;

  const content = fs.readFileSync(ANALYTICS_FILE, 'utf-8');
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
  const dirs = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    yield dir.name;
  }
}

// Read skill description
export function readSkillDescription(skillName) {
  const skillFile = path.join(SKILLS_DIR, skillName, 'SKILL.md');
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
