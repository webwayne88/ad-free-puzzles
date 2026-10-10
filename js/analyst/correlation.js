import { sourceNote } from './dataset.js';
import { gauss, linearFit, pearson, shuffle } from './stats.js';

const REAL_ROUNDS = 8;
// Границы диапазонов r: реальные раунды берём из них по очереди, чтобы партия не состояла из одних сильных связей.
const BUCKETS = [-1, -0.5, 0, 0.5, 1.01];

function roundR(r) {
  return Math.round(r * 100) / 100;
}

function axisTitle(indicator) {
  return indicator.log ? `${indicator.title}, лог. шкала` : indicator.title;
}

function realLesson(r) {
  if (Math.abs(r) >= 0.5) return 'Сильная связь — ещё не причинность: обе величины часто зависят от уровня развития страны.';
  if (Math.abs(r) < 0.2) return 'Связи почти нет: облако точек без наклона.';
  return 'Слабая связь: наклон угадывается, но разброс большой.';
}

// Все пары показателей по странам; скошенные показатели — в логарифме, r считается по тому, что на графике.
export function realPairs(data) {
  const pairs = [];
  const transform = (indicator, value) => (indicator.log ? Math.log10(value) : value);
  for (let i = 0; i < data.indicators.length; i++) {
    for (let j = i + 1; j < data.indicators.length; j++) {
      const a = data.indicators[i];
      const b = data.indicators[j];
      const points = [];
      for (let k = 0; k < data.countries.length; k++) {
        const x = a.values[k];
        const y = b.values[k];
        if (x === null || y === null || (a.log && x <= 0) || (b.log && y <= 0)) continue;
        points.push({ x: transform(a, x), y: transform(b, y), name: data.names[k] });
      }
      pairs.push({ a, b, points, r: pearson(points) });
    }
  }
  return pairs;
}

export function realRound(pair, swap, period) {
  const x = swap ? pair.b : pair.a;
  const y = swap ? pair.a : pair.b;
  const points = swap ? pair.points.map((p) => ({ x: p.y, y: p.x, name: p.name })) : pair.points;
  const r = roundR(pair.r);
  return {
    kind: 'real',
    points,
    r,
    fit: linearFit(points),
    xTitle: axisTitle(x),
    yTitle: axisTitle(y),
    xLog: x.log,
    yLog: y.log,
    xIndicator: x,
    yIndicator: y,
    ticks: true,
    lesson: realLesson(r),
    note: sourceNote(points.length, period, [x.short, y.short]),
  };
}

function syntheticRound(rng, kind) {
  const n = 60 + Math.floor(rng() * 60);
  const points = [];
  if (kind === 'curve') {
    const sign = rng() < 0.5 ? 1 : -1;
    for (let k = 0; k < n; k++) {
      const x = rng() * 4 - 2;
      points.push({ x, y: sign * x * x + 0.35 * gauss(rng) });
    }
  } else {
    const rho = (0.5 + rng() * 0.4) * (rng() < 0.5 ? 1 : -1);
    for (let k = 0; k < n; k++) {
      const x = gauss(rng);
      points.push({ x, y: rho * x + Math.sqrt(1 - rho * rho) * gauss(rng) });
    }
    const side = rho >= 0 ? -1 : 1;
    points.push({ x: 3.6, y: side * 3.6 }, { x: -3.4, y: -side * 3.4 });
  }
  return {
    kind,
    points,
    r: roundR(pearson(points)),
    fit: linearFit(points),
    xTitle: 'X',
    yTitle: 'Y',
    xLog: false,
    yLog: false,
    ticks: false,
    lesson:
      kind === 'curve'
        ? 'Связь есть, но нелинейная: r измеряет только линейную и её почти не видит.'
        : 'Пара выбросов заметно сдвигает r — он чувствителен к крайним точкам.',
    note: 'Синтетические данные — ловушка для глаза',
  };
}

export function createCorrelationRounds(rng, data) {
  const pairs = shuffle(realPairs(data), rng);
  const buckets = BUCKETS.slice(0, -1).map((low, k) => pairs.filter((p) => p.r >= low && p.r < BUCKETS[k + 1]));
  const chosen = [];
  for (let k = 0; chosen.length < REAL_ROUNDS && k < REAL_ROUNDS * buckets.length; k++) {
    const bucket = buckets[k % buckets.length];
    if (bucket.length) chosen.push(bucket.shift());
  }
  const rounds = chosen.map((pair) => realRound(pair, rng() < 0.5, data.period));
  rounds.push(syntheticRound(rng, 'outlier'), syntheticRound(rng, 'curve'));
  return shuffle(rounds, rng);
}

// Ошибка 0.05 → 9 очков, 0.25 → 5, от 0.5 → 0.
export function scoreCorrelation(guess, r) {
  return Math.round(Math.max(0, 1 - Math.abs(guess - r) / 0.5) * 100) / 10;
}
