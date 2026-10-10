import { PEERS, UNITS, UNITS_OF, findHint } from './engine.js';

export const MISTAKE_LIMIT = 3;
export const HINTS_PER_GAME = 3;
const HISTORY_LIMIT = 100;
const ALL_DIGITS = 0b1111111110;

export function createGame(puzzle, solution, difficulty) {
  return {
    difficulty,
    puzzle: puzzle.slice(),
    solution: solution.slice(),
    values: puzzle.slice(),
    notes: new Array(81).fill(0),
    mistakes: 0,
    hintsLeft: HINTS_PER_GAME,
    elapsed: 0,
    selected: puzzle.findIndex((v) => v === 0),
    notesMode: false,
    showCandidates: false,
    status: 'playing',
    history: [],
  };
}

export function isGiven(game, i) {
  return game.puzzle[i] !== 0;
}

export function isLocked(game, i) {
  return game.values[i] !== 0 && game.values[i] === game.solution[i];
}

export function isWrong(game, i) {
  return game.values[i] !== 0 && game.values[i] !== game.solution[i];
}

// Цифры, которые уже стоят в строке, столбце или блоке клетки, — их нельзя пометить.
export function noteConflicts(game, i, d) {
  return PEERS[i].filter((p) => game.values[p] === d);
}

// Все цифры, которые ещё можно поставить в пустую клетку, по видимым значениям на поле.
export function candidates(game, i) {
  if (game.values[i]) return 0;
  let used = 0;
  for (const p of PEERS[i]) if (game.values[p]) used |= 1 << game.values[p];
  return ALL_DIGITS & ~used;
}

export function remainingCounts(game) {
  const counts = new Array(10).fill(9);
  for (let i = 0; i < 81; i++) if (isLocked(game, i)) counts[game.values[i]]--;
  return counts;
}

function pushHistory(game) {
  game.history.push({ values: game.values.slice(), notes: game.notes.slice(), selected: game.selected });
  if (game.history.length > HISTORY_LIMIT) game.history.shift();
}

function restoreSnapshot(game, snapshot) {
  game.values = snapshot.values;
  game.notes = snapshot.notes;
  game.selected = snapshot.selected;
}

function clearNoteInPeers(game, i, d) {
  for (const p of PEERS[i]) game.notes[p] &= ~(1 << d);
}

function completedUnits(game, i) {
  return UNITS_OF[i].filter((u) => UNITS[u].every((j) => game.values[j] === game.solution[j]));
}

function commitValue(game, i, d, settings) {
  game.values[i] = d;
  game.notes[i] = 0;
  if (d !== game.solution[i]) {
    game.mistakes++;
    if (settings.mistakeLimit && game.mistakes >= MISTAKE_LIMIT) game.status = 'lost';
    return { type: 'mistake', cell: i };
  }
  if (settings.autoNotes) clearNoteInPeers(game, i, d);
  if (game.values.every((v, j) => v === game.solution[j])) {
    game.status = 'won';
    return { type: 'won', cell: i, units: [] };
  }
  return { type: 'placed', cell: i, units: completedUnits(game, i) };
}

export function select(game, i) {
  game.selected = i;
}

export function toggleNotesMode(game) {
  game.notesMode = !game.notesMode;
}

export function toggleCandidates(game) {
  game.showCandidates = !game.showCandidates;
}

export function inputDigit(game, d, settings) {
  const i = game.selected;
  if (game.status !== 'playing' || i < 0 || isLocked(game, i)) return null;
  if (game.notesMode) {
    if (game.values[i] || game.showCandidates) return null;
    const adding = !(game.notes[i] & (1 << d));
    const conflicts = adding ? noteConflicts(game, i, d) : [];
    if (conflicts.length) return { type: 'note-blocked', cell: i, digit: d, conflicts };
    pushHistory(game);
    game.notes[i] ^= 1 << d;
    return { type: 'note', cell: i };
  }
  if (game.values[i] === d) return null;
  pushHistory(game);
  return commitValue(game, i, d, settings);
}

export function erase(game) {
  const i = game.selected;
  if (game.status !== 'playing' || i < 0 || isLocked(game, i)) return null;
  if (!game.values[i] && !game.notes[i]) return null;
  pushHistory(game);
  game.values[i] = 0;
  game.notes[i] = 0;
  return { type: 'erase', cell: i };
}

export function undo(game) {
  if (game.status !== 'playing') return null;
  const snapshot = game.history.pop();
  if (!snapshot) return null;
  restoreSnapshot(game, snapshot);
  return { type: 'undo', cell: game.selected };
}

// Подсказка открывает выбранную клетку, а если она уже решена — ту, что выводится одиночкой.
export function useHint(game, settings) {
  if (game.status !== 'playing' || game.hintsLeft <= 0) return null;
  let i = game.selected;
  if (i < 0 || isLocked(game, i)) {
    const board = game.values.map((v, j) => (v === game.solution[j] ? v : 0));
    const found = findHint(board);
    i = found ? found.i : game.values.findIndex((v, j) => v !== game.solution[j]);
  }
  if (i < 0) return null;
  pushHistory(game);
  game.hintsLeft--;
  game.selected = i;
  return { ...commitValue(game, i, game.solution[i], settings), hint: true };
}

// Второй шанс после поражения: откатываем роковой ход и оставляем одну попытку.
export function secondChance(game) {
  if (game.status !== 'lost') return;
  const snapshot = game.history.pop();
  if (snapshot) restoreSnapshot(game, snapshot);
  game.mistakes = MISTAKE_LIMIT - 1;
  game.status = 'playing';
}

export function restart(game) {
  game.values = game.puzzle.slice();
  game.notes = new Array(81).fill(0);
  game.mistakes = 0;
  game.hintsLeft = HINTS_PER_GAME;
  game.elapsed = 0;
  game.selected = game.puzzle.findIndex((v) => v === 0);
  game.notesMode = false;
  game.status = 'playing';
  game.history = [];
}
