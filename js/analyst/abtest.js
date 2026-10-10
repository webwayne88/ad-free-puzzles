import { gauss, pick, twoProportionTest } from './stats.js';

const SAMPLE_SIZES = [800, 1500, 3000, 5000, 10000, 20000];
// Чаще всего в жизни разницы нет — так и в игре, чтобы не угадывалось «всегда B».
const OUTCOMES = ['none', 'none', 'none', 'none', 'B', 'B', 'B', 'A', 'A', 'A'];
const MAX_ATTEMPTS = 300;

function conversions(rng, n, p) {
  const value = Math.round(n * p + gauss(rng) * Math.sqrt(n * p * (1 - p)));
  return Math.min(n, Math.max(0, value));
}

function scenario(rng, outcome) {
  const n = pick(rng, SAMPLE_SIZES);
  const base = Math.round((0.01 + rng() * 0.12) * 1000) / 1000;
  const lift = outcome === 'none' ? 0 : (0.05 + rng() * 0.35) * (outcome === 'A' ? -1 : 1);
  const cA = conversions(rng, n, base);
  const cB = conversions(rng, n, base * (1 + lift));
  return { nA: n, cA, nB: n, cB, test: twoProportionTest(n, cA, n, cB) };
}

// Подбираем сценарий, у которого статистика даёт нужный исход.
export function createAbRound(rng) {
  const outcome = pick(rng, OUTCOMES);
  let round = scenario(rng, outcome);
  for (let k = 0; k < MAX_ATTEMPTS && round.test.winner !== outcome; k++) round = scenario(rng, outcome);
  return round;
}

export function scoreAb(choice, round) {
  return choice === round.test.winner ? 10 : 0;
}
