import { isLight, toHex } from './color.js';
import { ROUNDS, SHOW_MS, beginPick, createGame, next, submit, targetOf, total } from './game.js';
import { harmonyById } from './harmony.js';
import { createPicker, setPickerDisabled, setPickerValue } from './picker.js';
import { formatScore, recordGame } from './session.js';
import { icon } from '../icons.js';
import { chooseTheme } from '../settings.js';
import { el, isOverlayOpen, openOverlay, resultRow } from '../ui.js';

export const MODE_TITLE = { memory: 'Запомни цвет', palette: 'Допиши палитру' };

let ctx = null;

const SCREEN_HTML = `
  <header class="topbar">
    <button type="button" class="pill pill-icon" data-act="back" aria-label="Назад">${icon('back')}</button>
    <button type="button" class="pill pill-icon" data-act="theme" aria-label="Оформление">${icon('palette')}</button>
  </header>
  <main class="play">
    <section class="board-card">
      <div class="status">
        <span class="status-level hu-mode"></span>
        <span class="hu-dots" aria-hidden="true"></span>
        <span class="hu-total"></span>
      </div>
      <div class="hu-stage" aria-live="polite"></div>
      <p class="hu-caption"></p>
    </section>
    <section class="controls hu-controls">
      <div class="hu-panel">
        <div class="hu-picker-slot"></div>
        <div class="hu-result is-hidden">
          <div class="hu-score"></div>
          <p class="hu-feedback"></p>
        </div>
      </div>
      <button type="button" class="btn btn-primary hu-action" data-act="action"></button>
    </section>
  </main>`;

function randomStart() {
  return { h: Math.floor(Math.random() * 360), s: 0.5, v: 0.75 };
}

function currentRound(c) {
  return c.game.rounds[Math.min(c.game.index, c.game.rounds.length - 1)];
}

// ---------- Плитки цвета ----------

function swatch(color, label, extraClass = '') {
  const node = el('div', `hu-swatch ${extraClass}`.trim());
  paintSwatch(node, color, label);
  return node;
}

function paintSwatch(node, color, label) {
  node.style.background = toHex(color);
  node.classList.toggle('is-light', isLight(color));
  node.replaceChildren();
  if (!label) return;
  const tag = el('span', 'hu-tag');
  tag.append(el('span', 'hu-tag-name', label), el('span', 'hu-tag-hex', toHex(color)));
  node.append(tag);
}

function renderMemoryStage(c, stage) {
  const { game } = c;
  const round = currentRound(c);
  if (game.phase === 'show') {
    const node = swatch(round.target);
    const bar = el('span', 'hu-countdown');
    bar.style.animationDuration = `${SHOW_MS}ms`;
    node.append(bar);
    stage.append(node);
    return;
  }
  if (game.phase === 'pick') {
    c.els.guess = swatch(c.picker.value, 'Твой цвет');
    c.els.guessLabel = 'Твой цвет';
    stage.append(c.els.guess);
    return;
  }
  const result = game.results[game.index];
  stage.append(swatch(round.target, 'Загадан'), swatch(result.guess, 'Твой'));
}

function renderPaletteStage(c, stage) {
  const { game } = c;
  const round = currentRound(c);
  round.colors.forEach((color, k) => {
    if (k !== round.hidden) {
      stage.append(swatch(color, ' '));
      return;
    }
    if (game.phase === 'pick') {
      c.els.guess = swatch(c.picker.value, '?', 'is-guess');
      c.els.guessLabel = '?';
      stage.append(c.els.guess);
      return;
    }
    const split = el('div', 'hu-split');
    split.append(swatch(color, 'Идеал'), swatch(game.results[game.index].guess, 'Твой'));
    stage.append(split);
  });
}

function renderStage(c) {
  const stage = c.els.stage;
  stage.replaceChildren();
  c.els.guess = null;
  if (c.game.mode === 'memory') renderMemoryStage(c, stage);
  else renderPaletteStage(c, stage);
}

// ---------- Отрисовка ----------

function captionFor(c) {
  const { game } = c;
  if (game.mode === 'memory') {
    if (game.phase === 'show') return 'Запомни цвет';
    if (game.phase === 'pick') return 'Восстанови его ползунками';
    return '';
  }
  const harmony = harmonyById(currentRound(c).harmony);
  if (game.phase === 'pick') return `${harmony.name}: подбери недостающий цвет`;
  return `${harmony.name}. ${harmony.explain}`;
}

function actionLabel(game) {
  if (game.phase === 'show') return 'Запоминай…';
  if (game.phase === 'pick') return 'Ответить';
  return game.index === game.rounds.length - 1 ? 'Итоги' : 'Дальше';
}

