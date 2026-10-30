// Pure quiz logic. No DOM here, and randomness is passed in, so all of it can be tested in Node.

const CLICK_TOLERANCE = 1.5; // grid units; forgives a click that lands on the room's outline
const GAPS = [2, 4, 8, 16, 32]; // answers until a callout comes back, by memory box; each box doubles the gap
export const MAX_BOX = GAPS.length - 1;
const SOLID_BOX = 3;
const RECENT_LENGTH = 20;

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

// turn counts answers on this map. callouts maps a room name to { box, dueAt }; unseen rooms have no entry.
export function freshProgress() {
  return { turn: 0, callouts: {}, recent: [] };
}

// A correct answer moves a callout up one box, and a miss sends it back to box 0.
export function recordAnswer(progress, name, correct, ms) {
  const turn = progress.turn + 1;
  const seen = progress.callouts[name];
  const box = correct ? Math.min(MAX_BOX, (seen?.box ?? 0) + 1) : 0;
  return {
    turn,
    callouts: { ...progress.callouts, [name]: { box, dueAt: turn + GAPS[box] } },
    recent: [...progress.recent, { correct, ms }].slice(-RECENT_LENGTH),
  };
}

// Most overdue callout first, then a new one at random, then whichever comes due soonest.
// lastName is never asked twice in a row. rng returns a number from 0 up to 1, like Math.random.
export function pickNext(rooms, progress, lastName = null, rng = Math.random) {
  const askable = rooms.filter((room) => room.kind !== 'spawn');
  const pool = askable.length > 1 ? askable.filter((room) => room.name !== lastName) : askable;
  const dueAt = (room) => progress.callouts[room.name].dueAt;
  const seen = pool.filter((room) => progress.callouts[room.name]).sort((a, b) => dueAt(a) - dueAt(b));
  if (seen.length > 0 && dueAt(seen[0]) <= progress.turn) return seen[0];
  const unseen = pool.filter((room) => !progress.callouts[room.name]);
  return unseen.length > 0 ? unseen[Math.floor(rng() * unseen.length)] : seen[0];
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// The rolling score: share correct and median time over the last 20 answers, or null before the first answer.
export function rollingScore(recent) {
  if (recent.length === 0) return null;
  return {
    count: recent.length,
    accuracy: recent.filter((answer) => answer.correct).length / recent.length,
    medianMs: median(recent.map((answer) => answer.ms)),
  };
}

export function memoryCounts(rooms, progress) {
  const counts = { new: 0, learning: 0, solid: 0 };
  for (const room of rooms.filter((each) => each.kind !== 'spawn')) {
    const seen = progress.callouts[room.name];
    if (!seen) counts.new += 1;
    else if (seen.box >= SOLID_BOX) counts.solid += 1;
    else counts.learning += 1;
  }
  return counts;
}
