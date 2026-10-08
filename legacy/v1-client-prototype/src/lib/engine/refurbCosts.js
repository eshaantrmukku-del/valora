/**
 * Rule-based refurb cost engine.
 * Vision / text only classify condition — this module prices it.
 * Never invents prices outside the fixed tables.
 */

/** Cost bands for classified room/item condition (UK mid-market, illustrative). */
export const ROOM_COST_TABLE = {
  kitchen: {
    Poor: [8000, 15000],
    Average: [3000, 6000],
    Good: [0, 0],
    Unknown: [0, 0],
  },
  bathroom: {
    Poor: [4000, 8000],
    Average: [1500, 3500],
    Good: [0, 0],
    Unknown: [0, 0],
  },
  flooring: {
    'Needs replacing': [2500, 5000],
    Poor: [2500, 5000],
    Average: [800, 1800],
    Good: [0, 0],
    Unknown: [0, 0],
  },
  decorating: {
    Required: [1500, 3500],
    Poor: [1500, 3500],
    Average: [600, 1200],
    Good: [0, 0],
    Unknown: [0, 0],
  },
  walls: {
    Poor: [2000, 5000],
    Average: [800, 2000],
    Good: [0, 0],
    Unknown: [0, 0],
  },
  windows: {
    Poor: [4000, 10000],
    Average: [0, 2000],
    Good: [0, 0],
    Unknown: [0, 0],
  },
  roof: {
    Poor: [8000, 20000],
    Average: [0, 3000],
    Good: [0, 0],
    Unknown: [0, 0],
  },
  garden: {
    Poor: [1500, 5000],
    Average: [500, 1500],
    Good: [0, 0],
    Unknown: [0, 0],
  },
  external: {
    Poor: [3000, 8000],
    Average: [800, 2500],
    Good: [0, 0],
    Unknown: [0, 0],
  },
  general: {
    Poor: [15000, 30000],
    Fair: [4000, 9000],
    Average: [4000, 9000],
    Good: [0, 0],
    Unknown: [0, 0],
  },
};

const LEVEL_RANK = { Poor: 3, Fair: 2, Average: 2, 'Needs replacing': 3, Required: 3, Good: 1, Unknown: 0 };

export function levelRank(level) {
  return LEVEL_RANK[level] || 0;
}

export function worseLevel(a, b) {
  return levelRank(a) >= levelRank(b) ? a : b;
}

/**
 * Convert structured room ratings into a cost range.
 * @param {Record<string, string>} rooms
 */
export function costsFromRooms(rooms = {}) {
  let low = 0;
  let high = 0;
  const lineItems = [];

  for (const [room, rating] of Object.entries(rooms)) {
    if (!rating || rating === 'Unknown' || rating === 'Good') continue;
    const table = ROOM_COST_TABLE[room];
    if (!table) continue;
    const band = table[rating] || table.Poor;
    if (!band || (band[0] === 0 && band[1] === 0)) continue;
    low += band[0];
    high += band[1];
    lineItems.push({
      room,
      rating,
      low: band[0],
      high: band[1],
    });
  }

  return { refurbLow: low, refurbHigh: high, lineItems };
}

export function overallFromRooms(rooms = {}) {
  const ranks = Object.values(rooms).map(levelRank).filter((r) => r > 0);
  if (!ranks.length) return 'Unknown';
  const worst = Math.max(...ranks);
  if (worst >= 3) return 'Poor';
  if (worst >= 2) return 'Fair';
  return 'Good';
}
