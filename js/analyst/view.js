import { ROUNDS, createGame, next, submit, total } from './game.js';
import { formatAnswer } from './metrics.js';
import { formatNumber, recordGame } from './session.js';
import { createSlider, setSliderValue } from './slider.js';
import { icon } from '../icons.js';
import { chooseTheme } from '../settings.js';
import { el, isOverlayOpen, openOverlay, resultRow } from '../ui.js';

export const MODES = [
  { value: 'corr', label: 'Корреляция на глаз', short: 'Корреляция', hint: 'Реальные данные по странам: угадай r' },
  { value: 'metrics', label: 'Метрики в уме', short: 'Метрики', hint: 'CTR, конверсия, ROMI, воронка, проценты' },
  { value: 'ab', label: 'Значим ли A/B-тест', short: 'A/B-тест', hint: 'Победитель или шум — реши по цифрам' },
];
const MAX_INPUT = 10;
const VERDICTS = { A: 'Победил A', none: 'Разницы нет', B: 'Победил B' };
const PLOT = { width: 100, height: 75, left: 9, right: 3, top: 3, bottom: 9 };

let ctx = null;
let dataPromise = null;

const SCREEN_HTML = `
  <header class="topbar">
    <button type="button" class="pill pill-icon" data-act="back" aria-label="Назад">${icon('back')}</button>
    <button type="button" class="pill pill-icon" data-act="theme" aria-label="Оформление">${icon('palette')}</button>
  </header>
  <main class="play">
    <section class="board-card">
      <div class="status">
        <span class="status-level an-mode"></span>
        <span class="hu-dots an-dots" aria-hidden="true"></span>
        <span class="hu-total an-total"></span>
      </div>
      <div class="an-stage" aria-live="polite"></div>
      <p class="hu-caption an-caption"></p>
    </section>
    <section class="controls hu-controls">
      <div class="hu-panel">
        <div class="an-input"></div>
        <div class="hu-result an-result is-hidden">
          <div class="hu-score an-score"></div>
          <p class="hu-feedback an-feedback"></p>
          <p class="an-explain"></p>
        </div>
      </div>
      <button type="button" class="btn btn-primary hu-action an-action" data-act="action"></button>
    </section>
  </main>`;

function loadCorrelationData() {
  if (!dataPromise) dataPromise = fetch('data/correlations.json').then((response) => response.json());
  return dataPromise;
}

