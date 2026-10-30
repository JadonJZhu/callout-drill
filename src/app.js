// Page wiring: holds the quiz state, reacts to clicks and keys, and redraws.
import { MAX_BOX, freshProgress, judgeClick, memoryCounts, memoryState, pickNext, recordAnswer, rollingScore } from './quiz.js';
import { mapMarkup, toGrid } from './map.js';

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

const progressKey = (map) => `callout-drill:progress:${map.slug}`;

let map = null;
let progress = freshProgress();
let asked = null;
let phase = 'ask'; // ask, correct (short pause) or review (after a miss)
let marker = null;
let startedAt = 0;
let elapsedAtPause = 0;
let studying = false;
let readAloud = false;
let nextTimer = null;

function memoryText() {
  const seen = progress.callouts[asked.name];
  if (!seen) return 'Memory: new';
  return `Memory: ${'●'.repeat(seen.box)}${'○'.repeat(MAX_BOX - seen.box)}`;
}

function scoreText() {
  const score = rollingScore(progress.recent);
  if (!score) return 'No answers yet';
  return `Last ${score.count}: ${Math.round(score.accuracy * 100)}% correct, median ${(score.medianMs / 1000).toFixed(1)} s`;
}

function countsMarkup() {
  const counts = memoryCounts(map.rooms, progress);
  return `<span class="new">New ${counts.new}</span>, <span class="learning">learning ${counts.learning}</span>, <span class="solid">solid ${counts.solid}</span>`;
}

function statusText() {
  if (phase === 'ask') return '';
  const back = progress.callouts[asked.name].dueAt - progress.turn;
  if (phase === 'correct') return `Correct. Back in ${back} answers.`;
  return `Wrong. Back in ${back} answers. Click or press Space to go on.`;
}

function draw() {
  let view = {};
  if (phase === 'correct') view = { good: asked.name, labels: [asked.name] };
  if (phase === 'review') view = { good: asked.name, labels: [asked.name], marker };
  if (studying) view = { labels: 'all' };
  svg.innerHTML = mapMarkup(map, view);

  $('prompt').textContent = studying ? 'Study mode' : asked.name;
  $('memory').textContent = studying ? '' : memoryText();
  $('memory').className = memoryState(progress.callouts[asked.name]);
  $('status').textContent = studying ? 'Quiz paused' : statusText();
  $('status').className = !studying && phase === 'correct' ? 'good' : !studying && phase === 'review' ? 'bad' : '';
  $('score').textContent = scoreText();
  $('counts').innerHTML = countsMarkup();
}

function ask() {
  clearTimeout(nextTimer);
  asked = pickNext(map.rooms, progress, asked?.name, Math.random);
  phase = 'ask';
  marker = null;
  startedAt = performance.now();
  elapsedAtPause = 0;
  draw();
  if (readAloud) {
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(asked.name));
  }
}

function answer(point) {
  const correct = judgeClick(point, asked);
  progress = recordAnswer(progress, asked.name, correct, performance.now() - startedAt);
  save(progressKey(map), progress);
  if (correct) {
    phase = 'correct';
    nextTimer = setTimeout(ask, CORRECT_PAUSE_MS);
  } else {
    phase = 'review';
    marker = point;
  }
  draw();
}

function chooseMap(chosen) {
  map = chosen;
  progress = load(progressKey(map)) ?? freshProgress();
  asked = null;
  save(LAST_MAP_KEY, map.slug);
  for (const button of $('chooser').children) {
    button.setAttribute('aria-pressed', button.textContent === map.name);
  }
  ask();
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
  progress = freshProgress();
  asked = null;
  save(progressKey(map), progress);
  ask();
}

document.addEventListener('click', (event) => {
  if (studying || event.target.closest('button')) return;
  if (phase === 'review') ask();
  else if (phase === 'ask' && event.target.closest('#map')) answer(toGrid(svg, event));
});

document.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || phase !== 'review' || studying) return;
  event.preventDefault();
  ask();
});

$('study').addEventListener('click', toggleStudy);
$('read-aloud').addEventListener('click', toggleReadAloud);
$('read-aloud').hidden = !('speechSynthesis' in window);
$('reset').addEventListener('click', reset);

const { maps } = await (await fetch('data/maps.json')).json();
for (const each of maps) {
  const button = document.createElement('button');
  button.textContent = each.name;
  button.addEventListener('click', () => chooseMap(each));
  $('chooser').append(button);
}
chooseMap(maps.find((each) => each.slug === load(LAST_MAP_KEY)) ?? maps[0]);
