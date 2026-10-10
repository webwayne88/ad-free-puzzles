import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAbRound, scoreAb } from '../js/analyst/abtest.js';
import { createCorrelationRounds, realPairs, scoreCorrelation } from '../js/analyst/correlation.js';
import { ROUNDS, createGame, next, submit, total } from '../js/analyst/game.js';
import { createMetricsRounds, scoreNumber } from '../js/analyst/metrics.js';
import { linearFit, normCdf, pearson, twoProportionTest } from '../js/analyst/stats.js';

const DATA = JSON.parse(readFileSync(new URL('../data/correlations.json', import.meta.url)));

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('нормальное распределение и z-тест для двух долей', () => {
  assert.ok(Math.abs(normCdf(1.96) - 0.975) < 1e-4);
  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-9);
  const t = twoProportionTest(1000, 100, 1000, 130);
  assert.ok(Math.abs(t.z - 2.103) < 0.01);
  assert.ok(Math.abs(t.pValue - 0.0355) < 0.002);
  assert.equal(t.winner, 'B');
  assert.ok(t.ciLow > 0 && t.ciHigh > t.ciLow);
  const same = twoProportionTest(1000, 100, 1000, 104);
  assert.equal(same.winner, 'none');
  assert.ok(same.neededN > 1000);
});

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

test('A/B: исход сценария совпадает со статистикой, встречаются все три варианта', () => {
  const rng = seeded(3);
  const winners = new Set();
  for (let k = 0; k < 60; k++) {
    const round = createAbRound(rng);
    const check = twoProportionTest(round.nA, round.cA, round.nB, round.cB);
    assert.equal(check.winner, round.test.winner);
    assert.equal(scoreAb(round.test.winner, round), 10);
    winners.add(round.test.winner);
  }
  assert.deepEqual([...winners].sort(), ['A', 'B', 'none']);
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
  const corr = createGame('corr', seeded(5), DATA);
  assert.equal(corr.rounds.length, ROUNDS);
});
