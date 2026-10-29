'use strict';

const STORAGE_KEY = 'mindspark-progress-v1';
const difficultySettings = {
  easy: { rounds: 5, seconds: 90, label: 'Easy' },
  medium: { rounds: 7, seconds: 75, label: 'Medium' },
  hard: { rounds: 9, seconds: 60, label: 'Hard' }
};
const gameDetails = {
  memory: { title: 'Memory Matrix', category: 'MEMORY TRAINING', radar: 'memory' },
  numbers: { title: 'Number Detective', category: 'LOGIC TRAINING', radar: 'logic' },
  color: { title: 'Color Confusion', category: 'FOCUS TRAINING', radar: 'focus' },
  reflex: { title: 'Reflex Challenge', category: 'SPEED TRAINING', radar: 'speed' },
  patterns: { title: 'Pattern Master', category: 'LOGIC TRAINING', radar: 'logic' }
};
const radarCategories = [
  { key: 'memory', label: 'Memory', color: '#b28cff' },
  { key: 'logic', label: 'Logic', color: '#80b8ff' },
  { key: 'focus', label: 'Focus', color: '#ff91bf' },
  { key: 'speed', label: 'Speed', color: '#ffd178' }
];
const colorChoices = [
  { name: 'coral', value: '#ff6f7d' },
  { name: 'blue', value: '#66a9ff' },
  { name: 'green', value: '#67ddb1' },
  { name: 'yellow', value: '#ffd166' },
  { name: 'purple', value: '#bd8cff' },
  { name: 'pink', value: '#ff82bf' }
];

const elements = {
  dashboard: document.querySelector('#dashboard'),
  gameScreen: document.querySelector('#game-screen'),
  gameTitle: document.querySelector('#game-title'),
  gameCategory: document.querySelector('#game-category'),
  playPanel: document.querySelector('#play-panel'),
  completionPanel: document.querySelector('#completion-panel'),
  sessionScore: document.querySelector('#session-score'),
  sessionAccuracy: document.querySelector('#session-accuracy'),
  timeLeft: document.querySelector('#time-left'),
  progressLabel: document.querySelector('#progress-label'),
  progressFill: document.querySelector('#progress-fill'),
  progressTrack: document.querySelector('.progress-track'),
  difficulty: document.querySelector('#game-difficulty'),
  dashboardDifficulty: document.querySelector('#dashboard-difficulty'),
  totalPoints: document.querySelector('#total-points'),
  bestScore: document.querySelector('#best-score'),
  completedChallenges: document.querySelector('#completed-challenges'),
  radarMeters: document.querySelector('#radar-meters'),
  dailyCaption: document.querySelector('#daily-caption'),
  dailyButton: document.querySelector('#daily-challenge')
};

function emptyProgress() {
  return {
    totalPoints: 0,
    bestScore: 0,
    completedChallenges: 0,
    radar: {
      memory: { correct: 0, total: 0 },
      logic: { correct: 0, total: 0 },
      focus: { correct: 0, total: 0 },
      speed: { correct: 0, total: 0 }
    }
  };
}

function readProgress() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const fresh = emptyProgress();
    if (!stored || typeof stored !== 'object') return fresh;
    for (const key of ['totalPoints', 'bestScore', 'completedChallenges']) {
      if (Number.isFinite(stored[key]) && stored[key] >= 0) fresh[key] = Math.floor(stored[key]);
    }
    for (const category of radarCategories) {
      const saved = stored.radar?.[category.key];
      if (saved && Number.isFinite(saved.correct) && Number.isFinite(saved.total) && saved.correct >= 0 && saved.total >= saved.correct) {
        fresh.radar[category.key] = { correct: Math.floor(saved.correct), total: Math.floor(saved.total) };
      }
    }
    return fresh;
  } catch {
    return emptyProgress();
  }
}

let progress = readProgress();
let gameState = null;

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // The game remains playable when browser storage is unavailable.
  }
}

