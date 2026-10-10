import { BOX_OF, COL_OF, PEERS, ROW_OF, UNITS } from './engine.js';
import {
  MISTAKE_LIMIT,
  erase,
  inputDigit,
  isGiven,
  isWrong,
  remainingCounts,
  restart,
  secondChance,
  select,
  toggleNotesMode,
  undo,
  useHint,
} from './game.js';
import { DIFFICULTIES, clearGame, difficultyLabel, formatTime, loadStats, newGame, recordWin, saveGame } from './session.js';
import { icon } from '../icons.js';
import { chooseTheme, loadSettings, saveSettings } from '../settings.js';
import { choiceList, el, isOverlayOpen, openOverlay, resultRow, switchList } from '../ui.js';

const SAVE_EVERY_MS = 5000;

let ctx = null;

const SCREEN_HTML = `
  <header class="topbar">
    <button type="button" class="pill pill-icon" data-act="back" aria-label="Назад">${icon('back')}</button>
    <div class="pill pill-group">
      <button type="button" class="pill-icon" data-act="theme" aria-label="Оформление">${icon('palette')}</button>
      <button type="button" class="pill-icon" data-act="settings" aria-label="Настройки">${icon('settings')}</button>
    </div>
  </header>
  <main class="play">
    <section class="board-card">
      <div class="status">
        <span class="status-level"></span>
        <span class="status-mistakes"></span>
        <button type="button" class="status-timer" data-act="pause" aria-label="Пауза">
          <span class="timer-text"></span>${icon('pause', 'icon icon-sm')}
        </button>
      </div>
      <div class="board-wrap">
        <div class="board" role="grid" aria-label="Поле судоку"></div>
        <div class="paused" hidden>
          <button type="button" class="paused-btn" data-act="resume" aria-label="Продолжить">${icon('play')}</button>
          <span class="paused-label">Пауза</span>
        </div>
      </div>
    </section>
    <section class="controls">
      <div class="actions">
        <button type="button" class="action" data-act="undo">
          <span class="action-icon">${icon('undo')}</span><span class="action-label">Отмена</span>
        </button>
        <button type="button" class="action" data-act="erase">
          <span class="action-icon">${icon('eraser')}</span><span class="action-label">Стереть</span>
        </button>
        <button type="button" class="action" data-act="notes" aria-pressed="false">
          <span class="action-icon">${icon('pencil')}<span class="badge badge-notes"></span></span><span class="action-label">Черновик</span>
        </button>
        <button type="button" class="action" data-act="hint">
          <span class="action-icon">${icon('bulb')}<span class="badge badge-hint"></span></span><span class="action-label">Подсказка</span>
        </button>
      </div>
      <div class="numpad"></div>
    </section>
  </main>`;

// ---------- Таймер ----------

function currentElapsed(c) {
  return c.game.elapsed + (c.runningSince ? performance.now() - c.runningSince : 0);
}

function stopClock(c) {
  if (!c.runningSince) return;
  c.game.elapsed = currentElapsed(c);
  c.runningSince = null;
}

function startClock(c) {
  if (c.runningSince || c.paused || c.game.status !== 'playing' || isOverlayOpen()) return;
  c.runningSince = performance.now();
}

function persist(c) {
  if (c.game.status === 'won') return;
  saveGame({ ...c.game, elapsed: currentElapsed(c) });
  c.lastSave = performance.now();
}

function tick(c) {
  c.els.timerText.textContent = formatTime(currentElapsed(c));
  if (c.runningSince && performance.now() - c.lastSave > SAVE_EVERY_MS) persist(c);
}

function setPaused(c, paused) {
  if (c.game.status !== 'playing') return;
  c.paused = paused;
  if (paused) stopClock(c);
  else startClock(c);
  persist(c);
  render(c);
}

// ---------- Построение DOM ----------

function buildBoard(c) {
  const board = c.els.board;
  c.els.cells = [];
  for (let r = 0; r < 9; r++) {
    const row = el('div', 'board-row');
    row.setAttribute('role', 'row');
    for (let col = 0; col < 9; col++) {
      const cell = el('div', 'cell');
      cell.setAttribute('role', 'gridcell');
      cell.dataset.i = String(r * 9 + col);
      if (col === 2 || col === 5) cell.classList.add('edge-r');
      if (r === 2 || r === 5) cell.classList.add('edge-b');
      const notes = el('span', 'cell-notes');
      for (let d = 1; d <= 9; d++) notes.append(el('span', 'note', String(d)));
      cell.append(el('span', 'cell-value'), notes);
      row.append(cell);
      c.els.cells.push(cell);
    }
    board.append(row);
  }
}

