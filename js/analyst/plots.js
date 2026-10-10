// SVG-графики «Аналитика». Координаты — в единицах viewBox 100 × 75, подписи масштабируются вместе с графиком.
import { formatValue } from './stats.js';

const WIDTH = 100;
const HEIGHT = 75;
const RIGHT = 3;
const TOP = 6;

export function escapeText(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// «Круглый» шаг шкалы: 1, 2 или 5 × 10^k.
function niceStep(range, count) {
  const raw = range / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  if (fraction < 1.5) return power;
  if (fraction < 3) return 2 * power;
  if (fraction < 7) return 5 * power;
  return 10 * power;
}

function linearTicks(min, max, count = 4) {
  const step = niceStep(max - min, count);
  const ticks = [];
  // «|| 0» убирает −0 в подписи нулевой отметки.
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) ticks.push(Math.round(t / step) * step || 0);
  return ticks;
}

// На лог-оси — степени десятки, а если их мало, то ещё 2 и 5 × 10^k.
function logTicks(min, max) {
  const ticks = [];
  for (let k = Math.floor(min); k <= Math.ceil(max); k++) {
    for (const m of [1, 2, 5]) {
      const t = k + Math.log10(m);
      if (t >= min && t <= max) ticks.push({ t, major: m === 1 });
    }
  }
  const majors = ticks.filter((tick) => tick.major);
  return (majors.length >= 3 ? majors : ticks).map((tick) => tick.t);
}

function compactNumber(value) {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${formatValue(value / 1e6)} млн`;
  if (abs >= 1e3) return `${formatValue(value / 1e3)} тыс`;
  return formatValue(value);
}

function axisTicks(min, max, log) {
  const ticks = log ? logTicks(min, max) : linearTicks(min, max);
  return ticks.map((t) => ({ t, label: compactNumber(log ? 10 ** t : t) }));
}

function xGrid(ticks, px, bottom) {
  return ticks
    .map((tick) => {
      const x = px(tick.t).toFixed(2);
      return `<line class="an-grid" x1="${x}" y1="${TOP}" x2="${x}" y2="${HEIGHT - bottom}"/><text class="an-tick" x="${x}" y="${HEIGHT - bottom + 4.2}" text-anchor="middle">${tick.label}</text>`;
    })
    .join('');
}

function yGrid(ticks, py, left) {
  return ticks
    .map((tick) => {
      const y = py(tick.t).toFixed(2);
      return `<line class="an-grid" x1="${left}" y1="${y}" x2="${WIDTH - RIGHT}" y2="${y}"/><text class="an-tick" x="${left - 1.5}" y="${y}" dy="0.9" text-anchor="end">${tick.label}</text>`;
    })
    .join('');
}

function svg(label, body) {
  return `<svg class="an-plot" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeText(label)}">${body}</svg>`;
}

function axisTitles(xTitle, yTitle, left, bottom) {
  const x = `<text class="an-axis-title" x="${(left + WIDTH - RIGHT) / 2}" y="${HEIGHT - 1.2}" text-anchor="middle">${escapeText(xTitle)}</text>`;
  const y = yTitle
    ? `<text class="an-axis-title" transform="translate(2.6 ${(TOP + HEIGHT - bottom) / 2}) rotate(-90)" text-anchor="middle">${escapeText(yTitle)}</text>`
    : '';
  return x + y;
}

// Подпись у точки: прижимается к краям, чтобы не выходить за график.
function pointLabel(x, y, text, cls) {
  const anchor = x > WIDTH * 0.7 ? 'end' : x < WIDTH * 0.3 ? 'start' : 'middle';
  const dx = anchor === 'end' ? -2 : anchor === 'start' ? 2 : 0;
  const ty = y < TOP + 6 ? y + 5.5 : y - 2.6;
  return `<text class="an-point-label ${cls}" x="${x + dx}" y="${ty}" text-anchor="${anchor}">${escapeText(text)}</text>`;
}

// ---------- Диаграмма рассеяния ----------

export function scatterScale(round) {
  const left = round.ticks ? 15 : 7;
  const bottom = round.ticks ? 13 : 9;
  const xs = round.points.map((p) => p.x);
  const ys = round.points.map((p) => p.y);
  const xPad = (Math.max(...xs) - Math.min(...xs)) * 0.04;
  const yPad = (Math.max(...ys) - Math.min(...ys)) * 0.04;
  const x0 = Math.min(...xs) - xPad;
  const x1 = Math.max(...xs) + xPad;
  const y0 = Math.min(...ys) - yPad;
  const y1 = Math.max(...ys) + yPad;
  return {
    left,
    bottom,
    x0,
    x1,
    y0,
    y1,
    px: (x) => left + ((x - x0) / (x1 - x0)) * (WIDTH - left - RIGHT),
    py: (y) => HEIGHT - bottom - ((y - y0) / (y1 - y0)) * (HEIGHT - TOP - bottom),
  };
}