function renderDashboard() {
  elements.totalPoints.textContent = String(progress.totalPoints);
  elements.bestScore.textContent = String(progress.bestScore);
  elements.completedChallenges.textContent = String(progress.completedChallenges);
  elements.radarMeters.innerHTML = radarCategories.map((category) => {
    const record = progress.radar[category.key];
    const value = record.total ? Math.round((record.correct / record.total) * 100) : 0;
    return `<div class="meter-item"><div class="meter-label"><span>${category.label}</span><strong>${value}%</strong></div><div class="meter-track" aria-label="${category.label} performance ${value}%"><span style="width:${value}%;--meter-color:${category.color}"></span></div></div>`;
  }).join('');
  const date = getLocalDateKey();
  const dailyGame = dailyGameFor(date);
  elements.dailyCaption.textContent = `${formatDate(date)} · Today's pick: ${gameDetails[dailyGame].title}`;
}

function getLocalDateKey() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDate(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(year, month - 1, day));
}

function dailyGameFor(dateKey) {
  const dailyGames = ['memory', 'numbers', 'color', 'reflex', 'patterns'];
  let hash = 0;
  for (const character of dateKey) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return dailyGames[hash % dailyGames.length];
}

function clearGameTimers() {
  if (!gameState) return;
  if (gameState.intervalId !== null) clearInterval(gameState.intervalId);
  for (const timeoutId of gameState.timeoutIds) clearTimeout(timeoutId);
  gameState.timeoutIds = [];
  gameState.intervalId = null;
}

function schedule(callback, delay) {
  const timeoutId = setTimeout(callback, delay);
  gameState.timeoutIds.push(timeoutId);
  return timeoutId;
}

