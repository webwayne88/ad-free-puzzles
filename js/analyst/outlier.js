import { realPairs, realRound } from './correlation.js';
import { decapitalize, fromAxis } from './dataset.js';
import { formatValue, shuffle } from './stats.js';

const MIN_R = 0.6;

// Выброс — страна с наибольшим отклонением по вертикали от линии тренда (в масштабе графика).
export function createOutlierRounds(rng, data, count) {
  const pairs = shuffle(realPairs(data).filter((p) => Math.abs(p.r) >= MIN_R), rng).slice(0, count);
  return pairs.map((pair) => {
    const round = realRound(pair, rng() < 0.5, data.period);
    const residuals = round.points.map((p) => p.y - (round.fit.intercept + round.fit.slope * p.x));
    let maxIndex = 0;
    residuals.forEach((r, k) => {
      if (Math.abs(r) > Math.abs(residuals[maxIndex])) maxIndex = k;
    });
    const top = round.points[maxIndex];
    const above = residuals[maxIndex] > 0;
    const lesson = `${top.name}: ${decapitalize(round.yIndicator.title)} — ${formatValue(fromAxis(round.yIndicator, top.y))}, это заметно ${above ? 'выше' : 'ниже'}, чем обычно у стран с таким же показателем «${decapitalize(round.xIndicator.title.split(',')[0])}».`;
    return { ...round, kind: 'outlier', residuals, maxIndex, lesson };
  });
}

// Очки — квадрат доли от самого большого отклонения: второй по силе выброс даёт около 7, случайная точка — почти 0.
export function scoreOutlier(index, round) {
  const ratio = Math.abs(round.residuals[index]) / Math.abs(round.residuals[round.maxIndex]);
  return Math.round(ratio * ratio * 100) / 10;
}
