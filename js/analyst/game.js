import { createAbRound, scoreAb } from './abtest.js';
import { createCorrelationRounds, scoreCorrelation } from './correlation.js';
import { createMetricsRounds, scoreNumber } from './metrics.js';

export const ROUNDS = 10;

// mode: 'corr' — корреляция на глаз (нужны данные OWID), 'metrics' — метрики в уме, 'ab' — значимость A/B.
export function createGame(mode, rng = Math.random, data = null) {
  let rounds;
  if (mode === 'corr') rounds = createCorrelationRounds(rng, data);
  else if (mode === 'metrics') rounds = createMetricsRounds(rng, ROUNDS);
  else rounds = Array.from({ length: ROUNDS }, () => createAbRound(rng));
  return { mode, rounds, index: 0, phase: 'pick', results: [] };
}

function scoreFor(mode, answer, round) {
  if (mode === 'corr') return scoreCorrelation(answer, round.r);
  if (mode === 'metrics') return scoreNumber(answer, round.answer);
  return scoreAb(answer, round);
}

export function submit(game, answer) {
  if (game.phase !== 'pick') return null;
  const result = { answer, score: scoreFor(game.mode, answer, game.rounds[game.index]) };
  game.results.push(result);
  game.phase = 'reveal';
  return result;
}

export function next(game) {
  if (game.phase !== 'reveal') return;
  game.index++;
  game.phase = game.index >= game.rounds.length ? 'done' : 'pick';
}

export function total(game) {
  return Math.round(game.results.reduce((sum, result) => sum + result.score, 0) * 10) / 10;
}
