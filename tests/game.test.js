import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PEERS, parseGrid, solve } from '../js/sudoku/engine.js';
import {
  MISTAKE_LIMIT,
  createGame,
  erase,
  inputDigit,
  remainingCounts,
  restart,
  secondChance,
  select,
  toggleNotesMode,
  undo,
  useHint,
} from '../js/sudoku/game.js';

const PUZZLE = parseGrid('53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79');
const SOLUTION = solve(PUZZLE);
const SETTINGS = { mistakeLimit: true, autoNotes: true };

function newGame() {
  return createGame(PUZZLE, SOLUTION, 'easy');
}

function wrongDigit(i) {
  return SOLUTION[i] === 9 ? 1 : SOLUTION[i] + 1;
}

test('неверная цифра считается ошибкой, третья ошибка завершает игру', () => {
  const game = newGame();
  const empty = PUZZLE.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  for (let k = 0; k < MISTAKE_LIMIT; k++) {
    select(game, empty[k]);
    assert.equal(inputDigit(game, wrongDigit(empty[k]), SETTINGS).type, 'mistake');
  }
  assert.equal(game.mistakes, 3);
  assert.equal(game.status, 'lost');
});

test('без лимита ошибок игра продолжается', () => {
  const game = newGame();
  select(game, 2);
  for (let k = 0; k < 5; k++) {
    game.values[2] = 0;
    inputDigit(game, wrongDigit(2), { ...SETTINGS, mistakeLimit: false });
  }
  assert.equal(game.status, 'playing');
  assert.equal(game.mistakes, 5);
});

test('второй шанс откатывает роковой ход', () => {
  const game = newGame();
  game.mistakes = MISTAKE_LIMIT - 1;
  select(game, 2);
  inputDigit(game, wrongDigit(2), SETTINGS);
  assert.equal(game.status, 'lost');
  secondChance(game);
  assert.equal(game.status, 'playing');
  assert.equal(game.values[2], 0);
  assert.equal(game.mistakes, MISTAKE_LIMIT - 1);
});

test('верная цифра снимает такие же пометки у соседей и не меняется после', () => {
  const game = newGame();
  const peer = PEERS[2].find((p) => !PUZZLE[p]);
  const d = SOLUTION[2];
  toggleNotesMode(game);
  select(game, peer);
  inputDigit(game, d, SETTINGS);
  assert.ok(game.notes[peer] & (1 << d));
  toggleNotesMode(game);
  select(game, 2);
  assert.equal(inputDigit(game, d, SETTINGS).type, 'placed');
  assert.equal(game.notes[peer] & (1 << d), 0);
  assert.equal(inputDigit(game, wrongDigit(2), SETTINGS), null);
  assert.equal(erase(game), null);
});

test('исходные цифры нельзя изменить', () => {
  const game = newGame();
  select(game, 0);
  assert.equal(inputDigit(game, 1, SETTINGS), null);
  assert.equal(erase(game), null);
});

test('отмена возвращает значения, пометки и выделение', () => {
  const game = newGame();
  select(game, 2);
  inputDigit(game, wrongDigit(2), SETTINGS);
  select(game, 3);
  undo(game);
  assert.equal(game.values[2], 0);
  assert.equal(game.selected, 2);
  assert.equal(game.mistakes, 1);
});

test('подсказка открывает выбранную клетку, а на решённой — выводимую', () => {
  const game = newGame();
  select(game, 2);
  const first = useHint(game, SETTINGS);
  assert.equal(game.values[2], SOLUTION[2]);
  assert.ok(first.hint);
  const second = useHint(game, SETTINGS);
  assert.notEqual(second.cell, 2);
  assert.equal(game.values[second.cell], SOLUTION[second.cell]);
  useHint(game, SETTINGS);
  assert.equal(game.hintsLeft, 0);
  assert.equal(useHint(game, SETTINGS), null);
});

test('заполнение поля приводит к победе, счётчики цифр обнуляются', () => {
  const game = newGame();
  let last = null;
  for (let i = 0; i < 81; i++) {
    if (PUZZLE[i]) continue;
    select(game, i);
    last = inputDigit(game, SOLUTION[i], SETTINGS);
  }
  assert.equal(last.type, 'won');
  assert.equal(game.status, 'won');
  assert.ok(remainingCounts(game).slice(1).every((n) => n === 0));
});

test('рестарт возвращает исходное поле', () => {
  const game = newGame();
  select(game, 2);
  inputDigit(game, wrongDigit(2), SETTINGS);
  restart(game);
  assert.deepEqual(game.values, PUZZLE);
  assert.equal(game.mistakes, 0);
  assert.equal(game.history.length, 0);
});
