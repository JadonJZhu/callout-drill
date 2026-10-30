import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeClick, pickRound, roomAt, summarise, weight } from '../src/quiz.js';

// Small seeded generator (mulberry32), so random tests give the same result every run.
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const box = { name: 'Box', kind: 'room', rects: [[10, 10, 10, 10]] };
const ell = { name: 'Ell', kind: 'room', rects: [[40, 40, 10, 4], [40, 44, 4, 10]] };
const spawn = { name: 'Attacker Spawn', kind: 'spawn', rects: [[0, 90, 10, 10]] };
const rooms = Array.from({ length: 20 }, (_, i) => ({ name: `Room ${i}`, kind: 'room', rects: [[i, 0, 1, 1]] }));

test('judgeClick: inside is correct', () => {
  assert.equal(judgeClick({ x: 15, y: 15 }, box), true);
});

test('judgeClick: exactly 1.5 units away is correct', () => {
  assert.equal(judgeClick({ x: 21.5, y: 15 }, box), true);
  assert.equal(judgeClick({ x: 8.5, y: 15 }, box), true);
});

test('judgeClick: past 1.5 units is wrong, including diagonally from a corner', () => {
  assert.equal(judgeClick({ x: 21.51, y: 15 }, box), false);
  assert.equal(judgeClick({ x: 21.2, y: 21.2 }, box), false);
  assert.equal(judgeClick({ x: 80, y: 80 }, box), false);
});

test('judgeClick: a multi-rectangle room counts every rectangle, not the gap in its L', () => {
  assert.equal(judgeClick({ x: 48, y: 42 }, ell), true);
  assert.equal(judgeClick({ x: 42, y: 52 }, ell), true);
  assert.equal(judgeClick({ x: 48, y: 52 }, ell), false);
});

test('roomAt: finds the room, or null when the point is in a wall', () => {
  assert.equal(roomAt({ x: 42, y: 52 }, [box, ell]), ell);
  assert.equal(roomAt({ x: 48, y: 52 }, [box, ell]), null);
});

test('weight: unseen is 3', () => {
  assert.equal(weight(undefined), 3);
  assert.equal(weight({ hits: 0, misses: 0 }), 3);
});

test('weight: follows 1 + 2 * misses - hits', () => {
  assert.equal(weight({ hits: 1, misses: 1 }), 2);
  assert.equal(weight({ hits: 1, misses: 2 }), 4);
});

test('weight: clamps to 1..5', () => {
  assert.equal(weight({ hits: 9, misses: 0 }), 1);
  assert.equal(weight({ hits: 0, misses: 9 }), 5);
});

test('pickRound: no repeats, right length, spawns never asked', () => {
  const round = pickRound([spawn, ...rooms], {}, 10, seeded(1));
  assert.equal(round.length, 10);
  assert.equal(new Set(round).size, 10);
  assert.ok(!round.includes(spawn));
});

test('pickRound: stops when the pool runs out, which is how a three-callout drill works', () => {
  assert.equal(pickRound([box, ell, spawn], {}, 10, seeded(1)).length, 2);
});

test('pickRound: the same seed gives the same round', () => {
  const names = (seed) => pickRound(rooms, {}, 10, seeded(seed)).map((r) => r.name);
  assert.deepEqual(names(7), names(7));
  assert.notDeepEqual(names(7), names(8));
});

test('pickRound: missed callouts appear more often across 1,000 seeded rounds', () => {
  const stats = Object.fromEntries(rooms.map((r) => [r.name, { hits: 3, misses: 0 }]));
  stats['Room 5'] = { hits: 0, misses: 3 };
  const rng = seeded(42);
  const counts = {};
  for (let i = 0; i < 1000; i += 1) {
    for (const r of pickRound(rooms, stats, 5, rng)) counts[r.name] = (counts[r.name] ?? 0) + 1;
  }
  const others = rooms.filter((r) => r.name !== 'Room 5').map((r) => counts[r.name] ?? 0);
  assert.ok(counts['Room 5'] > Math.max(...others), `${counts['Room 5']} vs ${Math.max(...others)}`);
});

test('summarise: accuracy, median time and weakest (misses first, then slowest)', () => {
  const summary = summarise([
    { name: 'a', correct: true, ms: 1000 },
    { name: 'b', correct: false, ms: 500 },
    { name: 'c', correct: true, ms: 3000 },
    { name: 'd', correct: false, ms: 2000 },
  ]);
  assert.equal(summary.accuracy, 0.5);
  assert.equal(summary.medianMs, 1500);
  assert.deepEqual(summary.weakest, ['d', 'b', 'c']);
});
