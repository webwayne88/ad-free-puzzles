import { HINT_CAP, ROUNDS, createGame, next, showHint, submit, total } from './game.js';
import { formatAnswer } from './metrics.js';
import { dotplotSvg, histogramSvg, lineSvg, scatterScale, scatterSvg } from './plots.js';
import { formatNumber, recordGame } from './session.js';
import { decapitalize } from './dataset.js';
import { createSlider } from './slider.js';
import { formatValue } from './stats.js';
import { trendLesson } from './trend.js';
import { icon } from '../icons.js';
import { chooseTheme } from '../settings.js';
import { el, isOverlayOpen, openOverlay, resultRow } from '../ui.js';

export const MODES = [
  { value: 'corr', label: 'Корреляция на глаз', short: 'Корреляция', hint: 'Угадай r по диаграмме рассеяния' },
  { value: 'dist', label: 'Среднее и медиана', short: 'Распределение', hint: 'Где центр распределения стран' },
  { value: 'trend', label: 'Продолжи тренд', short: 'Тренд', hint: 'Оцени значение через пять лет' },
  { value: 'outlier', label: 'Найди выброс', short: 'Выброс', hint: 'Страна дальше всех от тренда' },
  { value: 'share', label: 'Доля выше порога', short: 'Доля', hint: 'Какая часть стран выше линии' },
  { value: 'metrics', label: 'Метрики в уме', short: 'Метрики', hint: 'CTR, конверсия, ROMI, воронка' },
];
const MAX_INPUT = 10;
const TAP_RADIUS = 6;

