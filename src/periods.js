/**
 * Period Variants
 * Explicit period handlers instead of switch/case with magic strings
 */

const SECONDS = {
  DAY: 86400,
  WEEK: 604800,
  MONTH: 2592000,
};

// Period variant: Today (24 hours)
export const Today = {
  name: '24h',
  label: 'today',
  cutoff: (now) => now - SECONDS.DAY,
};

// Period variant: This week (7 days)
export const Week = {
  name: '7d',
  label: '7 days',
  cutoff: (now) => now - SECONDS.WEEK,
};

// Period variant: This month (30 days)
export const Month = {
  name: '30d',
  label: '30 days',
  cutoff: (now) => now - SECONDS.MONTH,
};

// Period variant: All time
export const AllTime = {
  name: 'all',
  label: 'all time',
  cutoff: () => 0,
};

// Period registry for lookup
export const Periods = {
  '24h': Today,
  '7d': Week,
  '30d': Month,
  'all': AllTime,
  // Aliases
  today: Today,
  week: Week,
  month: Month,
  ever: AllTime,
};

// Get period variant, defaulting to Week
export function getPeriod(key = '7d') {
  return Periods[key] ?? Week;
}
