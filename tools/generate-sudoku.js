// Генерирует банк головоломок data/sudoku.json.
// Запуск: docker compose run --rm tools node tools/generate-sudoku.js [штук на уровень] [seed]
import { writeFileSync } from 'node:fs';
import { generatePuzzle, gridToString, logicSolve, mulberry32 } from '../js/sudoku/engine.js';

const LEVELS = {
  easy: { minClues: 36, accept: (result) => result.solved && result.level === 1 },
  medium: { minClues: 30, accept: (result) => result.solved && result.level === 1 },
  hard: { minClues: 0, accept: (result) => result.solved && result.level === 2 },
  expert: { minClues: 0, accept: (result) => result.solved && result.level >= 3 },
};

const perLevel = Number(process.argv[2] ?? 200);
const rng = mulberry32(Number(process.argv[3] ?? 20261010));
const bank = {};

for (const [name, level] of Object.entries(LEVELS)) {
  const seen = new Set();
  let attempts = 0;
  const started = Date.now();
  while (seen.size < perLevel) {
    attempts++;
    const { puzzle } = generatePuzzle(level.minClues, rng);
    if (level.accept(logicSolve(puzzle))) seen.add(gridToString(puzzle));
  }
  bank[name] = [...seen];
  console.error(`${name}: ${perLevel} из ${attempts} попыток, ${((Date.now() - started) / 1000).toFixed(1)} с`);
}

writeFileSync(new URL('../data/sudoku.json', import.meta.url), JSON.stringify(bank));
