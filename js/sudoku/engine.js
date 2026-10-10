export const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const ALL = 0b1111111110;

export const ROW_OF = [];
export const COL_OF = [];
export const BOX_OF = [];
export const UNITS = [];
export const UNITS_OF = [];
export const PEERS = [];

for (let i = 0; i < 81; i++) {
  ROW_OF.push(Math.floor(i / 9));
  COL_OF.push(i % 9);
  BOX_OF.push(Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3));
}
for (let u = 0; u < 27; u++) UNITS.push([]);
for (let i = 0; i < 81; i++) {
  UNITS[ROW_OF[i]].push(i);
  UNITS[9 + COL_OF[i]].push(i);
  UNITS[18 + BOX_OF[i]].push(i);
  UNITS_OF.push([ROW_OF[i], 9 + COL_OF[i], 18 + BOX_OF[i]]);
}
for (let i = 0; i < 81; i++) {
  const peers = new Set();
  for (const u of UNITS_OF[i]) for (const j of UNITS[u]) if (j !== i) peers.add(j);
  PEERS.push([...peers]);
}

export function bitCount(mask) {
  let count = 0;
  while (mask) {
    mask &= mask - 1;
    count++;
  }
  return count;
}

export function maskDigits(mask) {
  return DIGITS.filter((d) => mask & (1 << d));
}

export function parseGrid(str) {
  return [...str].map((ch) => (ch >= '1' && ch <= '9' ? Number(ch) : 0));
}

export function gridToString(grid) {
  return grid.map((v) => (v ? String(v) : '.')).join('');
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, rng = Math.random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function combinations(items, k, start = 0, prefix = [], out = []) {
  if (prefix.length === k) {
    out.push(prefix.slice());
    return out;
  }
  for (let i = start; i < items.length; i++) {
    prefix.push(items[i]);
    combinations(items, k, i + 1, prefix, out);
    prefix.pop();
  }
  return out;
}

// ---------- Перебор: решение и проверка единственности ----------

function createSearch(grid, limit, rng) {
  const s = {
    grid: grid.slice(),
    rows: new Array(9).fill(0),
    cols: new Array(9).fill(0),
    boxes: new Array(9).fill(0),
    limit,
    rng,
    count: 0,
    first: null,
  };
  for (let i = 0; i < 81; i++) {
    const v = s.grid[i];
    if (!v) continue;
    const bit = 1 << v;
    if ((s.rows[ROW_OF[i]] | s.cols[COL_OF[i]] | s.boxes[BOX_OF[i]]) & bit) return null;
    s.rows[ROW_OF[i]] |= bit;
    s.cols[COL_OF[i]] |= bit;
    s.boxes[BOX_OF[i]] |= bit;
  }
  return s;
}

function search(s) {
  let best = -1;
  let bestMask = 0;
  let bestCount = 10;
  for (let i = 0; i < 81; i++) {
    if (s.grid[i]) continue;
    const mask = ALL & ~(s.rows[ROW_OF[i]] | s.cols[COL_OF[i]] | s.boxes[BOX_OF[i]]);
    const count = bitCount(mask);
    if (count === 0) return;
    if (count < bestCount) {
      best = i;
      bestMask = mask;
      bestCount = count;
      if (count === 1) break;
    }
  }
  if (best === -1) {
    s.count++;
    if (!s.first) s.first = s.grid.slice();
    return;
  }
  const digits = s.rng ? shuffle(maskDigits(bestMask), s.rng) : maskDigits(bestMask);
  const r = ROW_OF[best];
  const c = COL_OF[best];
  const b = BOX_OF[best];
  for (const d of digits) {
    const bit = 1 << d;
    s.grid[best] = d;
    s.rows[r] |= bit;
    s.cols[c] |= bit;
    s.boxes[b] |= bit;
    search(s);
    s.grid[best] = 0;
    s.rows[r] &= ~bit;
    s.cols[c] &= ~bit;
    s.boxes[b] &= ~bit;
    if (s.count >= s.limit) return;
  }
}

export function countSolutions(grid, limit = 2) {
  const s = createSearch(grid, limit, null);
  if (!s) return 0;
  search(s);
  return s.count;
}

export function solve(grid) {
  const s = createSearch(grid, 1, null);
  if (!s) return null;
  search(s);
  return s.first;
}

export function randomSolution(rng = Math.random) {
  const s = createSearch(new Array(81).fill(0), 1, rng);
  search(s);
  return s.first;
}

// Убираем клетки парами, симметрично относительно центра, пока решение остаётся единственным.
export function generatePuzzle(minClues, rng = Math.random) {
  const solution = randomSolution(rng);
  const puzzle = solution.slice();
  let clues = 81;
  const order = shuffle([...Array(41).keys()], rng);
  for (const i of order) {
    const j = 80 - i;
    const removed = i === j ? 1 : 2;
    if (clues - removed < minClues) continue;
    puzzle[i] = 0;
    puzzle[j] = 0;
    if (countSolutions(puzzle, 2) === 1) {
      clues -= removed;
    } else {
      puzzle[i] = solution[i];
      puzzle[j] = solution[j];
    }
  }
  return { puzzle, solution };
}

// ---------- Перестановки, сохраняющие сложность и симметрию ----------

// perm[8 - r] === 8 - perm[r] — так центральная симметрия расстановки не ломается.
function symmetricPerm(rng) {
  const outer = shuffle([0, 1, 2], rng);
  const swapMiddle = rng() < 0.5;
  const perm = new Array(9);
  for (let k = 0; k < 3; k++) {
    perm[k] = outer[k];
    perm[8 - k] = 8 - outer[k];
  }
  perm[3] = swapMiddle ? 5 : 3;
  perm[4] = 4;
  perm[5] = swapMiddle ? 3 : 5;
  return rng() < 0.5 ? perm.map((x) => 8 - x) : perm;
}

export function transformPuzzle(puzzle, solution, rng = Math.random) {
  const rows = symmetricPerm(rng);
  const cols = symmetricPerm(rng);
  const transpose = rng() < 0.5;
  const digitMap = [0, ...shuffle(DIGITS, rng)];
  const nextPuzzle = new Array(81);
  const nextSolution = new Array(81);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const src = transpose ? cols[c] * 9 + rows[r] : rows[r] * 9 + cols[c];
      nextPuzzle[r * 9 + c] = digitMap[puzzle[src]];
      nextSolution[r * 9 + c] = digitMap[solution[src]];
    }
  }
  return { puzzle: nextPuzzle, solution: nextSolution };
}

