// Pure quiz logic. No DOM here, and randomness is passed in, so all of it can be tested in Node.

const CLICK_TOLERANCE = 1.5; // grid units; forgives a click that lands on the room's outline
const UNSEEN_WEIGHT = 3;

function distanceToRect({ x, y }, [left, top, width, height]) {
  const dx = Math.max(left - x, 0, x - (left + width));
  const dy = Math.max(top - y, 0, y - (top + height));
  return Math.hypot(dx, dy);
}

export function roomAt(point, rooms) {
  return rooms.find((room) => room.rects.some((rect) => distanceToRect(point, rect) === 0)) ?? null;
}

export function judgeClick(point, target) {
  return target.rects.some((rect) => distanceToRect(point, rect) <= CLICK_TOLERANCE);
}

export function weight(stats) {
  if (!stats || stats.hits + stats.misses === 0) return UNSEEN_WEIGHT;
  return Math.min(5, Math.max(1, 1 + 2 * stats.misses - stats.hits));
}

// Weighted sample without replacement. stats maps a room name to { hits, misses }.
// rng returns a number from 0 up to 1, like Math.random.
export function pickRound(rooms, stats, n = 10, rng = Math.random) {
  const pool = rooms.filter((room) => room.kind !== 'spawn');
  const picked = [];
  while (picked.length < n && pool.length > 0) {
    const weights = pool.map((room) => weight(stats[room.name]));
    let roll = rng() * weights.reduce((sum, w) => sum + w, 0);
    let index = 0;
    while (index < pool.length - 1 && roll >= weights[index]) {
      roll -= weights[index];
      index += 1;
    }
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// results is a list of { name, correct, ms }. Weakest means misses first, then the slowest answers.
export function summarise(results) {
  const worstFirst = [...results].sort((a, b) => a.correct - b.correct || b.ms - a.ms);
  return {
    accuracy: results.filter((r) => r.correct).length / results.length,
    medianMs: median(results.map((r) => r.ms)),
    weakest: worstFirst.slice(0, 3).map((r) => r.name),
  };
}
