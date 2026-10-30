// Page wiring: holds the quiz state, reacts to clicks and keys, and redraws.
import { judgeClick, pickRound, summarise } from './quiz.js';
import { mapMarkup, toGrid } from './map.js';

const ROUND_LENGTH = 10;
const CORRECT_PAUSE_MS = 900;
const LAST_MAP_KEY = 'callout-drill:last-map';

const $ = (id) => document.getElementById(id);
const svg = $('map');

// Storage can be blocked, so every access goes through these two functions.
function load(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The drill still works for this visit, it just will not be remembered.
  }
}

const statsKey = (map) => `callout-drill:stats:${map.slug}`;

let map = null;
let stats = {};
let round = [];
let results = [];
let summary = null;
let phase = 'ask'; // ask, correct (short pause), review (after a miss) or end
let marker = null;
let startedAt = 0;
let elapsedAtPause = 0;
let studying = false;
let readAloud = false;
let nextTimer = null;

const target = () => round[results.length];
const lastAsked = () => round[results.length - 1];

function draw() {
  let view = {};
  if (phase === 'correct') view = { good: lastAsked().name, labels: [lastAsked().name] };
  if (phase === 'review') view = { good: lastAsked().name, labels: [lastAsked().name], marker };
  if (phase === 'end') view = { weak: summary.weakest, labels: summary.weakest };
  if (studying) view = { labels: 'all' };
  svg.innerHTML = mapMarkup(map, view);

  const inEnd = phase === 'end' && !studying;
  $('prompt').textContent = studying ? 'Study mode' : promptText();
  $('status').textContent = studying ? 'Quiz paused' : statusText();
  $('status').className = !studying && phase === 'correct' ? 'good' : !studying && phase === 'review' ? 'bad' : '';
  $('progress').textContent = studying || phase === 'end' ? '' : `${phase === 'ask' ? results.length + 1 : results.length} / ${round.length}`;
  $('end-buttons').hidden = !inEnd;
}

function promptText() {
  if (phase === 'end') return `${Math.round(summary.accuracy * 100)}% correct`;
  return phase === 'ask' ? target().name : lastAsked().name;
}

function statusText() {
  if (phase === 'correct') return 'Correct';
  if (phase === 'review') return 'Wrong. Click or press Space to go on.';
  if (phase === 'end') return `Median time ${(summary.medianMs / 1000).toFixed(1)} s. Weakest: ${summary.weakest.join(', ')}.`;
  return '';
}

function ask() {
  phase = 'ask';
  marker = null;
  startedAt = performance.now();
  elapsedAtPause = 0;
  draw();
  if (readAloud) {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(target().name));
  }
}

function startRound(rooms = map.rooms, n = ROUND_LENGTH) {
  clearTimeout(nextTimer);
  round = pickRound(rooms, stats, n, Math.random);
  results = [];
  ask();
}

function next() {
  if (results.length < round.length) return ask();
  summary = summarise(results);
  phase = 'end';
  draw();
}

function answer(point) {
  const asked = target();
  const correct = judgeClick(point, asked);
  results.push({ name: asked.name, correct, ms: performance.now() - startedAt });
  const entry = stats[asked.name] ?? { hits: 0, misses: 0 };
  stats[asked.name] = correct ? { ...entry, hits: entry.hits + 1 } : { ...entry, misses: entry.misses + 1 };
  save(statsKey(map), stats);
  if (correct) {
    phase = 'correct';
    nextTimer = setTimeout(next, CORRECT_PAUSE_MS);
  } else {
    phase = 'review';
    marker = point;
  }
  draw();
}

function chooseMap(chosen) {
  map = chosen;
  stats = load(statsKey(map)) ?? {};
  save(LAST_MAP_KEY, map.slug);
  for (const button of $('chooser').children) {
    button.setAttribute('aria-pressed', button.textContent === map.name);
  }
  startRound();
}

function toggleStudy() {
  studying = !studying;
  $('study').setAttribute('aria-pressed', studying);
  // Study time does not count towards the answer time.
  if (studying) elapsedAtPause = performance.now() - startedAt;
  else startedAt = performance.now() - elapsedAtPause;
  draw();
}

function toggleReadAloud() {
  readAloud = !readAloud;
  $('read-aloud').setAttribute('aria-pressed', readAloud);
}

function reset() {
  stats = {};
  save(statsKey(map), stats);
  startRound();
}

document.addEventListener('click', (event) => {
  if (studying || event.target.closest('button')) return;
  if (phase === 'review') next();
  else if (phase === 'ask' && event.target.closest('#map')) answer(toGrid(svg, event));
});

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || phase !== 'review' || studying) return;
  event.preventDefault();
  next();
});

$('study').addEventListener('click', toggleStudy);
$('read-aloud').addEventListener('click', toggleReadAloud);
$('read-aloud').hidden = !('speechSynthesis' in window);
$('reset').addEventListener('click', reset);
$('new-round').addEventListener('click', () => startRound());
$('drill').addEventListener('click', () => {
  startRound(map.rooms.filter((room) => summary.weakest.includes(room.name)), summary.weakest.length);
});

const { maps } = await (await fetch('data/maps.json')).json();
for (const each of maps) {
  const button = document.createElement('button');
  button.textContent = each.name;
  button.addEventListener('click', () => chooseMap(each));
  $('chooser').append(button);
}
chooseMap(maps.find((each) => each.slug === load(LAST_MAP_KEY)) ?? maps[0]);
