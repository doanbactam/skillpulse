/**
 * MCP Tool Handlers
 * Compound structure - each handler is self-contained with its own schema
 */

import * as Storage from './storage.js';
import { getPeriod } from './periods.js';

// Log pulse tool
export const LogPulse = {
  name: 'log_pulse',
  description: 'Log when a skill is used for SkillPulse analytics',
  schema: {
    type: 'object',
    properties: {
      skill: { type: 'string', description: 'Name of the skill being used' },
      outcome: {
        type: 'string',
        enum: ['success', 'error', 'abort'],
        description: 'Outcome of the skill execution',
      },
    },
    required: ['skill'],
  },
  handle(args) {
    const { skill, outcome = 'success' } = args;
    const entry = {
      skill,
      outcome,
      ts: Math.floor(Date.now() / 1000),
      pid: process.pid,
    };
    Storage.appendEntry(entry);
    return {
      content: [{ type: 'text', text: `Logged usage for skill: ${skill}` }],
    };
  },
};

// Get skill stats tool
export const GetSkillStats = {
  name: 'get_skill_stats',
  description: 'Get skill usage statistics',
  schema: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        enum: ['24h', '7d', '30d', 'all'],
        description: 'Time period for stats',
      },
    },
  },
  handle(args) {
    const { period = '7d' } = args;
    const variant = getPeriod(period);
    const now = Math.floor(Date.now() / 1000);
    const cutoff = variant.cutoff(now);

    const entries = [...Storage.readEntriesSince(cutoff)];
    const stats = Storage.aggregateStats(entries);

    const sorted = Object.entries(stats)
      .map(([skill, data]) => ({ skill, ...data }))
      .sort((a, b) => b.calls - a.calls);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ period, stats: sorted }, null, 2),
      }],
    };
  },
};

// List skills tool
export const ListSkills = {
  name: 'list_skills',
  description: 'List all installed skills with descriptions',
  schema: {
    type: 'object',
    properties: {},
  },
  handle() {
    const skills = [];
    for (const name of Storage.listInstalledSkills()) {
      skills.push({
        name,
        description: Storage.readSkillDescription(name),
      });
    }
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(skills, null, 2),
      }],
    };
  },
};

// Tool registry
export const Tools = [LogPulse, GetSkillStats, ListSkills];
