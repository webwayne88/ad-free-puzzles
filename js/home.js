import { loadBest as loadBallzBest, loadGame as loadBallzGame, newGame as newBallzGame } from './ballz/session.js';
import { icon } from './icons.js';
import { chooseTheme } from './settings.js';
import { difficultyLabel, formatTime, loadGame, newGame } from './sudoku/session.js';
import { chooseDifficulty } from './sudoku/view.js';
import { el } from './ui.js';

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

function ballzCard(onOpen) {
  const saved = loadBallzGame();
  const best = loadBallzBest();
  const startNew = () => {
    newBallzGame();
    onOpen('ballz');
  };
  let desc = 'Шарики против блоков с числами';
  if (best) desc = `Рекорд: ${best}`;
  if (saved && saved.level > 1) desc = `Не закончено: уровень ${saved.level}`;
  return gameCard({
    logo: 'icons/ballz.svg',
    name: 'Ballz',
    desc,
    actions:
      saved && saved.level > 1
        ? [button('Новая игра', false, startNew), button('Продолжить', true, () => onOpen('ballz'))]
        : [button('Играть', true, startNew)],
  });
}

export function renderHome(root, { onOpen }) {
  const screen = el('div', 'screen home');
  screen.innerHTML = HOME_HTML;
  screen.querySelector('[data-act="theme"]').addEventListener('click', () => chooseTheme());
  screen.querySelector('.game-list').append(sudokuCard(onOpen), ballzCard(onOpen));
  root.append(screen);
}