// selected — выбранная точка в режиме выбросов; reveal — показать тренд (и выбросы).
export function scatterSvg(round, { reveal = false, selected = null } = {}) {
  const s = scatterScale(round);
  const grid = round.ticks ? xGrid(axisTicks(s.x0, s.x1, round.xLog), s.px, s.bottom) + yGrid(axisTicks(s.y0, s.y1, round.yLog), s.py, s.left) : '';
  const dots = round.points.map((p) => `<circle cx="${s.px(p.x).toFixed(2)}" cy="${s.py(p.y).toFixed(2)}" r="0.85"/>`).join('');
  let overlay = '';
  if (reveal) {
    overlay += `<line class="an-fit" clip-path="url(#an-clip)" x1="${s.px(s.x0)}" y1="${s.py(round.fit.intercept + round.fit.slope * s.x0)}" x2="${s.px(s.x1)}" y2="${s.py(round.fit.intercept + round.fit.slope * s.x1)}"/>`;
  }
  const marks = [];
  if (round.kind === 'outlier' && reveal) marks.push({ index: round.maxIndex, cls: 'is-truth' });
  if (selected !== null && (!reveal || selected !== round.maxIndex)) marks.push({ index: selected, cls: 'is-guess' });
  for (const mark of marks) {
    const p = round.points[mark.index];
    const x = s.px(p.x);
    const y = s.py(p.y);
    if (reveal) {
      const yFit = s.py(round.fit.intercept + round.fit.slope * p.x);
      overlay += `<line class="an-residual ${mark.cls}" x1="${x}" y1="${y}" x2="${x}" y2="${yFit}"/>`;
      overlay += pointLabel(x, y, p.name, mark.cls);
    }
    overlay += `<circle class="an-mark ${mark.cls}" cx="${x}" cy="${y}" r="2"/>`;
  }
  const body = `<defs><clipPath id="an-clip"><rect x="${s.left}" y="${TOP}" width="${WIDTH - s.left - RIGHT}" height="${HEIGHT - TOP - s.bottom}"/></clipPath></defs>
    ${grid}<path class="an-axis" d="M${s.left} ${TOP} V${HEIGHT - s.bottom} H${WIDTH - RIGHT}"/>
    <g class="an-points">${dots}</g>${overlay}${axisTitles(round.xTitle, round.yTitle, s.left, s.bottom)}`;
  return svg(`Диаграмма рассеяния: ${round.yTitle} и ${round.xTitle}`, body);
}

// ---------- Вертикальные маркеры значений ----------

function valueMarkers(markers, px, bottom) {
  return markers
    .map((m, k) => {
      const x = px(m.value);
      const y = TOP + 2.5 + k * 4;
      const anchor = x > WIDTH * 0.75 ? 'end' : 'start';
      const dx = anchor === 'end' ? -1.2 : 1.2;
      return `<line class="an-marker ${m.cls}" x1="${x}" y1="${TOP}" x2="${x}" y2="${HEIGHT - bottom}"/><text class="an-marker-label ${m.cls}" x="${x + dx}" y="${y}" text-anchor="${anchor}">${escapeText(m.label)}</text>`;
    })
    .join('');
}

// ---------- Гистограмма ----------

export function histogramSvg(round, { guess, reveal = false }) {
  const left = 6;
  const bottom = 13;
  const px = (v) => left + ((v - round.lo) / (round.hi - round.lo)) * (WIDTH - left - RIGHT);
  const maxBin = Math.max(...round.bins);
  const barWidth = (WIDTH - left - RIGHT) / round.bins.length;
  const bars = round.bins
    .map((count, k) => {
      const h = (count / maxBin) * (HEIGHT - TOP - bottom - 10);
      return `<rect class="an-bar" x="${(left + k * barWidth + 0.25).toFixed(2)}" y="${(HEIGHT - bottom - h).toFixed(2)}" width="${(barWidth - 0.5).toFixed(2)}" height="${h.toFixed(2)}" rx="0.4"/>`;
    })
    .join('');
  const markers = [];
  if (reveal) {
    markers.push({ value: round.median, label: `медиана ${formatValue(round.median)}`, cls: round.ask === 'median' ? 'is-truth' : 'is-other' });
    markers.push({ value: round.mean, label: `среднее ${formatValue(round.mean)}`, cls: round.ask === 'mean' ? 'is-truth' : 'is-other' });
  }
  markers.push({ value: guess, label: `ты ${formatValue(guess)}`, cls: 'is-guess' });
  const clipped = round.clipped ? `<text class="an-tick" x="${WIDTH - RIGHT}" y="${TOP + 14}" text-anchor="end">ещё ${round.clipped} правее →</text>` : '';
  const body = `${xGrid(axisTicks(round.lo, round.hi, false), px, bottom)}
    <path class="an-axis" d="M${left} ${HEIGHT - bottom} H${WIDTH - RIGHT}"/>${bars}${valueMarkers(markers, px, bottom)}${clipped}
    ${axisTitles(round.title, '', left, bottom)}`;
  return svg(`Гистограмма: ${round.title}`, body);
}

