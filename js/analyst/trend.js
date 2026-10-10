import { linearFit, formatValue, scoreByError, shuffle } from './stats.js';

const CUT = 14;
const LAST = 19;

function interesting(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return max - min > Math.abs(avg) * 0.05 && values[CUT] < 99.5;
}

function axisRange(values, truth, percent) {
  const shown = values.slice(0, CUT + 1);
  const min = Math.min(...shown);
  const max = Math.max(...shown);
  const span = Math.max(max - min, Math.abs(max) * 0.1, 0.01);
  // Запас симметричный, чтобы границы оси не подсказывали направление.
  const margin = Math.max(span * 0.6, Math.abs(truth - shown[CUT]) * 1.3);
  const lo = Math.max(0, min - margin);
  let hi = max + margin;
  if (percent) hi = Math.min(100, hi);
  return { lo, hi };
}

// Ряд 2000–2014 показан, нужно оценить 2019. Индикаторы чередуются, страна — случайная с заметной динамикой.
export function createTrendRounds(rng, trends, count) {
  const indicators = shuffle(trends.indicators, rng);
  const rounds = [];
  for (let k = 0; rounds.length < count && k < count * 4; k++) {
    const indicator = indicators[k % indicators.length];
    const candidates = Object.entries(indicator.series).filter(([, values]) => interesting(values));
    if (!candidates.length) continue;
    const [code, values] = candidates[Math.floor(rng() * candidates.length)];
    const truth = values[LAST];
    const recent = values.slice(CUT - 4, CUT + 1).map((y, i) => ({ x: CUT - 4 + i, y }));
    const fit = linearFit(recent);
    const naive = fit.intercept + fit.slope * LAST;
    const { lo, hi } = axisRange(values, truth, indicator.percent);
    rounds.push({
      kind: 'trend',
      title: indicator.title,
      country: trends.names[trends.countries.indexOf(code)],
      years: trends.years,
      values,
      cut: CUT,
      truth,
      naive,
      lo,
      hi,
      note: `Данные: ${indicator.short} через Our World in Data`,
    });
  }
  return rounds;
}

export function scoreTrend(guess, round) {
  return scoreByError(Math.abs(guess - round.truth), (round.hi - round.lo) * 0.25);
}

export function trendLesson(guess, round) {
  const better = Math.abs(guess - round.truth) <= Math.abs(round.naive - round.truth);
  return `Линейное продолжение 2010–2014 дало бы ${formatValue(round.naive)}. ${better ? 'Ты точнее простой экстраполяции.' : 'Простая экстраполяция оказалась точнее.'}`;
}