function buildNumpad(c) {
  c.els.nums = [];
  for (let d = 1; d <= 9; d++) {
    const button = el('button', 'num');
    button.type = 'button';
    button.dataset.digit = String(d);
    button.setAttribute('aria-label', `Цифра ${d}`);
    button.append(el('span', 'num-digit', String(d)), el('span', 'num-left'));
    c.els.numpad.append(button);
    c.els.nums.push(button);
  }
}

function buildDom(c) {
  const screen = el('div', 'screen sudoku');
  screen.innerHTML = SCREEN_HTML;
  c.els = {
    screen,
    level: screen.querySelector('.status-level'),
    mistakes: screen.querySelector('.status-mistakes'),
    timerText: screen.querySelector('.timer-text'),
    board: screen.querySelector('.board'),
    paused: screen.querySelector('.paused'),
    numpad: screen.querySelector('.numpad'),
    undo: screen.querySelector('[data-act="undo"]'),
    erase: screen.querySelector('[data-act="erase"]'),
    notes: screen.querySelector('[data-act="notes"]'),
    notesBadge: screen.querySelector('.badge-notes'),
    hint: screen.querySelector('[data-act="hint"]'),
    hintBadge: screen.querySelector('.badge-hint'),
  };
  buildBoard(c);
  buildNumpad(c);

  c.els.board.addEventListener('pointerdown', (event) => {
    const cell = event.target.closest('.cell');
    if (!cell || c.paused) return;
    select(c.game, Number(cell.dataset.i));
    render(c);
  });
  screen.addEventListener('click', (event) => {
    const num = event.target.closest('[data-digit]');
    if (num) {
      apply(c, inputDigit(c.game, Number(num.dataset.digit), c.settings));
      return;
    }
    const action = event.target.closest('[data-act]');
    if (action) act(c, action.dataset.act);
  });
  c.root.append(screen);
}

// ---------- Отрисовка ----------

function clashCells(game) {
  const clash = new Set();
  for (let i = 0; i < 81; i++) {
    if (!isWrong(game, i)) continue;
    for (const p of PEERS[i]) if (game.values[p] === game.values[i]) clash.add(p);
  }
  return clash;
}

function renderBoard(c) {
  const { game, settings } = c;
  const sel = game.selected;
  const selValue = sel >= 0 ? game.values[sel] : 0;
  const clash = clashCells(game);
  for (let i = 0; i < 81; i++) {
    const cell = c.els.cells[i];
    const value = game.values[i];
    const wrong = isWrong(game, i);
    const inArea =
      settings.highlightArea &&
      sel >= 0 &&
      i !== sel &&
      (ROW_OF[i] === ROW_OF[sel] || COL_OF[i] === COL_OF[sel] || BOX_OF[i] === BOX_OF[sel]);
    cell.classList.toggle('is-selected', i === sel);
    cell.classList.toggle('is-area', inArea);
    cell.classList.toggle('is-same', Boolean(settings.highlightSame && selValue && value === selValue && i !== sel));
    cell.classList.toggle('is-given', isGiven(game, i));
    cell.classList.toggle('is-user', Boolean(value) && !isGiven(game, i) && !wrong);
    cell.classList.toggle('is-wrong', wrong);
    cell.classList.toggle('is-clash', clash.has(i));
    cell.classList.toggle('has-value', Boolean(value));
    cell.firstChild.textContent = value ? String(value) : '';
    const notes = cell.lastChild.children;
    for (let d = 1; d <= 9; d++) {
      const on = !value && Boolean(game.notes[i] & (1 << d));
      notes[d - 1].classList.toggle('on', on);
      notes[d - 1].classList.toggle('match', on && d === selValue);
    }
    cell.setAttribute('aria-selected', String(i === sel));
    cell.setAttribute('aria-label', `Строка ${ROW_OF[i] + 1}, столбец ${COL_OF[i] + 1}: ${value || 'пусто'}`);
  }
}

function renderControls(c) {
  const { game } = c;
  const playing = game.status === 'playing' && !c.paused;
  const counts = remainingCounts(game);
  c.els.numpad.classList.toggle('notes-mode', game.notesMode);
  for (let d = 1; d <= 9; d++) {
    const button = c.els.nums[d - 1];
    button.lastChild.textContent = String(counts[d]);
    button.classList.toggle('is-done', counts[d] === 0);
    button.disabled = counts[d] === 0 || !playing;
  }
  c.els.undo.disabled = !playing || game.history.length === 0;
  c.els.erase.disabled = !playing;
  c.els.notes.disabled = !playing;
  c.els.notes.setAttribute('aria-pressed', String(game.notesMode));
  c.els.notes.classList.toggle('is-on', game.notesMode);
  c.els.notesBadge.textContent = game.notesMode ? 'ВКЛ' : 'ВЫКЛ';
  c.els.hint.disabled = !playing || game.hintsLeft === 0;
  c.els.hintBadge.textContent = String(game.hintsLeft);
}

