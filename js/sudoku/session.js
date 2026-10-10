import { parseGrid, solve, transformPuzzle } from './engine.js';
import { createGame } from './game.js';
import { load, remove, save } from '../storage.js';

const GAME_KEY = 'sudoku:game';
const STATS_KEY = 'sudoku:stats';

export const DIFFICULTIES = [
  { value: 'easy', label: 'Лёгкий', hint: 'Для разминки' },
  { value: 'medium', label: 'Средний', hint: 'Меньше открытых цифр' },
  { value: 'hard', label: 'Сложный', hint: 'Понадобятся пометки' },
  { value: 'expert', label: 'Эксперт', hint: 'Продвинутые техники' },
];

let bankPromise = null;

function loadBank() {
  if (!bankPromise) bankPromise = fetch('data/sudoku.json').then((response) => response.json());
  return bankPromise;
}

export function difficultyLabel(value) {
  return DIFFICULTIES.find((d) => d.value === value).label;
}

export function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}

// Головоломка из банка каждый раз перемешивается, так что повторов на практике не бывает.
export async function newGame(difficulty) {
  const bank = await loadBank();
  const list = bank[difficulty];
  const base = parseGrid(list[Math.floor(Math.random() * list.length)]);
  const { puzzle, solution } = transformPuzzle(base, solve(base));
  const game = createGame(puzzle, solution, difficulty);
  saveGame(game);
  recordStart(difficulty);
  return game;
}

export function loadGame() {
  return load(GAME_KEY, null);
}

export function saveGame(game) {
  save(GAME_KEY, game);
}

export function clearGame() {
  remove(GAME_KEY);
}

export function loadStats() {
  return load(STATS_KEY, {});
}

function statFor(stats, difficulty) {
  return stats[difficulty] ?? { played: 0, won: 0, best: null, flawless: 0 };
}

function recordStart(difficulty) {
  const stats = loadStats();
  const stat = statFor(stats, difficulty);
  stat.played++;
  stats[difficulty] = stat;
  save(STATS_KEY, stats);
}

export function recordWin(game) {
  const stats = loadStats();
  const stat = statFor(stats, game.difficulty);
  const isRecord = stat.best === null || game.elapsed < stat.best;
  stat.won++;
  if (isRecord) stat.best = game.elapsed;
  if (!game.mistakes) stat.flawless++;
  stats[game.difficulty] = stat;
  save(STATS_KEY, stats);
  return { best: stat.best, isRecord };
}