function startGame(gameKey, isDaily = false) {
  if (!gameDetails[gameKey]) return;
  clearGameTimers();
  const difficulty = elements.difficulty.value in difficultySettings ? elements.difficulty.value : 'medium';
  const settings = difficultySettings[difficulty];
  gameState = {
    key: gameKey,
    difficulty,
    isDaily,
    rounds: settings.rounds,
    secondsLeft: settings.seconds,
    score: 0,
    correct: 0,
    answered: 0,
    round: 0,
    locked: false,
    finished: false,
    intervalId: null,
    timeoutIds: [],
    roundStartedAt: 0,
    sequence: [],
    sequenceIndex: 0,
    reflexTargetAt: 0
  };
  elements.dashboard.hidden = true;
  elements.gameScreen.hidden = false;
  elements.completionPanel.hidden = true;
  elements.playPanel.hidden = false;
  elements.gameTitle.textContent = gameDetails[gameKey].title;
  elements.gameCategory.textContent = isDaily ? 'TODAY’S DAILY CHALLENGE' : gameDetails[gameKey].category;
  elements.difficulty.value = difficulty;
  updateHud();
  gameState.intervalId = setInterval(tick, 1000);
  renderRound();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateHud() {
  if (!gameState) return;
  elements.sessionScore.textContent = String(gameState.score);
  const accuracy = gameState.answered ? Math.round((gameState.correct / gameState.answered) * 100) : 0;
  elements.sessionAccuracy.textContent = `${accuracy}%`;
  elements.timeLeft.textContent = `${gameState.secondsLeft}s`;
  elements.progressLabel.textContent = `${gameState.round} / ${gameState.rounds}`;
  const percent = Math.round((gameState.round / gameState.rounds) * 100);
  elements.progressFill.style.width = `${percent}%`;
  elements.progressTrack.setAttribute('aria-valuenow', String(percent));
}

function tick() {
  if (!gameState || gameState.finished) return;
  gameState.secondsLeft -= 1;
  updateHud();
  if (gameState.secondsLeft <= 0) finishGame(false);
}

function renderRound() {
  if (!gameState || gameState.finished) return;
  if (gameState.round >= gameState.rounds) {
    finishGame(true);
    return;
  }
  gameState.round += 1;
  gameState.locked = false;
  gameState.roundStartedAt = performance.now();
  updateHud();

  switch (gameState.key) {
    case 'memory': renderMemoryRound(); break;
    case 'numbers': renderNumberRound(); break;
    case 'color': renderColorRound(); break;
    case 'reflex': renderReflexRound(); break;
    case 'patterns': renderPatternRound(); break;
  }
}

function panelHeading(kicker, prompt, detail = '') {
  return `<p class="prompt-kicker">${kicker}</p><h2 class="play-prompt">${prompt}</h2>${detail ? `<p class="prompt-detail">${detail}</p>` : ''}`;
}

function renderMemoryRound() {
  const sequenceLength = Math.min(2 + gameState.round, 10);
  gameState.sequence = Array.from({ length: sequenceLength }, () => Math.floor(Math.random() * 9));
  gameState.sequenceIndex = 0;
  gameState.locked = true;
  elements.playPanel.innerHTML = `${panelHeading(`ROUND ${gameState.round} · WATCH CLOSELY`, `Remember the ${sequenceLength} lit tiles`, 'The sequence will flash once. Then repeat it in the same order.')}
    <div class="memory-board" role="group" aria-label="Memory tile grid">${Array.from({ length: 9 }, (_, index) => `<button class="memory-tile" type="button" data-tile="${index}" aria-label="Tile ${index + 1}" disabled></button>`).join('')}</div>
    <p class="feedback-line" id="round-feedback" aria-live="polite">Watch the sequence…</p>`;
  const tiles = [...elements.playPanel.querySelectorAll('.memory-tile')];
  let flashIndex = 0;
  const flashNext = () => {
    if (!gameState || gameState.finished) return;
    if (flashIndex >= gameState.sequence.length) {
      gameState.locked = false;
      tiles.forEach((tile) => { tile.disabled = false; });
      document.querySelector('#round-feedback').textContent = 'Your turn. Repeat the pattern.';
      return;
    }
    const tile = tiles[gameState.sequence[flashIndex]];
    tile.classList.add('lit');
    schedule(() => {
      tile.classList.remove('lit');
      flashIndex += 1;
      schedule(flashNext, 180);
    }, 420);
  };
  schedule(flashNext, 500);
  tiles.forEach((tile) => tile.addEventListener('click', () => {
    if (gameState.locked || gameState.finished) return;
    gameState.locked = true;
    const selected = Number(tile.dataset.tile);
    const expected = gameState.sequence[gameState.sequenceIndex];
    if (selected !== expected) {
      gameState.answered += 1;
      tile.classList.add('wrong');
      showFeedback('Not quite. The next round is a fresh sequence.', false);
      updateHud();
      schedule(renderRound, 850);
      return;
    }
    tile.classList.add('lit');
    gameState.sequenceIndex += 1;
    if (gameState.sequenceIndex === gameState.sequence.length) {
      gameState.correct += 1;
      gameState.answered += 1;
      addPoints();
      showFeedback('Sequence complete! Nice recall.', true);
      updateHud();
      schedule(renderRound, 850);
    } else {
      gameState.locked = false;
      schedule(() => tile.classList.remove('lit'), 180);
    }
  }));
}

const numberQuestions = {
  easy: [
    { sequence: '2, 4, 6, 8, ?', answer: '10', options: ['9', '10', '12', '16'], explanation: 'Add 2 each time.' },
    { sequence: '5, 10, 15, 20, ?', answer: '25', options: ['22', '24', '25', '30'], explanation: 'Each number increases by 5.' },
    { sequence: '1, 2, 4, 8, ?', answer: '16', options: ['10', '12', '14', '16'], explanation: 'Double the previous number.' },
    { sequence: '10, 9, 8, 7, ?', answer: '6', options: ['4', '5', '6', '8'], explanation: 'Count down by 1.' },
    { sequence: '3, 6, 9, 12, ?', answer: '15', options: ['14', '15', '16', '18'], explanation: 'Add 3 each time.' }
  ],
  medium: [
    { sequence: '2, 4, 8, 16, ?', answer: '32', options: ['24', '30', '32', '34'], explanation: 'Each number is multiplied by 2.' },
    { sequence: '1, 4, 9, 16, ?', answer: '25', options: ['20', '24', '25', '36'], explanation: 'These are square numbers: 1², 2², 3², 4², 5².' },
    { sequence: '3, 6, 12, 24, ?', answer: '48', options: ['36', '42', '48', '54'], explanation: 'Double the previous number.' },
    { sequence: '20, 18, 16, 14, ?', answer: '12', options: ['10', '11', '12', '13'], explanation: 'Subtract 2 each time.' },
    { sequence: '1, 1, 2, 3, 5, ?', answer: '8', options: ['7', '8', '9', '10'], explanation: 'Add the two previous numbers to get the next.' },
    { sequence: '2, 5, 10, 17, ?', answer: '26', options: ['24', '25', '26', '28'], explanation: 'Add 3, then 5, then 7, then 9.' },
    { sequence: '81, 27, 9, 3, ?', answer: '1', options: ['0', '1', '2', '6'], explanation: 'Divide by 3 each time.' }
  ],
  hard: [
    { sequence: '1, 2, 6, 24, ?', answer: '120', options: ['96', '100', '120', '144'], explanation: 'Multiply by 2, then 3, then 4, then 5.' },
    { sequence: '2, 3, 5, 8, 12, ?', answer: '17', options: ['15', '16', '17', '18'], explanation: 'The increments grow by 1: +1, +2, +3, +4, +5.' },
    { sequence: '1, 4, 13, 40, ?', answer: '121', options: ['81', '120', '121', '124'], explanation: 'Multiply by 3, then add 1.' },
    { sequence: '100, 50, 25, 12.5, ?', answer: '6.25', options: ['5', '6.25', '6.5', '7.25'], explanation: 'Divide by 2 each time.' },
    { sequence: '2, 6, 12, 20, 30, ?', answer: '42', options: ['36', '40', '42', '44'], explanation: 'The increments are +4, +6, +8, +10, then +12.' },
    { sequence: '7, 10, 16, 28, 52, ?', answer: '100', options: ['76', '96', '100', '104'], explanation: 'The differences double: +3, +6, +12, +24, then +48.' },
    { sequence: '3, 4, 7, 11, 18, ?', answer: '29', options: ['27', '28', '29', '31'], explanation: 'Each number is the sum of the previous two.' },
    { sequence: '64, 32, 16, 8, ?', answer: '4', options: ['2', '4', '6', '7'], explanation: 'Each number is half the previous one.' },
    { sequence: '1, 3, 7, 15, 31, ?', answer: '63', options: ['47', '61', '62', '63'], explanation: 'Double the number and add 1.' }
  ]
};

function renderNumberRound() {
  const questions = numberQuestions[gameState.difficulty];
  const question = questions[(gameState.round - 1) % questions.length];
  elements.playPanel.innerHTML = `${panelHeading(`ROUND ${gameState.round} · FIND THE RULE`, 'What number comes next?')}
    <div class="sequence-display">${question.sequence}</div>
    <div class="answer-grid">${question.options.map((option) => `<button class="answer-button" type="button" data-answer="${option}">${option}</button>`).join('')}</div>
    <p class="feedback-line" id="round-feedback" aria-live="polite"></p>`;
  elements.playPanel.querySelectorAll('.answer-button').forEach((button) => button.addEventListener('click', () => {
    if (!lockAnswer()) return;
    const correct = button.dataset.answer === question.answer;
    markAnswer(correct, button, question.answer);
    showFeedback(`${correct ? 'Correct!' : `The answer was ${question.answer}.`} ${question.explanation}`, correct);
    updateHud();
    schedule(renderRound, 1450);
  }));
}

function renderColorRound() {
  const word = colorChoices[Math.floor(Math.random() * colorChoices.length)];
  let ink = colorChoices[Math.floor(Math.random() * colorChoices.length)];
  while (ink.name === word.name) ink = colorChoices[Math.floor(Math.random() * colorChoices.length)];
  const choices = [ink, ...colorChoices.filter((color) => color.name !== ink.name).sort(() => Math.random() - 0.5).slice(0, 3)].sort(() => Math.random() - 0.5);
  elements.playPanel.innerHTML = `${panelHeading(`ROUND ${gameState.round} · NAME THE INK`, 'Which color is the text?', 'Ignore the word itself. Choose the color you see the letters printed in.')}
    <p class="color-word" style="color:${ink.value}">${word.name.toUpperCase()}</p>
    <div class="color-answers">${choices.map((color) => `<button class="color-choice" style="--choice-color:${color.value}" type="button" data-color="${color.name}">${color.name}</button>`).join('')}</div>
    <p class="feedback-line" id="round-feedback" aria-live="polite"></p>`;
  elements.playPanel.querySelectorAll('.color-choice').forEach((button) => button.addEventListener('click', () => {
    if (!lockAnswer()) return;
    const correct = button.dataset.color === ink.name;
    markAnswer(correct, button, ink.name);
    showFeedback(correct ? `That's ${ink.name}, the ink color.` : `The ink color was ${ink.name}.`, correct);
    updateHud();
    schedule(renderRound, 950);
  }));
}

function renderReflexRound() {
  gameState.locked = true;
  const delay = 900 + Math.floor(Math.random() * 1500);
  elements.playPanel.innerHTML = `${panelHeading(`ROUND ${gameState.round} · STAY READY`, 'Wait for the target', 'Click it as quickly as you can when it appears. Clicking early will not score.')}
    <div class="reflex-wait" aria-label="Waiting for target">Ready?</div>
    <p class="feedback-line" id="round-feedback" aria-live="polite">Wait for green.</p>`;
  schedule(() => {
    if (!gameState || gameState.finished) return;
    gameState.locked = false;
    gameState.reflexTargetAt = performance.now();
    const wait = elements.playPanel.querySelector('.reflex-wait');
    if (!wait) return;
    wait.outerHTML = '<button class="reflex-target" id="reflex-target" type="button" aria-label="Click the target">TAP!</button>';
    document.querySelector('#round-feedback').textContent = 'Now!';
    document.querySelector('#reflex-target').addEventListener('click', () => {
      if (gameState.locked || gameState.finished || !gameState.reflexTargetAt) return;
      const elapsed = performance.now() - gameState.reflexTargetAt;
      gameState.locked = true;
      gameState.reflexTargetAt = 0;
      gameState.answered += 1;
      gameState.correct += 1;
      const bonus = elapsed < 250 ? 80 : elapsed < 400 ? 50 : elapsed < 650 ? 25 : 0;
      gameState.score += 100 + bonus;
      const target = document.querySelector('#reflex-target');
      if (target) target.disabled = true;
      showFeedback(`${Math.round(elapsed)} ms · +${100 + bonus} points${bonus ? ` (${bonus} speed bonus)` : ''}.`, true);
      updateHud();
      schedule(renderRound, 1050);
    }, { once: true });
  }, delay);
}

const patternQuestions = {
  easy: [
    { sequence: '●  ■  ●  ■  ?', answer: '●', options: ['●', '■', '▲'], explanation: 'The circle and square alternate.' },
    { sequence: '▲  ▲  ●  ▲  ▲  ?', answer: '●', options: ['●', '▲', '■'], explanation: 'Two triangles are followed by a circle.' },
    { sequence: '1  2  1  2  ?', answer: '1', options: ['1', '2', '3'], explanation: 'The numbers alternate between 1 and 2.' },
    { sequence: '◆  ●  ◆  ●  ?', answer: '◆', options: ['◆', '●', '▲'], explanation: 'The diamond and circle alternate.' },
    { sequence: '★  ☆  ★  ☆  ?', answer: '★', options: ['★', '☆', '✦'], explanation: 'Filled and outline stars alternate.' }
  ],
  medium: [
    { sequence: '▲  ●  ●  ▲  ●  ●  ?', answer: '▲', options: ['▲', '●', '■', '◆'], explanation: 'One triangle is followed by two circles.' },
    { sequence: '2  4  8  16  ?', answer: '32', options: ['24', '30', '32', '34'], explanation: 'Each number doubles.' },
    { sequence: '●  ■  ▲  ●  ■  ?', answer: '▲', options: ['●', '■', '▲', '◆'], explanation: 'The three-shape cycle repeats.' },
    { sequence: '1  3  6  10  ?', answer: '15', options: ['13', '14', '15', '16'], explanation: 'Add 2, then 3, then 4, then 5.' },
    { sequence: '◆  ◆  ○  ◆  ◆  ?', answer: '○', options: ['◆', '○', '●', '▲'], explanation: 'Two diamonds are followed by an outline circle.' },
    { sequence: 'A  C  E  G  ?', answer: 'I', options: ['H', 'I', 'J', 'K'], explanation: 'Skip one letter each time.' },
    { sequence: '5  10  20  40  ?', answer: '80', options: ['60', '70', '80', '100'], explanation: 'Each number doubles.' }
  ],
  hard: [
    { sequence: '1  4  9  16  25  ?', answer: '36', options: ['30', '35', '36', '49'], explanation: 'These are consecutive square numbers.' },
    { sequence: 'A  B  D  G  K  ?', answer: 'P', options: ['O', 'P', 'Q', 'R'], explanation: 'Move forward 1, then 2, 3, 4, and 5 letters.' },
    { sequence: '2  3  5  8  12  ?', answer: '17', options: ['15', '16', '17', '18'], explanation: 'The increments grow by 1 each time.' },
    { sequence: '●  ▲  ■  ●●  ▲▲  ?', answer: '■■', options: ['●●●', '▲▲', '■■', '●▲'], explanation: 'The three-shape cycle repeats, with each shape count increasing.' },
    { sequence: '64  32  16  8  ?', answer: '4', options: ['2', '4', '6', '7'], explanation: 'Each number is divided by 2.' },
    { sequence: '3  6  11  18  27  ?', answer: '38', options: ['36', '37', '38', '39'], explanation: 'Add consecutive odd numbers: +3, +5, +7, +9, then +11.' },
    { sequence: 'Z  X  U  Q  L  ?', answer: 'F', options: ['F', 'G', 'H', 'I'], explanation: 'Move backward 2, then 3, 4, 5, and 6 letters.' },
    { sequence: '1  2  6  24  ?', answer: '120', options: ['96', '100', '120', '144'], explanation: 'Multiply by 2, then 3, then 4, then 5.' },
    { sequence: '4  7  13  25  49  ?', answer: '97', options: ['73', '95', '97', '99'], explanation: 'The differences double: +3, +6, +12, +24, then +48.' }
  ]
};

function renderPatternRound() {
  const questions = patternQuestions[gameState.difficulty];
  const question = questions[(gameState.round - 1) % questions.length];
  elements.playPanel.innerHTML = `${panelHeading(`ROUND ${gameState.round} · SPOT THE PATTERN`, 'What comes next?')}
    <div class="sequence-display">${question.sequence}</div>
    <div class="answer-grid">${question.options.map((option) => `<button class="answer-button" type="button" data-answer="${option}">${option}</button>`).join('')}</div>
    <p class="feedback-line" id="round-feedback" aria-live="polite"></p>`;
  elements.playPanel.querySelectorAll('.answer-button').forEach((button) => button.addEventListener('click', () => {
    if (!lockAnswer()) return;
    const correct = button.dataset.answer === question.answer;
    markAnswer(correct, button, question.answer);
    showFeedback(`${correct ? 'Correct!' : `The answer was ${question.answer}.`} ${question.explanation}`, correct);
    updateHud();
    schedule(renderRound, 1450);
  }));
}

function lockAnswer() {
  if (!gameState || gameState.finished || gameState.locked) return false;
  gameState.locked = true;
  return true;
}

function markAnswer(correct, selectedButton, expectedAnswer) {
  gameState.answered += 1;
  if (correct) {
    gameState.correct += 1;
    addPoints();
    selectedButton.classList.add('correct');
  } else {
    selectedButton.classList.add('incorrect');
    const correctAnswer = [...elements.playPanel.querySelectorAll('.answer-button, .color-choice')]
      .find((button) => (button.dataset.answer ?? button.dataset.color) === expectedAnswer);
    if (correctAnswer) correctAnswer.classList.add('correct');
  }
  const buttons = elements.playPanel.querySelectorAll('button');
  buttons.forEach((button) => { button.disabled = true; });
}

function addPoints() {
  const elapsed = performance.now() - gameState.roundStartedAt;
  const speedBonus = elapsed < 2500 ? 30 : elapsed < 5000 ? 15 : 0;
  gameState.score += 100 + speedBonus;
}

function showFeedback(message, correct) {
  const feedback = document.querySelector('#round-feedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.classList.toggle('wrong', !correct);
}

function finishGame(completedAllRounds) {
  if (!gameState || gameState.finished) return;
  gameState.finished = true;
  gameState.locked = true;
  clearGameTimers();
  elements.playPanel.hidden = true;
  elements.completionPanel.hidden = false;
  const accuracy = gameState.answered ? Math.round((gameState.correct / gameState.answered) * 100) : 0;
  progress.totalPoints += gameState.score;
  progress.bestScore = Math.max(progress.bestScore, gameState.score);
  progress.completedChallenges += 1;
  const record = progress.radar[gameDetails[gameState.key].radar];
  record.correct += gameState.correct;
  record.total += gameState.answered;
  saveProgress();
  renderDashboard();

  const title = completedAllRounds ? 'Challenge complete!' : 'Time is up!';
  const summary = completedAllRounds ? 'Every round is a little more practice.' : `You reached round ${gameState.round} of ${gameState.rounds}. Your progress is saved.`;
  elements.completionPanel.innerHTML = `<div class="completion-mark" aria-hidden="true">${completedAllRounds ? '✦' : '⏱'}</div>
    <p class="eyebrow">${gameState.isDaily ? 'DAILY CHALLENGE' : 'SESSION SUMMARY'}</p>
    <h2>${title}</h2><p>${summary}</p>
    <div class="completion-stats"><div class="completion-stat"><span>POINTS</span><strong>${gameState.score}</strong></div><div class="completion-stat"><span>ACCURACY</span><strong>${accuracy}%</strong></div><div class="completion-stat"><span>ROUNDS</span><strong>${gameState.round}/${gameState.rounds}</strong></div></div>
    <div class="completion-actions"><button class="action-button primary" id="play-again" type="button">Play again</button><button class="action-button" id="return-dashboard" type="button">Return to dashboard</button></div>`;
  document.querySelector('#play-again').addEventListener('click', () => startGame(gameState.key, gameState.isDaily));
  document.querySelector('#return-dashboard').addEventListener('click', showDashboard);
}

function showDashboard() {
  clearGameTimers();
  gameState = null;
  elements.gameScreen.hidden = true;
  elements.dashboard.hidden = false;
  renderDashboard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.launch-button').forEach((button) => button.addEventListener('click', () => {
  elements.difficulty.value = elements.dashboardDifficulty.value;
  startGame(button.dataset.game);
}));
elements.dailyButton.addEventListener('click', () => {
  const dailyGame = dailyGameFor(getLocalDateKey());
  elements.difficulty.value = elements.dashboardDifficulty.value;
  startGame(dailyGame, true);
});
document.querySelector('#back-to-dashboard').addEventListener('click', showDashboard);
document.querySelector('#restart-game').addEventListener('click', () => {
  if (gameState) startGame(gameState.key, gameState.isDaily);
});
elements.difficulty.addEventListener('change', () => {
  if (gameState) startGame(gameState.key, gameState.isDaily);
});
document.querySelector('#reset-progress').addEventListener('click', () => {
  if (!window.confirm('Reset all saved points, records, and performance indicators?')) return;
  progress = emptyProgress();
  saveProgress();
  renderDashboard();
});

renderDashboard();
