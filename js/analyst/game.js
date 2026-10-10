import { createCorrelationRounds, scoreCorrelation } from './correlation.js';
import { createDistributionRounds, scoreDistribution } from './distribution.js';
import { createMetricsRounds, scoreNumber } from './metrics.js';
import { createOutlierRounds, scoreOutlier } from './outlier.js';
import { createShareRounds, scoreShare } from './share.js';
import { createTrendRounds, scoreTrend } from './trend.js';

export const ROUNDS = 10;
// Подсказка с формулой ограничивает раунд: иначе её выгодно открывать всегда.
export const HINT_CAP = 8;

const MODES = {
  corr: { create: (rng, data) => createCorrelationRounds(rng, data.countries), score: (answer, round) => scoreCorrelation(answer, round.r) },
  dist: { create: (rng, data) => createDistributionRounds(rng, data.countries, ROUNDS), score: scoreDistribution },
  trend: { create: (rng, data) => createTrendRounds(rng, data.trends, ROUNDS), score: scoreTrend },
  outlier: { create: (rng, data) => createOutlierRounds(rng, data.countries, ROUNDS), score: scoreOutlier },
  share: { create: (rng, data) => createShareRounds(rng, data.countries, ROUNDS), score: scoreShare },
  metrics: { create: (rng) => createMetricsRounds(rng, ROUNDS), score: (answer, round) => scoreNumber(answer, round.answer) },
};

// data: { countries — data/correlations.json, trends — data/trends.json }; метрикам данные не нужны.
export function createGame(mode, rng = Math.random, data = {}) {
  return { mode, rounds: MODES[mode].create(rng, data), index: 0, phase: 'pick', hinted: false, results: [] };
}

export function showHint(game) {
  if (game.phase === 'pick') game.hinted = true;
}

export function submit(game, answer) {
  if (game.phase !== 'pick') return null;
  const score = MODES[game.mode].score(answer, game.rounds[game.index]);
  const result = { answer, score: game.hinted ? Math.min(score, HINT_CAP) : score, hinted: game.hinted };
  game.results.push(result);
  game.phase = 'reveal';
  return result;
}

export function next(game) {
  if (game.phase !== 'reveal') return;
  game.index++;
  game.hinted = false;
  game.phase = game.index >= game.rounds.length ? 'done' : 'pick';
}

export function total(game) {
  return Math.round(game.results.reduce((sum, result) => sum + result.score, 0) * 10) / 10;
}
