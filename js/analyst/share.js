import { countryValues, sourceNote } from './dataset.js';
import { quantile, roundNice, scoreByError, shuffle } from './stats.js';

// Порог — «круглое» число около случайного квантиля от 15% до 85%, чтобы ответ не был очевиден.
export function createShareRounds(rng, data, count) {
  const indicators = shuffle(data.indicators, rng).slice(0, count);
  return indicators.map((indicator) => {
    const values = countryValues(data, indicator)
      .map((v) => v.value)
      .sort((a, b) => a - b);
    const threshold = roundNice(quantile(values, 0.15 + rng() * 0.7));
    const above = values.filter((v) => v > threshold).length;
    return {
      kind: 'share',
      title: indicator.title,
      log: indicator.log,
      values,
      threshold,
      above,
      truth: above / values.length,
      lesson: `Выше порога ${above} из ${values.length} стран.`,
      note: sourceNote(values.length, data.period, [indicator.short]),
    };
  });
}

// Ошибка 5 п.п. → 8 очков, от 25 п.п. → 0.
export function scoreShare(guess, round) {
  return scoreByError(Math.abs(guess - round.truth), 0.25);
}
