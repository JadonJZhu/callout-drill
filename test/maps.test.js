import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { maps } = JSON.parse(readFileSync(new URL('../data/maps.json', import.meta.url)));

const REQUIRED = ['A Site', 'B Site', 'A Main', 'B Main', 'Mid', 'Heaven', 'Attacker Spawn', 'Defender Spawn'];
const VOCABULARY = new Set([
  'Attacker Spawn', 'Defender Spawn', 'Site', 'Main', 'Mid', 'Heaven', 'Hell', 'Short', 'Long', 'Lobby',
  'Mid Window', 'Mid Top', 'Mid Bottom', 'Cubby', 'Link', 'Garage', 'Market', 'Tree', 'Elbow', 'Ramp',
  'Back Site', 'Default', 'CT', 'Connector', 'Catwalk', 'Pillars', 'Stairs',
]);
const TAKEN_MAP_NAMES = [
  'ascent', 'bind', 'haven', 'split', 'icebox', 'breeze', 'fracture', 'pearl', 'lotus', 'sunset', 'abyss', 'corrode',
  'dust', 'dust2', 'dust ii', 'inferno', 'mirage', 'nuke', 'overpass', 'train', 'cache', 'cobblestone', 'vertigo',
  'ancient', 'anubis', 'office', 'italy', 'assault', 'aztec', 'canals', 'tuscan', 'agency',
];

// Length of the edge two rectangles share (0 if they only touch at a corner or not at all).
function sharedEdge([ax, ay, aw, ah], [bx, by, bw, bh]) {
  if (ax + aw === bx || bx + bw === ax) return Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
  if (ay + ah === by || by + bh === ay) return Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
  return 0;
}

function overlaps([ax, ay, aw, ah], [bx, by, bw, bh]) {
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

function longestEdge(roomA, roomB) {
  return Math.max(...roomA.rects.flatMap((a) => roomB.rects.map((b) => sharedEdge(a, b))));
}

function neighbours(room, rooms) {
  return rooms.filter((other) => other !== room && longestEdge(room, other) >= 2);
}

// Breadth-first search that never enters a blocked room.
function reachable(from, to, rooms, blocked = []) {
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    for (const next of neighbours(queue.shift(), rooms)) {
      if (!seen.has(next) && !blocked.includes(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.has(to);
}

const room = (map, name) => map.rooms.find((r) => r.name === name);
const sites = (map) => map.rooms.filter((r) => r.kind === 'site');

test('there are three maps: two with 2 sites and one with 3', () => {
  assert.equal(maps.length, 3);
  assert.deepEqual(maps.map((m) => m.sites).sort(), [2, 2, 3]);
});

test('map names are invented', () => {
  for (const map of maps) assert.ok(!TAKEN_MAP_NAMES.includes(map.name.toLowerCase()), map.name);
});

for (const map of maps) {
  test(`${map.name}: names`, () => {
    const names = map.rooms.map((r) => r.name);
    for (const name of REQUIRED) assert.ok(names.includes(name), `missing ${name}`);
    assert.equal(new Set(names).size, names.length, 'names must be unique');
    for (const name of names) {
      assert.ok(VOCABULARY.has(name) || VOCABULARY.has(name.replace(/^[ABC] /, '')), `unknown callout ${name}`);
    }
    assert.equal(sites(map).length, map.sites);
  });

  test(`${map.name}: has 16 to 24 rooms`, () => {
    assert.ok(map.rooms.length >= 16 && map.rooms.length <= 24, `${map.rooms.length} rooms`);
  });

  test(`${map.name}: rectangles are inside the grid on whole units`, () => {
    for (const r of map.rooms) {
      for (const [x, y, w, h] of r.rects) {
        assert.ok([x, y, w, h].every(Number.isInteger), r.name);
        assert.ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 100 && y + h <= 100, r.name);
      }
    }
  });

  test(`${map.name}: no rectangles overlap, within a room or between rooms`, () => {
    const all = map.rooms.flatMap((r) => r.rects.map((rect) => ({ name: r.name, rect })));
    all.forEach((a, i) => {
      for (const b of all.slice(i + 1)) assert.ok(!overlaps(a.rect, b.rect), `${a.name} overlaps ${b.name}`);
    });
  });

  test(`${map.name}: each room is one connected shape`, () => {
    for (const r of map.rooms) {
      const parts = r.rects.map((rect) => ({ rects: [rect] }));
      assert.ok(parts.every((part) => reachable(parts[0], part, parts)), r.name);
    }
  });

  test(`${map.name}: every touching pair shares at least 2 units, so a shared edge always means a doorway`, () => {
    for (const a of map.rooms) {
      assert.ok(neighbours(a, map.rooms).length > 0, `${a.name} has no neighbour`);
      for (const b of map.rooms) {
        if (a === b) continue;
        const edge = longestEdge(a, b);
        assert.ok(edge === 0 || edge >= 2, `${a.name} and ${b.name} touch along only ${edge}`);
      }
    }
  });

  test(`${map.name}: all rooms form one connected graph`, () => {
    for (const r of map.rooms) assert.ok(reachable(map.rooms[0], r, map.rooms), r.name);
  });

  test(`${map.name}: attacker spawn is at the bottom, defender spawn at the top, not adjacent`, () => {
    const attacker = room(map, 'Attacker Spawn');
    const defender = room(map, 'Defender Spawn');
    assert.equal(longestEdge(attacker, defender), 0);
    assert.ok(attacker.rects[0][1] >= 80, 'attacker spawn at the bottom');
    assert.ok(defender.rects[0][1] <= 10, 'defender spawn at the top');
  });

  test(`${map.name}: sites are in the top half and Heaven overlooks a site`, () => {
    for (const site of sites(map)) {
      const [, y, , h] = site.rects[0];
      assert.ok(y + h / 2 < 50, `${site.name} is too low`);
    }
    assert.ok(sites(map).some((site) => longestEdge(room(map, 'Heaven'), site) >= 2));
  });

  // Two distinct routes means no single room can block every way in. Routes may not pass
  // through the defender spawn or another site, since attackers do not take those.
  test(`${map.name}: each site has at least 2 distinct routes from attacker spawn`, () => {
    const attacker = room(map, 'Attacker Spawn');
    const defender = room(map, 'Defender Spawn');
    for (const site of sites(map)) {
      const offLimits = [defender, ...sites(map).filter((s) => s !== site)];
      assert.ok(reachable(attacker, site, map.rooms, offLimits), `${site.name} unreachable`);
      for (const r of map.rooms) {
        if (r === site || r === attacker) continue;
        assert.ok(reachable(attacker, site, map.rooms, [...offLimits, r]), `${r.name} is the only way to ${site.name}`);
      }
    }
  });
}
