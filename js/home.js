import { formatNumber, loadStats as loadAnalystStats } from './analyst/session.js';
import { MODES as ANALYST_MODES } from './analyst/view.js';
import { formatScore, loadStats as loadHuesStats } from './hues/session.js';
import { icon } from './icons.js';
import { loadBest as loadRicochetBest, loadGame as loadRicochetGame, newGame as newRicochetGame } from './ricochet/session.js';
import { chooseTheme } from './settings.js';
import { difficultyLabel, formatTime, loadGame, newGame } from './sudoku/session.js';
import { chooseDifficulty } from './sudoku/view.js';
import { choiceList, el, openOverlay } from './ui.js';

const HOME_HTML = `
  <header class="home-head">
    <div>
      <h1 class="home-title">Игротека</h1>
      <p class="home-sub">Без рекламы. Работает офлайн.</p>
    </div>
    <button type="button" class="pill pill-icon" data-act="theme" aria-label="Оформление">${icon('palette')}</button>
  </header>
  <div class="game-list"></div>`;

function button(label, primary, onClick) {
  const node = el('button', primary ? 'btn btn-primary' : 'btn', label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

// actions: [вторичная, основная] либо [основная]
function gameCard({ logo, name, desc, actions }) {
  const card = el('article', 'game-card');
  const top = el('div', 'game-card-top');
  const image = el('img', 'game-logo');
  image.src = logo;
  image.alt = '';
  const text = el('div');
  text.append(el('h2', 'game-name', name), el('p', 'game-desc', desc));
  top.append(image, text);
  const row = el('div', 'game-card-actions');
  row.append(...actions);
  card.append(top, row);
  return card;
}

function sudokuCard(onOpen) {
  const saved = loadGame();
  const startNew = () =>
    chooseDifficulty(async (difficulty) => {
      await newGame(difficulty);
      onOpen('sudoku');
    });
  return gameCard({
    logo: 'icons/icon.svg',
    name: 'Судоку',
    desc: saved
      ? `Не закончено: ${difficultyLabel(saved.difficulty)}, ${formatTime(saved.elapsed)}`
      : 'Классика 9×9, четыре уровня сложности',
    actions: saved
      ? [button('Новая игра', false, startNew), button('Продолжить', true, () => onOpen('sudoku'))]
      : [button('Новая игра', true, startNew)],
  });
}

function ricochetCard(onOpen) {
  const saved = loadRicochetGame();
  const best = loadRicochetBest();
  const startNew = () => {
    newRicochetGame();
    onOpen('ricochet');
  };
  let desc = 'Шарики против блоков с числами';
  if (best) desc = `Рекорд: ${best}`;
  if (saved && saved.level > 1) desc = `Не закончено: уровень ${saved.level}`;
  return gameCard({
    logo: 'icons/ricochet.svg',
    name: 'Рикошет',
    desc,
    actions:
      saved && saved.level > 1
        ? [button('Новая игра', false, startNew), button('Продолжить', true, () => onOpen('ricochet'))]
        : [button('Играть', true, startNew)],
  });
}

function huesCard(onOpen) {
  const stats = loadHuesStats();
  const bests = ['memory', 'palette'].map((mode) => stats[mode]?.best ?? null);
  const desc = bests.some((best) => best !== null)
    ? `Рекорды: цвет ${bests[0] === null ? '—' : formatScore(bests[0])}, палитра ${bests[1] === null ? '—' : formatScore(bests[1])}`
    : 'Запомни цвет или допиши гармоничную палитру';
  return gameCard({
    logo: 'icons/hues.svg',
    name: 'Оттенки',
    desc,
    actions: [
      button('Допиши палитру', false, () => onOpen('hues/palette')),
      button('Запомни цвет', true, () => onOpen('hues/memory')),
    ],
  });
}

function analystCard(onOpen) {
  const stats = loadAnalystStats();
  const options = ANALYST_MODES.map((mode) => ({
    ...mode,
    meta: stats[mode.value]?.best != null ? `рекорд ${formatNumber(stats[mode.value].best)}` : '',
  }));
  const played = options.filter((o) => o.meta);
  const choose = () => {
    let close = null;
    const list = choiceList(options, {
      onPick: (value) => {
        close();
        onOpen(`analyst/${value}`);
      },
    });
    close = openOverlay({ title: 'Режим', body: list });
  };
  return gameCard({
    logo: 'icons/analyst.svg',
    name: 'Аналитик',
    desc: played.length ? played.map((o) => `${o.short}: ${o.meta}`).join(', ') : 'Корреляции на реальных данных, метрики и A/B-тесты',
    actions: [button('Играть', true, choose)],
  });
}

export function renderHome(root, { onOpen }) {
  const screen = el('div', 'screen home');
  screen.innerHTML = HOME_HTML;
  screen.querySelector('[data-act="theme"]').addEventListener('click', () => chooseTheme());
  screen.querySelector('.game-list').append(sudokuCard(onOpen), ricochetCard(onOpen), huesCard(onOpen), analystCard(onOpen));
  root.append(screen);
}