function render(c) {
  const { game, settings, els } = c;
  els.level.textContent = difficultyLabel(game.difficulty);
  els.mistakes.textContent = settings.mistakeLimit
    ? `Ошибки: ${game.mistakes}/${MISTAKE_LIMIT}`
    : `Ошибки: ${game.mistakes}`;
  els.timerText.hidden = !settings.showTimer;
  els.timerText.textContent = formatTime(currentElapsed(c));
  els.paused.hidden = !c.paused;
  els.board.classList.toggle('is-paused', c.paused);
  renderBoard(c);
  renderControls(c);
}

// ---------- Анимации ----------

function animate(node, className, duration, delay = 0) {
  node.classList.remove(className);
  void node.offsetWidth;
  node.style.setProperty('--delay', `${delay}ms`);
  node.classList.add(className);
  setTimeout(() => node.classList.remove(className), duration + delay);
}

function wave(c, cells, origin) {
  for (const i of cells) {
    const distance = Math.abs(ROW_OF[i] - ROW_OF[origin]) + Math.abs(COL_OF[i] - COL_OF[origin]);
    animate(c.els.cells[i], 'wave', 600, distance * 45);
  }
}

function playEvent(c, event) {
  const value = c.els.cells[event.cell].firstChild;
  if (event.type === 'placed' || event.type === 'won') animate(value, 'pop', 220);
  if (event.type === 'mistake') animate(value, 'shake', 400);
  if (event.type === 'placed') for (const u of event.units) wave(c, UNITS[u], event.cell);
}

// ---------- Действия ----------

function apply(c, event) {
  if (!event) return;
  if (c.game.status !== 'playing') stopClock(c);
  persist(c);
  render(c);
  playEvent(c, event);
  if (c.game.status === 'won') finishWin(c, event.cell);
  if (c.game.status === 'lost') setTimeout(() => ctx === c && showLostDialog(c), 450);
}

function act(c, name) {
  if (name === 'back') return c.onExit();
  if (name === 'theme') {
    stopClock(c);
    return chooseTheme(() => resumeAfterOverlay(c));
  }
  if (name === 'settings') return openSettings(c);
  if (name === 'pause') return setPaused(c, !c.paused);
  if (name === 'resume') return setPaused(c, false);
  if (c.paused) return;
  if (name === 'undo') return apply(c, undo(c.game));
  if (name === 'erase') return apply(c, erase(c.game));
  if (name === 'hint') return apply(c, useHint(c.game, c.settings));
  if (name === 'notes') {
    toggleNotesMode(c.game);
    persist(c);
    render(c);
  }
}

// Пока открыта шторка, время не идёт; после неё перечитываем настройки.
function resumeAfterOverlay(c) {
  if (ctx !== c) return;
  c.settings = loadSettings();
  startClock(c);
  render(c);
}

function updateSetting(c, key, value) {
  c.settings[key] = value;
  saveSettings(c.settings);
  render(c);
}

function moveSelection(c, dr, dc) {
  const sel = c.game.selected < 0 ? 40 : c.game.selected;
  const r = (ROW_OF[sel] + dr + 9) % 9;
  const col = (COL_OF[sel] + dc + 9) % 9;
  select(c.game, r * 9 + col);
  render(c);
}

const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

function onKeyDown(event) {
  if (!ctx || isOverlayOpen() || event.altKey) return;
  const c = ctx;
  const key = event.key;
  if ((event.ctrlKey || event.metaKey) && key.toLowerCase() === 'z') {
    event.preventDefault();
    act(c, 'undo');
    return;
  }
  if (event.ctrlKey || event.metaKey) return;
  if (key === ' ' || key === 'p' || key === 'з') {
    event.preventDefault();
    act(c, 'pause');
    return;
  }
  if (c.paused) return;
  if (key >= '1' && key <= '9') apply(c, inputDigit(c.game, Number(key), c.settings));
  else if (key === 'Backspace' || key === 'Delete' || key === '0') act(c, 'erase');
  else if (ARROWS[key]) moveSelection(c, ...ARROWS[key]);
  else if (key === 'n' || key === 'т') act(c, 'notes');
  else if (key === 'h' || key === 'р') act(c, 'hint');
  else return;
  event.preventDefault();
}

