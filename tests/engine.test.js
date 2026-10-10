import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  UNITS,
  countSolutions,
  findHint,
  generatePuzzle,
  logicSolve,
  mulberry32,
  parseGrid,
  solve,
  transformPuzzle,
} from '../js/sudoku/engine.js';

const CLASSIC = parseGrid('53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79');

function isValidSolution(grid) {
  return UNITS.every((unit) => new Set(unit.map((i) => grid[i])).size === 9 && unit.every((i) => grid[i] >= 1));
}

function isSymmetric(puzzle) {
  return puzzle.every((v, i) => Boolean(v) === Boolean(puzzle[80 - i]));
}

test('solve находит корректное решение, совпадающее с подсказками', () => {
  const solution = solve(CLASSIC);
  assert.ok(isValidSolution(solution));
  CLASSIC.forEach((v, i) => v && assert.equal(solution[i], v));
});

test('countSolutions различает единственное, множественные и невозможные решения', () => {
  assert.equal(countSolutions(CLASSIC), 1);
  assert.equal(countSolutions(new Array(81).fill(0)), 2);
  const broken = CLASSIC.slice();
  broken[1] = 5;
  assert.equal(countSolutions(broken), 0);
});

test('generatePuzzle даёт единственное решение, симметрию и нужный минимум подсказок', () => {
  const rng = mulberry32(1);
  for (let k = 0; k < 10; k++) {
    const { puzzle, solution } = generatePuzzle(36, rng);
    assert.equal(countSolutions(puzzle), 1);
    assert.ok(isSymmetric(puzzle));
    assert.ok(puzzle.filter(Boolean).length >= 36);
    assert.deepEqual(solve(puzzle), solution);
  }
});

test('transformPuzzle сохраняет корректность, единственность, симметрию и сложность', () => {
  const rng = mulberry32(2);
  const solution = solve(CLASSIC);
  const { puzzle } = generatePuzzle(0, rng);
  const base = { puzzle, solution: solve(puzzle) };
  const baseLevel = logicSolve(puzzle).level;
  for (let k = 0; k < 20; k++) {
    const next = transformPuzzle(base.puzzle, base.solution, rng);
    assert.ok(isValidSolution(next.solution));
    assert.equal(countSolutions(next.puzzle), 1);
    assert.deepEqual(solve(next.puzzle), next.solution);
    assert.ok(isSymmetric(next.puzzle));
    assert.equal(logicSolve(next.puzzle).level, baseLevel);
  }
  assert.ok(isValidSolution(solution));
});

test('logicSolve никогда не ставит неверную цифру', () => {
  const rng = mulberry32(3);
  for (let k = 0; k < 40; k++) {
    const { puzzle, solution } = generatePuzzle(0, rng);
    const result = logicSolve(puzzle);
    result.values.forEach((v, i) => v && assert.equal(v, solution[i]));
    if (result.solved) assert.ok(result.level >= 1);
  }
});

test('findHint указывает клетку с верной цифрой', () => {
  const solution = solve(CLASSIC);
  const hint = findHint(CLASSIC);
  assert.equal(CLASSIC[hint.i], 0);
  assert.equal(hint.d, solution[hint.i]);
});

test('банк головоломок: каждая единственна и соответствует своему уровню', () => {
  const bank = JSON.parse(readFileSync(new URL('../data/sudoku.json', import.meta.url)));
  const expected = {
    easy: (r) => r.level === 1,
    medium: (r) => r.level === 1,
    hard: (r) => r.level === 2,
    expert: (r) => r.level >= 3,
  };
  for (const [name, check] of Object.entries(expected)) {
    assert.ok(bank[name].length >= 50, `${name}: мало головоломок`);
    for (const str of bank[name]) {
      const puzzle = parseGrid(str);
      assert.equal(countSolutions(puzzle), 1);
      const result = logicSolve(puzzle);
      assert.ok(result.solved && check(result), `${name}: ${str}`);
    }
  }
});
