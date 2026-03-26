/**
 * MCP Tool Handlers
 * Compound structure - each handler is self-contained with its own schema
 */

import * as Storage from './storage.js';
import { getPeriod } from './periods.js';

// Rate limiting configuration
const RATE_LIMIT = {
  maxLogsPerMinute: 100,
  windowMs: 60 * 1000, // 1 minute
};

// In-memory rate limiter (reset per process)
const rateLimiter = new Map();

/**
 * Check rate limit for a given process ID
 * @returns {boolean} true if rate limit exceeded
 */
function checkRateLimit(pid) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT.windowMs;

  // Get or initialize rate limit data for this PID
  let data = rateLimiter.get(pid);
  if (!data) {
    data = { count: 0, resetAt: now + RATE_LIMIT.windowMs };
    rateLimiter.set(pid, data);
  }

  // Reset window if expired
  if (now > data.resetAt) {
    data.count = 0;
    data.resetAt = now + RATE_LIMIT.windowMs;
  }

  // Check and increment
  if (data.count >= RATE_LIMIT.maxLogsPerMinute) {
    return true; // Rate limit exceeded
  }

  data.count++;
  return false;
}

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
  async handle(args) {
    const { skill, outcome = 'success' } = args;

    // Rate limiting check
    if (checkRateLimit(process.pid)) {
      throw new Error(`Rate limit exceeded: maximum ${RATE_LIMIT.maxLogsPerMinute} logs per minute`);
    }

    // Input validation
    if (!skill || typeof skill !== 'string' || !skill.trim()) {
      throw new Error('Invalid skill name: must be a non-empty string');
    }
    // Prevent path traversal attacks
    if (skill.includes('/') || skill.includes('..') || skill.includes('\\')) {
      throw new Error('Invalid skill name: contains invalid characters');
    }
    // Limit skill name length
    if (skill.length > 100) {
      throw new Error('Invalid skill name: exceeds maximum length of 100 characters');
    }

    const entry = {
      skill: skill.trim(),
      outcome,
      ts: Math.floor(Date.now() / 1000),
      pid: process.pid,
    };
    await Storage.appendEntry(entry);
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
