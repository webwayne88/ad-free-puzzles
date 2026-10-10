// Цвета в игре — HSV ({ h: 0..360, s: 0..1, v: 0..1 }), сравнение — в OKLab, близком к восприятию.
const ZERO_SCORE_DISTANCE = 0.35;

export function wrapHue(h) {
  return ((h % 360) + 360) % 360;
}

export function hsvToRgb({ h, s, v }) {
  const c = v * s;
  const sector = wrapHue(h) / 60;
  const x = c * (1 - Math.abs((sector % 2) - 1));
  let rgb;
  if (sector < 1) rgb = [c, x, 0];
  else if (sector < 2) rgb = [x, c, 0];
  else if (sector < 3) rgb = [0, c, x];
  else if (sector < 4) rgb = [0, x, c];
  else if (sector < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = v - c;
  return rgb.map((channel) => Math.round((channel + m) * 255));
}

export function toHex(hsv) {
  return `#${hsvToRgb(hsv)
    .map((n) => n.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function toLinear(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function toOklab(hsv) {
  const [r, g, b] = hsvToRgb(hsv).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function distance(x, y) {
  const p = toOklab(x);
  const q = toOklab(y);
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}

// 10 — совпадение, на пороге заметной разницы (~0.02) около 9.4, от 0.35 и дальше — 0.
export function scoreFor(d) {
  return Math.round(100 * Math.max(0, 1 - d / ZERO_SCORE_DISTANCE) ** 1.3) / 10;
}

export function isLight(hsv) {
  return toOklab(hsv).L > 0.68;
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

// Без серых и почти чёрных: их неинтересно угадывать.
export function randomColor(rng) {
  return { h: Math.floor(rng() * 360), s: round2(0.3 + rng() * 0.7), v: round2(0.4 + rng() * 0.6) };
}

// Подсказка в терминах ползунков, чтобы было понятно, что двигать. Ошибку тона
// взвешиваем насыщенностью: у блёклых цветов тон почти не виден.
export function feedback(target, guess) {
  const score = scoreFor(distance(target, guess));
  if (score >= 9.5) return 'Идеально';
  if (score >= 8) return 'Очень близко';
  const dh = Math.abs(((guess.h - target.h + 540) % 360) - 180);
  const hueError = (dh / 90) * Math.min(target.s, guess.s);
  const satError = Math.abs(guess.s - target.s);
  const valError = Math.abs(guess.v - target.v);
  const biggest = Math.max(hueError, satError, valError);
  if (biggest === valError) return guess.v > target.v ? 'Светлее, чем нужно' : 'Темнее, чем нужно';
  if (biggest === satError) return guess.s > target.s ? 'Слишком насыщенный' : 'Слишком блёклый';
  return 'Не тот оттенок';
}