function onVisibility() {
  if (!ctx) return;
  if (document.hidden && ctx.game.status === 'playing') setPaused(ctx, true);
}

function onPageHide() {
  if (ctx) persist(ctx);
}

// ---------- Шторки и диалоги ----------

function openSettings(c) {
  stopClock(c);
  c.settings = loadSettings();
  const list = switchList([
    { label: 'Лимит в три ошибки', checked: c.settings.mistakeLimit, onChange: (v) => updateSetting(c, 'mistakeLimit', v) },
    { label: 'Подсвечивать строку, столбец и блок', checked: c.settings.highlightArea, onChange: (v) => updateSetting(c, 'highlightArea', v) },
    { label: 'Подсвечивать одинаковые цифры', checked: c.settings.highlightSame, onChange: (v) => updateSetting(c, 'highlightSame', v) },
    { label: 'Убирать пометки автоматически', checked: c.settings.autoNotes, onChange: (v) => updateSetting(c, 'autoNotes', v) },
    { label: 'Показывать таймер', checked: c.settings.showTimer, onChange: (v) => updateSetting(c, 'showTimer', v) },
  ]);
  openOverlay({ title: 'Настройки', body: list, onClose: () => resumeAfterOverlay(c) });
}

export function chooseDifficulty(onPick, onDismiss) {
  const stats = loadStats();
  let picked = false;
  let close = null;
  const options = DIFFICULTIES.map((d) => {
    const stat = stats[d.value];
    return { ...d, meta: stat && stat.best !== null ? `рекорд ${formatTime(stat.best)}` : '' };
  });
  const list = choiceList(options, {
    onPick: (value) => {
      picked = true;
      close();
      onPick(value);
    },
  });
  close = openOverlay({
    title: 'Новая игра',
    body: list,
    onClose: () => {
      if (!picked && onDismiss) onDismiss();
    },
  });
}

function replaceGame(c, game) {
  c.game = game;
  c.paused = false;
  c.runningSince = null;
  startClock(c);
  render(c);
}

function startOver(c) {
  chooseDifficulty(
    async (difficulty) => {
      const game = await newGame(difficulty);
      if (ctx === c) replaceGame(c, game);
    },
    () => {
      if (ctx === c && c.game.status === 'lost') showLostDialog(c);
    },
  );
}

function finishWin(c, origin) {
  clearGame();
  const { best, isRecord } = recordWin(c.game);
  wave(c, [...Array(81).keys()], origin);
  const body = el('div', 'result');
  body.append(
    resultRow('Сложность', difficultyLabel(c.game.difficulty)),
    resultRow('Время', formatTime(c.game.elapsed)),
    resultRow('Ошибки', String(c.game.mistakes)),
    resultRow('Рекорд', isRecord ? `${formatTime(best)}, новый` : formatTime(best), isRecord),
  );
  setTimeout(() => {
    if (ctx !== c) return;
    openOverlay({
      title: 'Решено',
      variant: 'dialog',
      body,
      actions: [
        { label: 'На главную', onClick: () => c.onExit() },
        { label: 'Новая игра', primary: true, onClick: () => startOver(c) },
      ],
    });
  }, 1100);
}

function showLostDialog(c) {
  const body = el('p', 'overlay-text', 'Это была третья ошибка. Можно отменить последний ход и продолжить.');
  openOverlay({
    title: 'Ошибок слишком много',
    variant: 'dialog',
    dismissible: false,
    body,
    actions: [
      { label: 'Новая игра', onClick: () => startOver(c) },
      {
        label: 'Заново',
        onClick: () => {
          restart(c.game);
          replaceGame(c, c.game);
          persist(c);
        },
      },
      {
        label: 'Продолжить',
        primary: true,
        onClick: () => {
          secondChance(c.game);
          replaceGame(c, c.game);
          persist(c);
        },
      },
    ],
  });
}

// ---------- Жизненный цикл ----------

export function mountSudoku(root, game, { onExit }) {
  ctx = { root, game, onExit, settings: loadSettings(), els: {}, runningSince: null, paused: false, lastSave: 0 };
  buildDom(ctx);
  startClock(ctx);
  render(ctx);
  ctx.ticker = setInterval(tick, 250, ctx);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
  if (game.status === 'lost') showLostDialog(ctx);
}

export function unmountSudoku() {
  if (!ctx) return;
  persist(ctx);
  clearInterval(ctx.ticker);
  document.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', onPageHide);
  ctx = null;
}