function render(c) {
  const { game, els } = c;
  els.mode.textContent = MODE_TITLE[game.mode];
  els.total.textContent = formatScore(total(game));
  els.dots.replaceChildren();
  for (let k = 0; k < ROUNDS; k++) {
    const dot = el('span', 'hu-dot');
    dot.classList.toggle('is-done', k < game.results.length);
    dot.classList.toggle('is-current', k === game.index && game.phase !== 'reveal');
    els.dots.append(dot);
  }
  renderStage(c);
  els.caption.textContent = captionFor(c);
  const revealed = game.phase === 'reveal';
  els.pickerSlot.classList.toggle('is-hidden', revealed);
  els.result.classList.toggle('is-hidden', !revealed);
  if (revealed) {
    const result = game.results[game.index];
    els.score.innerHTML = `${formatScore(result.score)}<small> / 10</small>`;
    els.feedback.textContent = result.feedback;
  }
  els.action.textContent = actionLabel(game);
  els.action.disabled = game.phase === 'show';
}

// ---------- Ход игры ----------

function startRound(c) {
  clearTimeout(c.timer);
  setPickerValue(c.picker, randomStart());
  setPickerDisabled(c.picker, c.game.phase === 'show');
  render(c);
  if (c.game.phase !== 'show') return;
  c.timer = setTimeout(() => {
    if (ctx !== c) return;
    beginPick(c.game);
    setPickerDisabled(c.picker, false);
    render(c);
  }, SHOW_MS);
}

function onPickerChange(c, value) {
  if (c.els.guess) paintSwatch(c.els.guess, value, c.els.guessLabel);
}

function chip(color) {
  const node = el('span', 'hu-chip');
  node.style.background = toHex(color);
  return node;
}

function showResults(c) {
  const { game } = c;
  const score = total(game);
  const { best, isRecord } = recordGame(game.mode, score);
  const list = el('div', 'hu-results');
  game.rounds.forEach((round, k) => {
    const row = el('div', 'hu-results-row');
    const chips = el('span', 'hu-chips');
    chips.append(chip(targetOf(round)), chip(game.results[k].guess));
    row.append(el('span', 'result-label', `Раунд ${k + 1}`), chips, el('span', 'result-value', formatScore(game.results[k].score)));
    list.append(row);
  });
  const body = el('div');
  body.append(
    list,
    resultRow('Итого', `${formatScore(score)} из ${ROUNDS * 10}`),
    resultRow('Рекорд', isRecord ? `${formatScore(best)}, новый` : formatScore(best), isRecord),
  );
  openOverlay({
    title: 'Итоги',
    variant: 'dialog',
    dismissible: false,
    body,
    actions: [
      { label: 'На главную', onClick: () => c.onExit() },
      { label: 'Ещё раз', primary: true, onClick: () => restart(c) },
    ],
  });
}

function restart(c) {
  c.game = createGame(c.game.mode);
  startRound(c);
}

function act(c, name) {
  if (name === 'back') return c.onExit();
  if (name === 'theme') return chooseTheme();
  if (name !== 'action') return;
  if (c.game.phase === 'pick') {
    submit(c.game, c.picker.value);
    render(c);
    c.els.action.focus({ preventScroll: true });
    return;
  }
  if (c.game.phase !== 'reveal') return;
  next(c.game);
  if (c.game.phase === 'done') showResults(c);
  else startRound(c);
}

function onKeyDown(event) {
  if (!ctx || isOverlayOpen() || event.key !== 'Enter') return;
  event.preventDefault();
  act(ctx, 'action');
}

// ---------- Жизненный цикл ----------

export function mountHues(root, mode, { onExit }) {
  const screen = el('div', 'screen hues');
  screen.innerHTML = SCREEN_HTML;
  root.append(screen);
  ctx = {
    game: createGame(mode),
    onExit,
    timer: null,
    picker: null,
    els: {
      mode: screen.querySelector('.hu-mode'),
      dots: screen.querySelector('.hu-dots'),
      total: screen.querySelector('.hu-total'),
      stage: screen.querySelector('.hu-stage'),
      caption: screen.querySelector('.hu-caption'),
      pickerSlot: screen.querySelector('.hu-picker-slot'),
      result: screen.querySelector('.hu-result'),
      score: screen.querySelector('.hu-score'),
      feedback: screen.querySelector('.hu-feedback'),
      action: screen.querySelector('.hu-action'),
      guess: null,
      guessLabel: '',
    },
  };
  const c = ctx;
  c.picker = createPicker(c.els.pickerSlot, (value) => onPickerChange(c, value));
  screen.addEventListener('click', (event) => {
    const target = event.target.closest('[data-act]');
    if (target) act(c, target.dataset.act);
  });
  document.addEventListener('keydown', onKeyDown);
  startRound(c);
}

export function unmountHues() {
  if (!ctx) return;
  clearTimeout(ctx.timer);
  document.removeEventListener('keydown', onKeyDown);
  ctx = null;
}