// ---------- Логический решатель: оценивает сложность так, как решает человек ----------

function createLogicState(grid) {
  const s = { values: grid.slice(), cand: new Array(81).fill(0) };
  for (let i = 0; i < 81; i++) {
    if (s.values[i]) continue;
    let used = 0;
    for (const p of PEERS[i]) if (s.values[p]) used |= 1 << s.values[p];
    s.cand[i] = ALL & ~used;
  }
  return s;
}

function place(s, i, d) {
  s.values[i] = d;
  s.cand[i] = 0;
  for (const p of PEERS[i]) s.cand[p] &= ~(1 << d);
}

function eliminate(s, cells, mask) {
  let changed = false;
  for (const i of cells) {
    if (s.cand[i] & mask) {
      s.cand[i] &= ~mask;
      changed = true;
    }
  }
  return changed;
}

function findNakedSingle(s) {
  for (let i = 0; i < 81; i++) {
    if (!s.values[i] && bitCount(s.cand[i]) === 1) return { i, d: maskDigits(s.cand[i])[0] };
  }
  return null;
}

function findHiddenSingle(s) {
  for (const unit of UNITS) {
    for (const d of DIGITS) {
      const bit = 1 << d;
      let pos = -1;
      let count = 0;
      for (const i of unit) {
        if (s.cand[i] & bit) {
          pos = i;
          count++;
        }
      }
      if (count === 1) return { i: pos, d };
    }
  }
  return null;
}

function applyNakedSingle(s) {
  const found = findNakedSingle(s);
  if (!found) return false;
  place(s, found.i, found.d);
  return true;
}

function applyHiddenSingle(s) {
  const found = findHiddenSingle(s);
  if (!found) return false;
  place(s, found.i, found.d);
  return true;
}

function applyLockedCandidates(s) {
  for (let b = 0; b < 9; b++) {
    for (const d of DIGITS) {
      const bit = 1 << d;
      const cells = UNITS[18 + b].filter((i) => s.cand[i] & bit);
      if (cells.length < 2) continue;
      const r = ROW_OF[cells[0]];
      if (cells.every((i) => ROW_OF[i] === r) && eliminate(s, UNITS[r].filter((i) => BOX_OF[i] !== b), bit)) return true;
      const c = COL_OF[cells[0]];
      if (cells.every((i) => COL_OF[i] === c) && eliminate(s, UNITS[9 + c].filter((i) => BOX_OF[i] !== b), bit)) return true;
    }
  }
  for (let u = 0; u < 18; u++) {
    for (const d of DIGITS) {
      const bit = 1 << d;
      const cells = UNITS[u].filter((i) => s.cand[i] & bit);
      if (cells.length < 2) continue;
      const b = BOX_OF[cells[0]];
      if (!cells.every((i) => BOX_OF[i] === b)) continue;
      const rest = UNITS[18 + b].filter((i) => !UNITS[u].includes(i));
      if (eliminate(s, rest, bit)) return true;
    }
  }
  return false;
}

