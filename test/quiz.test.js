import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshProgress, judgeClick, memoryCounts, memoryState, pickNext, recordAnswer, rollingScore, roomAt } from '../src/quiz.js';

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

// Answers each named callout in order, with one second per answer.
function play(answers, progress = freshProgress()) {
  return answers.reduce((p, [name, correct]) => recordAnswer(p, name, correct, 1000), progress);
}

test('recordAnswer: a miss comes back after 2 answers, a first hit after 4, and the gap doubles', () => {
  let p = play([['Box', false]]);
  assert.deepEqual(p.callouts.Box, { box: 0, dueAt: 3 });
  p = play([['Ell', true]]);
  assert.deepEqual(p.callouts.Ell, { box: 1, dueAt: 5 });
  p = play([['Ell', true]], p);
  assert.deepEqual(p.callouts.Ell, { box: 2, dueAt: 10 });
});

test('recordAnswer: the box stops at 4, and a miss sends it back to 0', () => {
  let p = play(Array(9).fill(['Box', true]));
  assert.equal(p.callouts.Box.box, 4);
  p = play([['Box', false]], p);
  assert.equal(p.callouts.Box.box, 0);
});

test('recordAnswer: does not change the progress passed in', () => {
  const p = freshProgress();
  recordAnswer(p, 'Box', true, 1000);
  assert.deepEqual(p, freshProgress());
});

test('pickNext: spawns are never asked', () => {
  const rng = seeded(1);
  for (let i = 0; i < 100; i += 1) assert.notEqual(pickNext([spawn, box, ell], freshProgress(), null, rng), spawn);
});

test('pickNext: never asks the same callout twice in a row', () => {
  const rng = seeded(2);
  let p = freshProgress();
  let last = null;
  for (let i = 0; i < 500; i += 1) {
    const room = pickNext(rooms, p, last, rng);
    assert.notEqual(room.name, last);
    p = recordAnswer(p, room.name, rng() < 0.7, 1000);
    last = room.name;
  }
});

test('pickNext: a due callout comes before a new one, most overdue first', () => {
  const p = play([['Room 1', false], ['Room 2', false], ['Room 3', true], ['Room 4', true]]);
  assert.equal(pickNext(rooms, p, 'Room 4', seeded(3)).name, 'Room 1');
});

test('pickNext: with nothing due, a new callout comes next', () => {
  const p = play([['Room 1', true]]);
  assert.notEqual(pickNext(rooms, p, 'Room 1', seeded(4)).name, 'Room 1');
});

test('pickNext: with everything seen and nothing due, the soonest due comes next and the drill never ends', () => {
  const p = play([['Box', true], ['Ell', true], ['Box', true], ['Ell', true], ['Box', true], ['Ell', true]]);
  assert.equal(pickNext([box, ell], p, 'Ell', seeded(5)).name, 'Box');
});

test('pickNext: one callout on its own is still asked', () => {
  assert.equal(pickNext([box], play([['Box', true]]), 'Box', seeded(6)), box);
});

test('pickNext: the same seed gives the same callout', () => {
  const name = (seed) => pickNext(rooms, freshProgress(), null, seeded(seed)).name;
  assert.equal(name(7), name(7));
});

test('a missed callout comes up more often than one always answered correctly', () => {
  const rng = seeded(42);
  const counts = {};
  let p = freshProgress();
  let last = null;
  for (let i = 0; i < 1000; i += 1) {
    const room = pickNext(rooms, p, last, rng);
    counts[room.name] = (counts[room.name] ?? 0) + 1;
    p = recordAnswer(p, room.name, room.name !== 'Room 5', 1000);
    last = room.name;
  }
  const others = rooms.filter((r) => r.name !== 'Room 5').map((r) => counts[r.name]);
  assert.ok(counts['Room 5'] > Math.max(...others), `${counts['Room 5']} vs ${Math.max(...others)}`);
});

test('rollingScore: null before the first answer', () => {
  assert.equal(rollingScore([]), null);
});

test('rollingScore: share correct and median time', () => {
  const score = rollingScore([
    { correct: true, ms: 1000 },
    { correct: false, ms: 500 },
    { correct: true, ms: 3000 },
    { correct: false, ms: 2000 },
  ]);
  assert.deepEqual(score, { count: 4, accuracy: 0.5, medianMs: 1500 });
});

test('rollingScore: only the last 20 answers count, so old misses roll off', () => {
  const misses = Array(20).fill(['Box', false]);
  const hits = Array(20).fill(['Box', true]);
  const p = play([...misses, ...hits]);
  assert.equal(p.recent.length, 20);
  assert.equal(rollingScore(p.recent).accuracy, 1);
});

test('memoryCounts: new, learning and solid (box 3 and up), without spawns', () => {
  const p = play([['Box', true], ['Box', true], ['Box', true], ['Ell', false]]);
  assert.deepEqual(memoryCounts([spawn, box, ell, rooms[0]], p), { new: 1, learning: 1, solid: 1 });
});

test('memoryState: new with no entry, learning below box 3, solid from box 3', () => {
  assert.equal(memoryState(undefined), 'new');
  assert.equal(memoryState({ box: 2 }), 'learning');
  assert.equal(memoryState({ box: 3 }), 'solid');
});
