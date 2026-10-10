import { countryValues, sourceNote } from './dataset.js';
import { formatValue, mean, quantile, scoreByError, shuffle } from './stats.js';

const IDS = ['gdp', 'co2', 'life', 'internet', 'fertility', 'urban', 'childMortality', 'schooling', 'medianAge', 'unemployment'];
const BINS = 24;
const SKEW = 1.15;

function lesson(avg, median) {
  const values = `среднее ${formatValue(avg)}, медиана ${formatValue(median)}`;
  if (avg > median * SKEW) return `Распределение скошено вправо: несколько стран с очень большими значениями тянут среднее вверх (${values}). Для «типичной страны» честнее медиана.`;
  if (avg < median / SKEW) return `Распределение скошено влево: хвост малых значений тянет среднее вниз (${values}).`;
  return `Распределение почти симметричное — среднее и медиана близки (${values}).`;
}

// Гистограмма по странам: спрашиваем то медиану, то среднее. У скошенных показателей ось обрезана по 95-му процентилю.
export function createDistributionRounds(rng, data, count) {
  const indicators = shuffle(data.indicators.filter((i) => IDS.includes(i.id)), rng).slice(0, count);
  const firstAsk = rng() < 0.5 ? 'median' : 'mean';
  return indicators.map((indicator, k) => {
    const values = countryValues(data, indicator)
      .map((v) => v.value)
      .sort((a, b) => a - b);
    const avg = mean(values);
    const median = quantile(values, 0.5);
    const span = values[values.length - 1] - values[0];
    const lo = indicator.log ? 0 : Math.max(0, values[0] - span * 0.05);
    const hi = indicator.log ? Math.max(quantile(values, 0.95) * 1.15, avg * 1.25) : values[values.length - 1] + span * 0.05;
    const bins = new Array(BINS).fill(0);
    for (const v of values) bins[Math.min(BINS - 1, Math.floor(((v - lo) / (hi - lo)) * BINS))]++;
    const ask = k % 2 === 0 ? firstAsk : firstAsk === 'median' ? 'mean' : 'median';
    return {
      kind: 'dist',
      title: indicator.title,
      ask,
      values,
      mean: avg,
      median,
      truth: ask === 'mean' ? avg : median,
      lo,
      hi,
      bins,
      clipped: values.filter((v) => v > hi).length,
      lesson: lesson(avg, median),
      note: sourceNote(values.length, data.period, [indicator.short]),
    };
  });
}

export function scoreDistribution(guess, round) {
  return scoreByError(Math.abs(guess - round.truth), (round.hi - round.lo) * 0.2);
}