let ctx = null;
let countriesPromise = null;
let trendsPromise = null;

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
      <p class="an-ask"></p>
      <div class="an-stage" aria-live="polite"></div>
      <p class="hu-caption an-caption"></p>
    </section>
    <section class="controls hu-controls">
      <div class="hu-panel">
        <div class="an-input"></div>
        <div class="hu-result an-result is-hidden">
          <div class="hu-score an-score"></div>
          <p class="hu-feedback an-feedback"></p>
          <div class="an-scale"></div>
          <p class="an-explain"></p>
        </div>
      </div>
      <button type="button" class="btn btn-primary hu-action an-action" data-act="action"></button>
    </section>
  </main>`;

function loadData(mode) {
  if (mode === 'metrics') return Promise.resolve({});
  if (mode === 'trend') {
    trendsPromise ??= fetch('data/trends.json').then((response) => response.json());
    return trendsPromise.then((trends) => ({ trends }));
  }
  countriesPromise ??= fetch('data/correlations.json').then((response) => response.json());
  return countriesPromise.then((countries) => ({ countries }));
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

function formatShare(value) {
  return `${Math.round(value * 100)}%`;
}

// ---------- Вопрос, сцена, ввод ----------

function askFor(c) {
  const round = currentRound(c);
  if (c.game.mode === 'dist') return round.ask === 'median' ? 'Где медиана?' : 'Где среднее?';
  if (c.game.mode === 'trend') return `${round.country}, ${decapitalize(round.title)}. Что будет в 2019 году?`;
  if (c.game.mode === 'outlier') return 'Какая страна сильнее всех выбивается из тренда?';
  if (c.game.mode === 'share') return `${round.title}: какая доля стран выше ${formatValue(round.threshold)}?`;
  if (c.game.mode === 'corr') return 'Насколько сильна связь?';
  return '';
}

function metricsStage(c, stage) {
  const round = currentRound(c);
  const answer = el('div', 'an-answer');
  const sign = el('button', 'an-sign', '±');
  sign.type = 'button';
  sign.dataset.act = 'sign';
  sign.setAttribute('aria-label', 'Сменить знак');
  sign.disabled = c.game.phase !== 'pick';
  const shown = c.typed ? `${c.negative ? '−' : ''}${c.typed}` : 'Ответ';
  answer.append(sign, el('span', c.typed ? 'an-value' : 'an-value is-placeholder', shown), el('span', 'an-unit', round.unit));
  stage.append(el('p', 'an-question', round.question), answer);
  if (c.game.hinted || c.game.phase === 'reveal') {
    stage.append(el('p', 'an-formula', round.formula));
  } else {
    const hint = el('button', 'an-hint', `Формула (максимум ${HINT_CAP} очков)`);
    hint.type = 'button';
    hint.dataset.act = 'hint';
    stage.append(hint);
  }
}

function renderStage(c) {
  const { game } = c;
  const stage = c.els.stage;
  const round = currentRound(c);
  const reveal = game.phase === 'reveal';
  const guess = reveal ? currentResult(c).answer : c.slider?.value;
  stage.className = `an-stage an-stage-${game.mode}`;
  stage.replaceChildren();
  if (game.mode === 'corr') stage.innerHTML = scatterSvg(round, { reveal });
  else if (game.mode === 'outlier') stage.innerHTML = scatterSvg(round, { reveal, selected: reveal ? currentResult(c).answer : c.selected });
  else if (game.mode === 'dist') stage.innerHTML = histogramSvg(round, { guess, reveal });
  else if (game.mode === 'share') stage.innerHTML = dotplotSvg(round, { reveal });
  else if (game.mode === 'trend') stage.innerHTML = lineSvg(round, { guess, reveal });
  else metricsStage(c, stage);
}

function buildNumpad(box) {
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
}

// Ползунок своего диапазона для каждого раунда: у каждого показателя своя шкала.
function sliderConfig(c) {
  const round = currentRound(c);
  const mode = c.game.mode;
  if (mode === 'corr') return { label: 'Коэффициент корреляции r', min: -1, max: 1, step: 0.01, value: 0, format: formatR };
  if (mode === 'share') return { label: 'Доля стран выше порога', min: 0, max: 1, step: 0.01, value: 0.5, format: formatShare };
  const label = mode === 'dist' ? (round.ask === 'median' ? 'Медиана' : 'Среднее') : 'Значение в 2019 году';
  const step = (round.hi - round.lo) / 400;
  return { label, min: round.lo, max: round.hi, step, value: (round.lo + round.hi) / 2, format: formatValue };
}

function buildInput(c) {
  const box = c.els.input;
  box.replaceChildren();
  c.slider = null;
  if (c.game.mode === 'metrics') return buildNumpad(box);
  if (c.game.mode === 'outlier') {
    box.append(el('p', 'an-instruction', 'Нажми на точку на графике'));
    return;
  }
  c.slider = createSlider(box, { ...sliderConfig(c), onChange: () => renderStage(c) });
  if (c.game.mode === 'corr') c.slider.track.classList.add('is-signed');
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

// Касание графика выбирает ближайшую точку в пределах TAP_RADIUS единиц viewBox.
function pickPoint(c, event) {
  const svgNode = c.els.stage.querySelector('svg');
  if (!svgNode || c.game.mode !== 'outlier' || c.game.phase !== 'pick') return;
  const point = svgNode.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const local = point.matrixTransform(svgNode.getScreenCTM().inverse());
  const round = currentRound(c);
  const s = scatterScale(round);
  let best = null;
  let bestDistance = TAP_RADIUS;
  round.points.forEach((p, k) => {
    const distance = Math.hypot(s.px(p.x) - local.x, s.py(p.y) - local.y);
    if (distance < bestDistance) {
      best = k;
      bestDistance = distance;
    }
  });
  if (best === null) return;
  c.selected = best;
  render(c);
}

// ---------- Разбор ----------

function revealText(c) {
  const round = currentRound(c);
  const result = currentResult(c);
  const mode = c.game.mode;
  if (mode === 'corr') return { feedback: `Ошибка ${formatR(Math.abs(result.answer - round.r))}`, explain: round.lesson };
  if (mode === 'dist') {
    const name = round.ask === 'median' ? 'Медиана' : 'Среднее';
    return { feedback: `${name}: ${formatValue(round.truth)}, твой ответ ${formatValue(result.answer)}`, explain: round.lesson };
  }
  if (mode === 'share') return { feedback: `Доля: ${formatShare(round.truth)}, твой ответ ${formatShare(result.answer)}`, explain: round.lesson };
  if (mode === 'trend') {
    return { feedback: `2019: ${formatValue(round.truth)}, твой ответ ${formatValue(result.answer)}`, explain: trendLesson(result.answer, round) };
  }
  if (mode === 'outlier') {
    const top = round.points[round.maxIndex].name;
    const feedback = result.answer === round.maxIndex ? `Точно: ${top}` : `Твой выбор: ${round.points[result.answer].name}. Сильнее всех — ${top}`;
    return { feedback, explain: round.lesson };
  }
  let verdict = 'Мимо';
  if (result.hinted && result.score === HINT_CAP) verdict = 'Точно, с подсказкой';
  else if (result.score === 10) verdict = 'Точно';
  else if (result.score >= 7) verdict = 'Близко';
  return { feedback: `${verdict}. Ответ: ${formatAnswer(round.answer)}${round.unit === '%' ? '' : ' '}${round.unit}`, explain: round.explain };
}

// Шкала от −1 до 1 с метками «ты» и «r».
function rScale(guess, r) {
  const scale = el('div', 'an-rscale');
  scale.append(el('span', 'an-rscale-zero'));
  for (const [value, label, cls] of [
    [guess, 'ты', 'is-guess'],
    [r, 'r', 'is-truth'],
  ]) {
    const mark = el('span', `an-rscale-mark ${cls}`);
    mark.style.left = `${((value + 1) / 2) * 100}%`;
    mark.append(el('span', 'an-rscale-label', `${label} ${formatR(value)}`));
    scale.append(mark);
  }
  const ends = el('div', 'an-rscale-ends');
  ends.append(el('span', '', '−1'), el('span', '', '0'), el('span', '', '1'));
  const wrap = el('div', 'an-rscale-wrap');
  wrap.append(scale, ends);
  return wrap;
}

// ---------- Отрисовка ----------

function render(c) {
  const { game, els } = c;
  if (!game) return;
  const round = currentRound(c);
  els.mode.textContent = MODES.find((m) => m.value === game.mode).short;
  els.total.textContent = formatNumber(total(game));
  els.dots.replaceChildren();
  for (let k = 0; k < ROUNDS; k++) {
    const dot = el('span', 'hu-dot');
    dot.classList.toggle('is-done', k < game.results.length);
    dot.classList.toggle('is-current', k === game.index && game.phase !== 'reveal');
    els.dots.append(dot);
  }
  els.ask.textContent = askFor(c);
  els.ask.hidden = !els.ask.textContent;
  renderStage(c);
  els.caption.textContent = game.mode === 'metrics' ? 'Можно округлить до сотых' : round.note;
  const revealed = game.phase === 'reveal';
  els.input.classList.toggle('is-hidden', revealed);
  els.result.classList.toggle('is-hidden', !revealed);
  if (revealed) {
    const { feedback, explain } = revealText(c);
    els.score.innerHTML = `${formatNumber(currentResult(c).score)}<small> / 10</small>`;
    els.feedback.textContent = feedback;
    els.explain.textContent = explain;
    els.explain.hidden = !explain;
    els.scale.replaceChildren();
    if (game.mode === 'corr') els.scale.append(rScale(currentResult(c).answer, round.r));
  }
  if (game.phase === 'pick') els.action.textContent = 'Ответить';
  else els.action.textContent = game.index === game.rounds.length - 1 ? 'Итоги' : 'Дальше';
  let disabled = false;
  if (game.phase === 'pick' && game.mode === 'metrics') disabled = typedValue(c) === null;
  if (game.phase === 'pick' && game.mode === 'outlier') disabled = c.selected === null;
  els.action.disabled = disabled;
}

// ---------- Ход игры ----------

function startRound(c) {
  c.typed = '';
  c.negative = false;
  c.selected = null;
  buildInput(c);
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
  if (game.mode === 'outlier') {
    const exact = game.results.filter((r, k) => r.answer === game.rounds[k].maxIndex).length;
    return resultRow('Главный выброс найден', `${exact} из ${ROUNDS}`);
  }
  const good = game.results.filter((r) => r.score >= 8).length;
  return resultRow('Ответов на 8+ очков', `${good} из ${ROUNDS}`);
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
  if (name === 'hint') {
    showHint(c.game);
    return render(c);
  }
  if (name !== 'action') return;
  if (c.game.phase === 'pick') {
    if (c.slider) answerNow(c, c.slider.value);
    else if (c.game.mode === 'metrics') answerNow(c, typedValue(c));
    else if (c.game.mode === 'outlier') answerNow(c, c.selected);
    return;
  }
  if (c.game.phase !== 'reveal') return;
  next(c.game);
  if (c.game.phase === 'done') showResults(c);
  else startRound(c);
}

function onKeyDown(event) {
  const c = ctx;
  if (!c || !c.game || isOverlayOpen() || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key;
  const typing = c.game.mode === 'metrics' && c.game.phase === 'pick';
  if (key === 'Enter') act(c, 'action');
  else if (typing && /^\d$/.test(key)) typeKey(c, key);
  else if (typing && (key === ',' || key === '.')) typeKey(c, ',');
  else if (typing && key === 'Backspace') typeKey(c, 'back');
  else if (typing && key === '-') act(c, 'sign');
  else return;
  event.preventDefault();
}

// ---------- Жизненный цикл ----------

export async function mountAnalyst(root, mode, { onExit }) {
  const screen = el('div', `screen analyst analyst-${mode}`);
  screen.innerHTML = SCREEN_HTML;
  root.append(screen);
  ctx = {
    game: null,
    data: null,
    onExit,
    slider: null,
    selected: null,
    typed: '',
    negative: false,
    els: {
      mode: screen.querySelector('.an-mode'),
      dots: screen.querySelector('.an-dots'),
      total: screen.querySelector('.an-total'),
      ask: screen.querySelector('.an-ask'),
      stage: screen.querySelector('.an-stage'),
      caption: screen.querySelector('.an-caption'),
      input: screen.querySelector('.an-input'),
      result: screen.querySelector('.an-result'),
      score: screen.querySelector('.an-score'),
      feedback: screen.querySelector('.an-feedback'),
      explain: screen.querySelector('.an-explain'),
      scale: screen.querySelector('.an-scale'),
      action: screen.querySelector('.an-action'),
    },
  };
  const c = ctx;
  screen.addEventListener('click', (event) => {
    const key = event.target.closest('[data-key]');
    const action = event.target.closest('[data-act]');
    if (key && c.game && c.game.phase === 'pick') typeKey(c, key.dataset.key);
    else if (action) act(c, action.dataset.act);
  });
  c.els.stage.addEventListener('pointerdown', (event) => c.game && pickPoint(c, event));
  document.addEventListener('keydown', onKeyDown);
  c.els.caption.textContent = 'Загружаю данные…';
  c.data = await loadData(mode);
  if (ctx !== c) return;
  c.game = createGame(mode, Math.random, c.data);
  startRound(c);
}

export function unmountAnalyst() {
  if (!ctx) return;
  document.removeEventListener('keydown', onKeyDown);
  ctx = null;
}