// ---------- Точечная диаграмма с порогом ----------

export function dotplotSvg(round, { reveal = false }) {
  const left = 4;
  const bottom = 13;
  const transform = (v) => (round.log ? Math.log10(v) : v);
  const ts = round.values.map(transform);
  const pad = (Math.max(...ts) - Math.min(...ts)) * 0.03;
  const t0 = Math.min(...ts) - pad;
  const t1 = Math.max(...ts) + pad;
  const px = (t) => left + ((t - t0) / (t1 - t0)) * (WIDTH - left - RIGHT);
  const columns = 46;
  const step = (WIDTH - left - RIGHT) / columns;
  const stacks = new Array(columns).fill(0);
  const placed = round.values.map((v) => {
    const column = Math.min(columns - 1, Math.floor((px(transform(v)) - left) / step));
    return { column, level: stacks[column]++, above: v > round.threshold };
  });
  const tallest = Math.max(...stacks);
  const available = HEIGHT - TOP - bottom - 6;
  const pitch = Math.min(step, available / tallest);
  const radius = Math.min(step, pitch) * 0.42;
  const dots = placed
    .map((d) => {
      const cls = reveal ? (d.above ? 'is-above' : 'is-below') : '';
      return `<circle class="an-dot ${cls}" cx="${(left + (d.column + 0.5) * step).toFixed(2)}" cy="${(HEIGHT - bottom - pitch * (d.level + 0.5)).toFixed(2)}" r="${radius.toFixed(2)}"/>`;
    })
    .join('');
  const tx = px(transform(round.threshold));
  const threshold = `<line class="an-marker is-truth" x1="${tx}" y1="${TOP}" x2="${tx}" y2="${HEIGHT - bottom}"/>
    <text class="an-marker-label is-truth" x="${tx + (tx > WIDTH * 0.7 ? -1.2 : 1.2)}" y="${TOP + 2.5}" text-anchor="${tx > WIDTH * 0.7 ? 'end' : 'start'}">порог ${formatValue(round.threshold)}</text>`;
  const body = `${xGrid(axisTicks(t0, t1, round.log), px, bottom)}
    <path class="an-axis" d="M${left} ${HEIGHT - bottom} H${WIDTH - RIGHT}"/>${dots}${threshold}
    ${axisTitles(round.log ? `${round.title}, лог. шкала` : round.title, '', left, bottom)}`;
  return svg(`Страны по показателю: ${round.title}`, body);
}

// ---------- Линия ряда ----------

export function lineSvg(round, { guess, reveal = false }) {
  const left = 13;
  const bottom = 9;
  const first = round.years[0];
  const last = round.years[round.years.length - 1];
  const px = (year) => left + ((year - first) / (last - first)) * (WIDTH - left - RIGHT - 4);
  const py = (v) => HEIGHT - bottom - ((v - round.lo) / (round.hi - round.lo)) * (HEIGHT - TOP - bottom);
  const cutYear = round.years[round.cut];
  const known = round.values.slice(0, round.cut + 1).map((v, k) => `${px(first + k).toFixed(2)},${py(v).toFixed(2)}`).join(' ');
  const yearTicks = [2000, 2005, 2010, 2015, 2019]
    .map((year) => `<text class="an-tick" x="${px(year)}" y="${HEIGHT - bottom + 4.2}" text-anchor="middle">${year}</text>`)
    .join('');
  const future = `<rect class="an-future" x="${px(cutYear)}" y="${TOP}" width="${px(last) - px(cutYear)}" height="${HEIGHT - TOP - bottom}"/>`;
  const lastKnown = { x: px(cutYear), y: py(round.values[round.cut]) };
  let overlay = `<line class="an-guess-line" x1="${lastKnown.x}" y1="${lastKnown.y}" x2="${px(last)}" y2="${py(guess)}"/>
    <circle class="an-mark is-guess" cx="${px(last)}" cy="${py(guess)}" r="1.6"/>`;
  if (reveal) {
    const actual = round.values.slice(round.cut).map((v, k) => `${px(cutYear + k).toFixed(2)},${py(v).toFixed(2)}`).join(' ');
    overlay += `<line class="an-naive" x1="${lastKnown.x}" y1="${lastKnown.y}" x2="${px(last)}" y2="${py(round.naive)}"/>`;
    overlay += `<polyline class="an-actual" points="${actual}"/><circle class="an-mark is-truth" cx="${px(last)}" cy="${py(round.truth)}" r="1.6"/>`;
    overlay += pointLabel(px(last), py(round.truth), formatValue(round.truth), 'is-truth');
  }
  const body = `${yGrid(axisTicks(round.lo, round.hi, false), py, left)}${future}
    <path class="an-axis" d="M${left} ${TOP} V${HEIGHT - bottom} H${WIDTH - RIGHT}"/>
    <polyline class="an-series" points="${known}"/>${overlay}${yearTicks}`;
  return svg(`${round.country}: ${round.title}`, body);
}
