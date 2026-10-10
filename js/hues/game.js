import { distance, feedback, randomColor, scoreFor } from './color.js';
import { HARMONIES, createPaletteRound } from './harmony.js';

export const ROUNDS = 5;
export const SHOW_MS = 3000;

function shuffle(items, rng) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// mode: 'memory' — запомнить и повторить цвет, 'palette' — дописать гармоничную палитру.
// Фазы: show (цвет на экране) → pick (подбор) → reveal (ответ) → … → done.
export function createGame(mode, rng = Math.random) {
  const rounds =
    mode === 'memory'
      ? Array.from({ length: ROUNDS }, () => ({ target: randomColor(rng) }))
      : shuffle(HARMONIES, rng)
          .slice(0, ROUNDS)
          .map((harmony) => createPaletteRound(harmony, rng));
  return { mode, rounds, index: 0, phase: mode === 'memory' ? 'show' : 'pick', results: [] };
}

export function targetOf(round) {
  return round.target ?? round.colors[round.hidden];
}

export function beginPick(game) {
  if (game.phase === 'show') game.phase = 'pick';
}

export function submit(game, guess) {
  if (game.phase !== 'pick') return null;
  const target = targetOf(game.rounds[game.index]);
  const result = { guess: { ...guess }, score: scoreFor(distance(target, guess)), feedback: feedback(target, guess) };
  game.results.push(result);
  game.phase = 'reveal';
  return result;
}

export function next(game) {
  if (game.phase !== 'reveal') return;
  game.index++;
  if (game.index >= game.rounds.length) game.phase = 'done';
  else game.phase = game.mode === 'memory' ? 'show' : 'pick';
}

export function total(game) {
  return Math.round(game.results.reduce((sum, result) => sum + result.score, 0) * 10) / 10;
}
