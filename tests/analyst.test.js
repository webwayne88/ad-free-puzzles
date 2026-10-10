import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCorrelationRounds, realPairs, scoreCorrelation } from '../js/analyst/correlation.js';
import { createDistributionRounds, scoreDistribution } from '../js/analyst/distribution.js';
import { HINT_CAP, ROUNDS, createGame, next, showHint, submit, total } from '../js/analyst/game.js';
import { createMetricsRounds, scoreNumber } from '../js/analyst/metrics.js';
import { createOutlierRounds, scoreOutlier } from '../js/analyst/outlier.js';
import { createShareRounds, scoreShare } from '../js/analyst/share.js';
import { linearFit, mean, pearson, quantile, roundNice } from '../js/analyst/stats.js';
import { createTrendRounds, scoreTrend } from '../js/analyst/trend.js';

const DATA = JSON.parse(readFileSync(new URL('../data/correlations.json', import.meta.url)));
const TRENDS = JSON.parse(readFileSync(new URL('../data/trends.json', import.meta.url)));

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('корреляция и линия тренда', () => {
  const line = [1, 2, 3, 4, 5].map((x) => ({ x, y: 2 * x + 1 }));
  assert.ok(Math.abs(pearson(line) - 1) < 1e-12);
  assert.ok(Math.abs(pearson(line.map((p) => ({ x: p.x, y: -p.y }))) + 1) < 1e-12);
  const fit = linearFit(line);
  assert.ok(Math.abs(fit.slope - 2) < 1e-12 && Math.abs(fit.intercept - 1) < 1e-12);
});

test('реальные данные: все пары показателей посчитаны на достаточном числе стран', () => {
  const pairs = realPairs(DATA);
  const n = DATA.indicators.length;
  assert.equal(pairs.length, (n * (n - 1)) / 2);
  assert.ok(pairs.every((p) => p.points.length >= 100 && Math.abs(p.r) <= 1));
});

test('раунды корреляции: 8 реальных из разных диапазонов r и 2 ловушки', () => {
  const rounds = createCorrelationRounds(seeded(1), DATA);
  assert.equal(rounds.length, ROUNDS);
  assert.equal(rounds.filter((r) => r.kind === 'real').length, 8);
  assert.ok(rounds.some((r) => r.kind === 'outlier') && rounds.some((r) => r.kind === 'curve'));
  for (const round of rounds) assert.equal(round.r, Math.round(pearson(round.points) * 100) / 100);
  const real = rounds.filter((r) => r.kind === 'real');
  assert.ok(real.some((r) => r.r < -0.5) && real.some((r) => r.r > 0.5) && real.some((r) => Math.abs(r.r) < 0.5));
  assert.ok(real.every((r) => r.note.includes('Our World in Data') && r.xTitle !== r.yTitle));
  const curve = rounds.find((r) => r.kind === 'curve');
  assert.ok(Math.abs(curve.r) < 0.35);
});

test('очки за корреляцию', () => {
  assert.equal(scoreCorrelation(0.5, 0.5), 10);
  assert.equal(scoreCorrelation(0.55, 0.5), 9);
  assert.equal(scoreCorrelation(0.25, 0.5), 5);
  assert.equal(scoreCorrelation(-0.5, 0.5), 0);
});

test('метрики: 10 разных типов задач, точные ответы и разбор', () => {
  const rounds = createMetricsRounds(seeded(2), ROUNDS);
  assert.equal(new Set(rounds.map((r) => r.kind)).size, ROUNDS);
  for (const round of rounds) {
    assert.ok(Number.isFinite(round.answer) && round.question.endsWith('?') && round.explain.length > 10);
  }
});

test('метрики: проценты против процентных пунктов и «упало, потом выросло»', () => {
  for (let seed = 0; seed < 40; seed++) {
    const rounds = createMetricsRounds(seeded(seed), 12);
    const points = rounds.find((r) => r.kind === 'percentagePoints');
    const [from, to] = points.question.match(/[\d,]+(?=%)/g).map((s) => Number(s.replace(',', '.')));
    assert.ok(Math.abs(points.answer - ((to - from) / from) * 100) < 1e-9);
    const swing = rounds.find((r) => r.kind === 'downThenUp');
    const [down, up] = swing.question.match(/\d+(?=%)/g).map(Number);
    assert.ok(Math.abs(swing.answer - ((1 - down / 100) * (1 + up / 100) - 1) * 100) < 1e-9);
  }
});

test('очки за число: точный ответ с допуском 1%, частичный — до 20%', () => {
  assert.equal(scoreNumber(3, 3), 10);
  assert.equal(scoreNumber(3.02, 3), 10);
  assert.ok(scoreNumber(3.3, 3) > 4 && scoreNumber(3.3, 3) < 6);
  assert.equal(scoreNumber(10, 3), 0);
  assert.equal(scoreNumber(-25, -25), 10);
});

