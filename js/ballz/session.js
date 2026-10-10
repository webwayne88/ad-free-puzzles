import { createGame, restore, snapshot } from './engine.js';
import { load, remove, save } from '../storage.js';

const GAME_KEY = 'ballz:game';
const BEST_KEY = 'ballz:best';

// Сохраняется позиция на начало хода: незавершённый полёт при выходе переигрывается.
export function loadGame() {
  const data = load(GAME_KEY, null);
  return data ? restore(data) : null;
}

export function saveGame(state) {
  save(GAME_KEY, snapshot(state));
}

export function clearGame() {
  remove(GAME_KEY);
}

export function newGame() {
  const state = createGame();
  saveGame(state);
  return state;
}

export function loadBest() {
  return load(BEST_KEY, 0);
}

export function saveBest(value) {
  save(BEST_KEY, value);
}