function escapeText(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function currentRound(c) {
  return c.game.rounds[Math.min(c.game.index, c.game.rounds.length - 1)];
}

function currentResult(c) {
  return c.game.results[c.game.index];
}

function formatR(value) {
  return formatNumber(value, 2);
}

function formatPercent(fraction, digits = 1) {
  return `${formatNumber(fraction * 100, digits)}%`;
}

// ---------- Сцена: диаграмма, задача, таблица ----------

function scatterSvg(round, reveal) {
  const { width, height, left, right, top, bottom } = PLOT;
  const xs = round.points.map((p) => p.x);
  const ys = round.points.map((p) => p.y);
  const xPad = (Math.max(...xs) - Math.min(...xs)) * 0.04;
  const yPad = (Math.max(...ys) - Math.min(...ys)) * 0.04;
  const x0 = Math.min(...xs) - xPad;
  const x1 = Math.max(...xs) + xPad;
  const y0 = Math.min(...ys) - yPad;
  const y1 = Math.max(...ys) + yPad;
  const px = (x) => left + ((x - x0) / (x1 - x0)) * (width - left - right);
  const py = (y) => height - bottom - ((y - y0) / (y1 - y0)) * (height - top - bottom);
  const dots = round.points.map((p) => `<circle cx="${px(p.x).toFixed(2)}" cy="${py(p.y).toFixed(2)}" r="0.9"/>`).join('');
  const fit = reveal
    ? `<line class="an-fit" clip-path="url(#an-clip)" x1="${px(x0)}" y1="${py(round.fit.intercept + round.fit.slope * x0)}" x2="${px(x1)}" y2="${py(round.fit.intercept + round.fit.slope * x1)}"/>`
    : '';
  return `<svg class="an-plot" viewBox="0 0 ${width} ${height}" role="img" aria-label="Диаграмма рассеяния: ${escapeText(round.yTitle)} и ${escapeText(round.xTitle)}">
    <defs><clipPath id="an-clip"><rect x="${left}" y="${top}" width="${width - left - right}" height="${height - top - bottom}"/></clipPath></defs>
    <path class="an-axis" d="M${left} ${top} V${height - bottom} H${width - right}"/>
    <g class="an-points">${dots}</g>
    ${fit}
    <text class="an-axis-title" x="${(left + width - right) / 2}" y="${height - 3}" text-anchor="middle">${escapeText(round.xTitle)}</text>
    <text class="an-axis-title" transform="translate(4.5 ${(top + height - bottom) / 2}) rotate(-90)" text-anchor="middle">${escapeText(round.yTitle)}</text>
  </svg>`;
}

function metricsStage(c, stage) {
  const round = currentRound(c);
  const question = el('p', 'an-question', round.question);
  const answer = el('div', 'an-answer');
  const sign = el('button', 'an-sign', '±');
  sign.type = 'button';
  sign.dataset.act = 'sign';
  sign.setAttribute('aria-label', 'Сменить знак');
  sign.disabled = c.game.phase !== 'pick';
  const shown = c.typed ? `${c.negative ? '−' : ''}${c.typed}` : 'Ответ';
  const value = el('span', c.typed ? 'an-value' : 'an-value is-placeholder', shown);
  answer.append(sign, value, el('span', 'an-unit', round.unit));
  stage.append(question, answer);
}

function abStage(c, stage) {
  const round = currentRound(c);
  const reveal = c.game.phase === 'reveal';
  const table = el('table', 'an-table');
  table.innerHTML = '<thead><tr><th>Вариант</th><th>Посетители</th><th>Конверсии</th><th>CR</th></tr></thead>';
  const body = el('tbody');
  for (const [name, n, conv, rate] of [
    ['A', round.nA, round.cA, round.test.pA],
    ['B', round.nB, round.cB, round.test.pB],
  ]) {
    const row = el('tr');
    row.classList.toggle('is-winner', reveal && round.test.winner === name);
    for (const text of [name, n.toLocaleString('ru-RU'), conv.toLocaleString('ru-RU'), formatPercent(rate, 2)]) row.append(el('td', '', text));
    body.append(row);
  }
  table.append(body);
  stage.append(table);
}

function renderStage(c) {
  const stage = c.els.stage;
  stage.replaceChildren();
  stage.className = `an-stage an-stage-${c.game.mode}`;
  if (c.game.mode === 'corr') stage.innerHTML = scatterSvg(currentRound(c), c.game.phase === 'reveal');
  else if (c.game.mode === 'metrics') metricsStage(c, stage);
  else abStage(c, stage);
}

// ---------- Ввод ----------

function buildInput(c) {
  const box = c.els.input;
  if (c.game.mode === 'corr') {
    c.slider = createSlider(box, { label: 'Коэффициент корреляции r', min: -1, max: 1, step: 0.01, value: 0, format: formatR });
    return;
  }
  if (c.game.mode === 'metrics') {
    const pad = el('div', 'an-numpad');
    for (const key of ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back']) {
      const button = el('button', 'an-key');
      button.type = 'button';
      button.dataset.key = key;
      if (key === 'back') {
        button.innerHTML = icon('backspace');
        button.setAttribute('aria-label', 'Стереть');
      } else button.textContent = key;
      pad.append(button);
    }
    box.append(pad);
    return;
  }
  const choices = el('div', 'an-choices');
  for (const choice of ['A', 'none', 'B']) {
    const button = el('button', 'btn an-choice', VERDICTS[choice]);
    button.type = 'button';
    button.dataset.choice = choice;
    choices.append(button);
  }
  box.append(choices);
}

function typedValue(c) {
  if (!/\d/.test(c.typed)) return null;
  return Number(`${c.negative ? '-' : ''}${c.typed.replace(',', '.')}`);
}

function typeKey(c, key) {
  if (key === 'back') c.typed = c.typed.slice(0, -1);
  else if (key === ',') {
    if (!c.typed.includes(',')) c.typed = c.typed ? `${c.typed},` : '0,';
  } else if (c.typed.length < MAX_INPUT) {
    c.typed = c.typed === '0' ? key : c.typed + key;
  }
  render(c);
}

// ---------- Разбор ответа ----------

function revealText(c) {
  const round = currentRound(c);
  const result = currentResult(c);
  if (c.game.mode === 'corr') {
    return { feedback: `r = ${formatR(round.r)}, твой ответ ${formatR(result.answer)}`, explain: round.lesson };
  }
  if (c.game.mode === 'metrics') {
    let verdict = 'Мимо';
    if (result.score === 10) verdict = 'Точно';
    else if (result.score >= 7) verdict = 'Близко';
    return { feedback: `${verdict}. Ответ: ${formatAnswer(round.answer)}${round.unit === '%' ? '' : ' '}${round.unit}`, explain: round.explain };
  }
  const t = round.test;
  const p = t.pValue < 0.001 ? '< 0,001' : formatNumber(t.pValue, 3);
  const significance = t.pValue < 0.05 ? 'меньше 0,05: разница значима.' : 'больше 0,05: такую разницу легко получить случайно.';
  const lift = t.pA > 0 ? ` (${t.diff >= 0 ? '+' : '−'}${formatNumber(Math.abs(t.diff / t.pA) * 100, 0)}%)` : '';
  let explain = `p = ${p} — ${significance} Разница B − A: ${formatNumber(t.diff * 100, 2)} п.п.${lift}, 95% ДИ от ${formatNumber(t.ciLow * 100, 2)} до ${formatNumber(t.ciHigh * 100, 2)} п.п.`;
  if (t.winner === 'none') {
    explain += Number.isFinite(t.neededN)
      ? ` Чтобы надёжно поймать такую разницу, нужно около ${(Math.ceil(t.neededN / 100) * 100).toLocaleString('ru-RU')} посетителей в каждой группе.`
      : ' Конверсии совпадают.';
  }
  const correct = result.score === 10;
  return { feedback: correct ? `Верно: ${VERDICTS[t.winner].toLowerCase()}` : `Неверно: ${VERDICTS[t.winner].toLowerCase()}`, explain };
}

// ---------- Отрисовка ----------

function captionFor(c) {
  const round = currentRound(c);
  if (c.game.mode === 'corr') return round.note;
  if (c.game.mode === 'metrics') return 'Можно округлить до сотых';
  return 'Уровень значимости 5%, двусторонний тест';
}

function render(c) {
  const { game, els } = c;
  if (!game) return;
  els.mode.textContent = MODES.find((m) => m.value === game.mode).short;
  els.total.textContent = formatNumber(total(game));
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
  els.input.classList.toggle('is-hidden', revealed);
  els.result.classList.toggle('is-hidden', !revealed);
  if (revealed) {
    const { feedback, explain } = revealText(c);
    els.score.innerHTML = `${formatNumber(currentResult(c).score)}<small> / 10</small>`;
    els.feedback.textContent = feedback;
    els.explain.textContent = explain;
  }
  const choosing = game.mode === 'ab' && game.phase === 'pick';
  els.action.classList.toggle('is-invisible', choosing);
  if (game.phase === 'pick') els.action.textContent = 'Ответить';
  else els.action.textContent = game.index === game.rounds.length - 1 ? 'Итоги' : 'Дальше';
  els.action.disabled = game.mode === 'metrics' && game.phase === 'pick' && typedValue(c) === null;
}

// ---------- Ход игры ----------

function startRound(c) {
  c.typed = '';
  c.negative = false;
  if (c.slider) setSliderValue(c.slider, 0);
  render(c);
  if (c.slider) c.slider.track.focus({ preventScroll: true });
}

function answerNow(c, answer) {
  if (answer === null || !submit(c.game, answer)) return;
  render(c);
  c.els.action.focus({ preventScroll: true });
}

function summaryRow(game) {
  if (game.mode === 'corr') {
    const error = game.results.reduce((sum, r, k) => sum + Math.abs(r.answer - game.rounds[k].r), 0) / game.results.length;
    return resultRow('Средняя ошибка r', formatR(error));
  }
  const exact = game.results.filter((r) => r.score === 10).length;
  return resultRow(game.mode === 'metrics' ? 'Точных ответов' : 'Верных решений', `${exact} из ${ROUNDS}`);
}

function showResults(c) {
  const score = total(c.game);
  const { best, isRecord } = recordGame(c.game.mode, score);
  const body = el('div', 'result');
  body.append(
    summaryRow(c.game),
    resultRow('Итого', `${formatNumber(score)} из ${ROUNDS * 10}`),
    resultRow('Рекорд', isRecord ? `${formatNumber(best)}, новый` : formatNumber(best), isRecord),
  );
  openOverlay({
    title: 'Итоги',
    variant: 'dialog',
    dismissible: false,
    body,
    actions: [
      { label: 'На главную', onClick: () => c.onExit() },
      {
        label: 'Ещё раз',
        primary: true,
        onClick: () => {
          c.game = createGame(c.game.mode, Math.random, c.data);
          startRound(c);
        },
      },
    ],
  });
}

function act(c, name) {
  if (name === 'back') return c.onExit();
  if (name === 'theme') return chooseTheme();
  if (!c.game) return;
  if (name === 'sign' && c.game.phase === 'pick') {
    c.negative = !c.negative;
    return render(c);
  }
  if (name !== 'action') return;
  if (c.game.phase === 'pick') {
    if (c.game.mode === 'corr') answerNow(c, c.slider.value);
    if (c.game.mode === 'metrics') answerNow(c, typedValue(c));
    return;
  }
  if (c.game.phase !== 'reveal') return;
  next(c.game);
  if (c.game.phase === 'done') showResults(c);
  else startRound(c);
}

const AB_KEYS = { a: 'A', ф: 'A', b: 'B', и: 'B', n: 'none', т: 'none', 0: 'none' };

function onKeyDown(event) {
  const c = ctx;
  if (!c || !c.game || isOverlayOpen() || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key;
  if (key === 'Enter') act(c, 'action');
  else if (c.game.phase !== 'pick') return;
  else if (c.game.mode === 'metrics' && /^\d$/.test(key)) typeKey(c, key);
  else if (c.game.mode === 'metrics' && (key === ',' || key === '.')) typeKey(c, ',');
  else if (c.game.mode === 'metrics' && key === 'Backspace') typeKey(c, 'back');
  else if (c.game.mode === 'metrics' && key === '-') act(c, 'sign');
  else if (c.game.mode === 'ab' && AB_KEYS[key.toLowerCase()]) answerNow(c, AB_KEYS[key.toLowerCase()]);
  else return;
  event.preventDefault();
}

// ---------- Жизненный цикл ----------

export async function mountAnalyst(root, mode, { onExit }) {
  const screen = el('div', 'screen analyst');
  screen.innerHTML = SCREEN_HTML;
  root.append(screen);
  ctx = {
    game: { mode },
    data: null,
    onExit,
    slider: null,
    typed: '',
    negative: false,
    els: {
      mode: screen.querySelector('.an-mode'),
      dots: screen.querySelector('.an-dots'),
      total: screen.querySelector('.an-total'),
      stage: screen.querySelector('.an-stage'),
      caption: screen.querySelector('.an-caption'),
      input: screen.querySelector('.an-input'),
      result: screen.querySelector('.an-result'),
      score: screen.querySelector('.an-score'),
      feedback: screen.querySelector('.an-feedback'),
      explain: screen.querySelector('.an-explain'),
      action: screen.querySelector('.an-action'),
    },
  };
  const c = ctx;
  buildInput(c);
  c.game = null;
  screen.addEventListener('click', (event) => {
    const key = event.target.closest('[data-key]');
    const choice = event.target.closest('[data-choice]');
    const action = event.target.closest('[data-act]');
    if (key && c.game && c.game.phase === 'pick') typeKey(c, key.dataset.key);
    else if (choice && c.game && c.game.phase === 'pick') answerNow(c, choice.dataset.choice);
    else if (action) act(c, action.dataset.act);
  });
  document.addEventListener('keydown', onKeyDown);
  if (mode === 'corr') {
    c.els.caption.textContent = 'Загружаю данные…';
    c.data = await loadCorrelationData();
    if (ctx !== c) return;
  }
  c.game = createGame(mode, Math.random, c.data);
  startRound(c);
}

export function unmountAnalyst() {
  if (!ctx) return;
  document.removeEventListener('keydown', onKeyDown);
  ctx = null;
}