test('ход партии: 10 раундов, ответ → разбор → следующий → итог', () => {
  const game = createGame('metrics', seeded(4));
  for (let k = 0; k < ROUNDS; k++) {
    assert.equal(submit(game, game.rounds[game.index].answer).score, 10);
    assert.equal(submit(game, 0), null);
    next(game);
  }
  assert.equal(game.phase, 'done');
  assert.equal(total(game), 100);
  const corr = createGame('corr', seeded(5), { countries: DATA });
  assert.equal(corr.rounds.length, ROUNDS);
});

test('разбор воронки использует точную долю: 2,5% → 0,025, а не 0,03', () => {
  for (let seed = 0; seed < 60; seed++) {
    const round = createMetricsRounds(seeded(seed), 12).find((r) => r.kind === 'funnelBack');
    const [orders, fraction] = round.explain
      .match(/= ([\d\s ,]+) \/ ([\d,]+) =/)
      .slice(1)
      .map((s) => Number(s.replace(/\s/g, '').replace(',', '.')));
    assert.ok(Math.abs(orders / fraction - round.answer) < 1e-6, round.explain);
  }
});

test('квантили, «круглые» пороги и среднее', () => {
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([5], 0.9), 5);
  assert.equal(mean([1, 2, 3, 6]), 3);
  assert.equal(roundNice(13487), 13000);
  assert.equal(roundNice(72.3), 72);
});

test('среднее и медиана: разные показатели, вопросы чередуются, ответ внутри оси', () => {
  const rounds = createDistributionRounds(seeded(6), DATA, ROUNDS);
  assert.equal(rounds.length, ROUNDS);
  assert.equal(new Set(rounds.map((r) => r.title)).size, ROUNDS);
  assert.equal(rounds.filter((r) => r.ask === 'median').length, ROUNDS / 2);
  for (const r of rounds) {
    assert.ok(r.truth >= r.lo && r.truth <= r.hi);
    assert.equal(r.bins.reduce((a, b) => a + b, 0), r.values.length);
    assert.equal(scoreDistribution(r.truth, r), 10);
  }
  const gdp = rounds.find((r) => r.title.startsWith('ВВП'));
  assert.ok(gdp.mean > gdp.median * 1.15 && gdp.lesson.includes('вправо'));
});

test('доля выше порога: порог круглый, доля посчитана честно', () => {
  for (const r of createShareRounds(seeded(7), DATA, ROUNDS)) {
    assert.equal(r.above, r.values.filter((v) => v > r.threshold).length);
    assert.ok(r.truth > 0.05 && r.truth < 0.95);
    assert.equal(scoreShare(r.truth, r), 10);
    assert.equal(scoreShare(r.truth + 0.05, r), 8);
  }
});

test('выброс: самая далёкая от тренда страна даёт 10, ближайшая к тренду — около 0', () => {
  const rounds = createOutlierRounds(seeded(8), DATA, ROUNDS);
  assert.equal(rounds.length, ROUNDS);
  for (const r of rounds) {
    assert.ok(Math.abs(r.r) >= 0.6);
    assert.equal(scoreOutlier(r.maxIndex, r), 10);
    const closest = r.residuals.reduce((best, v, k) => (Math.abs(v) < Math.abs(r.residuals[best]) ? k : best), 0);
    assert.ok(scoreOutlier(closest, r) < 0.5);
    assert.ok(r.lesson.startsWith(r.points[r.maxIndex].name));
  }
});

test('тренд: показано 2000–2014, загадан 2019, ось вмещает ответ', () => {
  const rounds = createTrendRounds(seeded(9), TRENDS, ROUNDS);
  assert.equal(rounds.length, ROUNDS);
  for (const r of rounds) {
    assert.equal(r.years[r.cut], 2014);
    assert.equal(r.truth, r.values[19]);
    assert.ok(r.truth >= r.lo && r.truth <= r.hi && r.country);
    assert.equal(scoreTrend(r.truth, r), 10);
  }
});

test('подсказка с формулой ограничивает раунд', () => {
  const game = createGame('metrics', seeded(10));
  showHint(game);
  assert.equal(submit(game, game.rounds[0].answer).score, HINT_CAP);
  next(game);
  assert.equal(game.hinted, false);
  assert.equal(submit(game, game.rounds[1].answer).score, 10);
  assert.ok(game.rounds.every((r) => r.formula.includes('=')));
});

test('все режимы собираются из данных', () => {
  const data = { countries: DATA, trends: TRENDS };
  for (const mode of ['corr', 'dist', 'trend', 'outlier', 'share', 'metrics']) {
    assert.equal(createGame(mode, seeded(11), data).rounds.length, ROUNDS, mode);
  }
});