function applyNakedSubset(s, n) {
  for (const unit of UNITS) {
    const open = unit.filter((i) => !s.values[i]);
    if (open.length <= n) continue;
    const pool = open.filter((i) => bitCount(s.cand[i]) >= 2 && bitCount(s.cand[i]) <= n);
    for (const combo of combinations(pool, n)) {
      let union = 0;
      for (const i of combo) union |= s.cand[i];
      if (bitCount(union) !== n) continue;
      if (eliminate(s, open.filter((i) => !combo.includes(i)), union)) return true;
    }
  }
  return false;
}

function applyHiddenSubset(s, n) {
  for (const unit of UNITS) {
    const open = unit.filter((i) => !s.values[i]);
    if (open.length <= n) continue;
    const digits = [];
    const where = {};
    for (const d of DIGITS) {
      const cells = open.filter((i) => s.cand[i] & (1 << d));
      if (cells.length >= 2 && cells.length <= n) {
        digits.push(d);
        where[d] = cells;
      }
    }
    for (const combo of combinations(digits, n)) {
      const cells = new Set();
      let keep = 0;
      for (const d of combo) {
        keep |= 1 << d;
        for (const i of where[d]) cells.add(i);
      }
      if (cells.size !== n) continue;
      let changed = false;
      for (const i of cells) {
        if (s.cand[i] & ~keep) {
          s.cand[i] &= keep;
          changed = true;
        }
      }
      if (changed) return true;
    }
  }
  return false;
}

// X-wing при n = 2, swordfish при n = 3.
function applyFish(s, n) {
  for (const d of DIGITS) {
    const bit = 1 << d;
    for (const byRow of [true, false]) {
      const bases = [];
      for (let a = 0; a < 9; a++) {
        const line = UNITS[byRow ? a : 9 + a];
        const cover = line.filter((i) => s.cand[i] & bit).map((i) => (byRow ? COL_OF[i] : ROW_OF[i]));
        if (cover.length >= 2 && cover.length <= n) bases.push({ a, cover });
      }
      for (const combo of combinations(bases, n)) {
        const covers = new Set();
        for (const base of combo) for (const x of base.cover) covers.add(x);
        if (covers.size !== n) continue;
        const baseLines = combo.map((base) => base.a);
        const targets = [];
        for (const x of covers) {
          for (const i of UNITS[byRow ? 9 + x : x]) {
            if (!baseLines.includes(byRow ? ROW_OF[i] : COL_OF[i])) targets.push(i);
          }
        }
        if (eliminate(s, targets, bit)) return true;
      }
    }
  }
  return false;
}

function applyYWing(s) {
  const bivalue = [];
  for (let i = 0; i < 81; i++) if (!s.values[i] && bitCount(s.cand[i]) === 2) bivalue.push(i);
  for (const pivot of bivalue) {
    const pm = s.cand[pivot];
    const wings = bivalue.filter((i) => i !== pivot && PEERS[pivot].includes(i) && bitCount(s.cand[i] & pm) === 1);
    for (const [x, y] of combinations(wings, 2)) {
      if ((s.cand[x] & pm) === (s.cand[y] & pm)) continue;
      const z = s.cand[x] & s.cand[y] & ~pm;
      if (bitCount(z) !== 1) continue;
      const targets = PEERS[x].filter((i) => i !== y && PEERS[y].includes(i));
      if (eliminate(s, targets, z)) return true;
    }
  }
  return false;
}

function applyNakedPair(s) {
  return applyNakedSubset(s, 2);
}

function applyHiddenPair(s) {
  return applyHiddenSubset(s, 2);
}

function applyNakedTriple(s) {
  return applyNakedSubset(s, 3);
}

function applyHiddenTriple(s) {
  return applyHiddenSubset(s, 3);
}

function applyXWing(s) {
  return applyFish(s, 2);
}

function applySwordfish(s) {
  return applyFish(s, 3);
}

// Уровень 1 — одиночки, 2 — блокировки и пары, 3 — тройки, X-wing, Y-wing, 4 — swordfish.
const TECHNIQUES = [
  { level: 1, apply: applyNakedSingle },
  { level: 1, apply: applyHiddenSingle },
  { level: 2, apply: applyLockedCandidates },
  { level: 2, apply: applyNakedPair },
  { level: 2, apply: applyHiddenPair },
  { level: 3, apply: applyNakedTriple },
  { level: 3, apply: applyHiddenTriple },
  { level: 3, apply: applyXWing },
  { level: 3, apply: applyYWing },
  { level: 4, apply: applySwordfish },
];

export function logicSolve(grid) {
  const s = createLogicState(grid);
  let level = 0;
  for (;;) {
    if (s.values.every(Boolean)) return { values: s.values, level, solved: true };
    let progressed = false;
    for (const technique of TECHNIQUES) {
      if (technique.apply(s)) {
        level = Math.max(level, technique.level);
        progressed = true;
        break;
      }
    }
    if (!progressed) return { values: s.values, level, solved: false };
  }
}

export function findHint(grid) {
  const s = createLogicState(grid);
  return findNakedSingle(s) || findHiddenSingle(s);
}
