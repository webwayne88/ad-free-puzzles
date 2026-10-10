// Мир в клетках: ширина COLS, высота HEIGHT. Ряды блоков 0..ROWS-1, под ними зона запуска, пол на FLOOR.
export const COLS = 7;
export const ROWS = 9;
export const HEIGHT = 10;
export const FLOOR = HEIGHT;
export const R = 0.13;
export const GAP = 0.05;
export const RING_R = 0.22;
export const SPEED = 16;
export const INTERVAL = 0.055;
const GRAVITY = 30;
const MAX_STEP = R / 2;
const MIN_VY = 0.12;
const MIN_AIM = Math.sin((8 * Math.PI) / 180);
const PREVIEW_STEP = 0.04;

function shuffle(items, rng) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Ранние уровни — редкие ряды, дальше плотнее; одна клетка всегда остаётся под кольцо.
function blocksInRow(level, rng) {
  const min = level < 10 ? 1 : 2;
  const max = level < 5 ? 3 : level < 15 ? 5 : 6;
  return min + Math.floor(rng() * (max - min + 1));
}

function spawnRow(state, rng) {
  const cols = shuffle([0, 1, 2, 3, 4, 5, 6], rng);
  const count = blocksInRow(state.level, rng);
  for (let k = 0; k < count; k++) {
    const double = state.level >= 10 && rng() < 0.3;
    state.blocks.push({ c: cols[k], r: 1, hp: state.level * (double ? 2 : 1) });
  }
  state.rings.push({ c: cols[count], r: 1 });
}

export function createGame(rng = Math.random) {
  const state = restore({ level: 1, ballCount: 1, launchX: COLS / 2, blocks: [], rings: [] });
  spawnRow(state, rng);
  return state;
}

export function snapshot(state) {
  return {
    level: state.level,
    ballCount: state.ballCount,
    launchX: state.launchX,
    blocks: state.blocks.map((b) => ({ ...b })),
    rings: state.rings.map((ring) => ({ ...ring })),
  };
}

export function restore(data) {
  return {
    ...snapshot(data),
    phase: 'aim',
    dir: null,
    balls: [],
    toLaunch: 0,
    launchTimer: 0,
    firstLandX: null,
    drops: [],
    turnTime: 0,
  };
}

// Вектор прицела → единичное направление вверх, не положе 8°. Вниз — отмена.
export function clampAim(dx, dy) {
  const length = Math.hypot(dx, dy);
  if (length < 1e-6 || dy > 0) return null;
  let x = dx / length;
  let y = dy / length;
  if (y > -MIN_AIM) {
    y = -MIN_AIM;
    x = (x < 0 ? -1 : 1) * Math.sqrt(1 - y * y);
  }
  return { x, y };
}

function buildGrid(state) {
  const grid = [];
  for (let r = 0; r <= ROWS; r++) grid.push(new Array(COLS).fill(null));
  for (const block of state.blocks) if (block.r >= 0 && block.r <= ROWS) grid[block.r][block.c] = block;
  return grid;
}

function overlapsBlock(grid, x, y) {
  for (let r = Math.floor(y - R); r <= Math.floor(y + R); r++) {
    for (let c = Math.floor(x - R); c <= Math.floor(x + R); c++) {
      const block = grid[r] && grid[r][c];
      if (!block) continue;
      const nx = Math.min(Math.max(x, c + GAP), c + 1 - GAP);
      const ny = Math.min(Math.max(y, r + GAP), r + 1 - GAP);
      if ((x - nx) ** 2 + (y - ny) ** 2 < R * R) return true;
    }
  }
  return false;
}

// Конец пунктира прицела: первая стена или блок по прямой.
export function aimEnd(state, dir) {
  const grid = buildGrid(state);
  let x = state.launchX;
  let y = FLOOR - R;
  for (let travelled = 0; travelled < HEIGHT * 2; travelled += PREVIEW_STEP) {
    const nx = x + dir.x * PREVIEW_STEP;
    const ny = y + dir.y * PREVIEW_STEP;
    if (nx < R || nx > COLS - R || ny < R || overlapsBlock(grid, nx, ny)) break;
    x = nx;
    y = ny;
  }
  return { x, y };
}

// Без минимальной вертикальной скорости шар может бесконечно летать между стенами.
function keepVertical(ball) {
  if (Math.abs(ball.vy) >= MIN_VY) return;
  ball.vy = (ball.vy < 0 ? -1 : 1) * MIN_VY;
  ball.vx = (ball.vx < 0 ? -1 : 1) * Math.sqrt(1 - MIN_VY * MIN_VY);
}

function hitBlock(state, grid, block, events) {
  block.hp--;
  events.push({ type: 'hit', block });
  if (block.hp > 0) return;
  state.blocks.splice(state.blocks.indexOf(block), 1);
  grid[block.r][block.c] = null;
  events.push({ type: 'break', block });
}

function collideBlocks(state, grid, ball, events) {
  for (let r = Math.floor(ball.y - R); r <= Math.floor(ball.y + R); r++) {
    for (let c = Math.floor(ball.x - R); c <= Math.floor(ball.x + R); c++) {
      const block = grid[r] && grid[r][c];
      if (!block) continue;
      const px = Math.min(Math.max(ball.x, c + GAP), c + 1 - GAP);
      const py = Math.min(Math.max(ball.y, r + GAP), r + 1 - GAP);
      const dx = ball.x - px;
      const dy = ball.y - py;
      const distance = Math.hypot(dx, dy);
      if (distance >= R || distance === 0) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      const dot = ball.vx * nx + ball.vy * ny;
      ball.x = px + nx * R;
      ball.y = py + ny * R;
      if (dot >= 0) continue;
      ball.vx -= 2 * dot * nx;
      ball.vy -= 2 * dot * ny;
      hitBlock(state, grid, block, events);
    }
  }
}

function collectRings(state, ball, events) {
  for (let k = state.rings.length - 1; k >= 0; k--) {
    const ring = state.rings[k];
    if (Math.hypot(ball.x - (ring.c + 0.5), ball.y - (ring.r + 0.5)) >= R + RING_R) continue;
    state.rings.splice(k, 1);
    state.drops.push({ x: ring.c + 0.5, y: ring.r + 0.5, vy: 0, landed: false });
    events.push({ type: 'ring', ring });
  }
}

function land(state, ball) {
  ball.landed = true;
  ball.y = FLOOR - R;
  if (state.firstLandX === null) state.firstLandX = Math.min(Math.max(ball.x, R), COLS - R);
}

function moveBall(state, grid, ball, distance, events) {
  let remaining = distance;
  while (remaining > 0 && !ball.landed) {
    const d = Math.min(MAX_STEP, remaining);
    remaining -= d;
    ball.x += ball.vx * d;
    ball.y += ball.vy * d;
    if (ball.x < R) {
      ball.x = R;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x > COLS - R) {
      ball.x = COLS - R;
      ball.vx = -Math.abs(ball.vx);
    }
    if (ball.y < R) {
      ball.y = R;
      ball.vy = Math.abs(ball.vy);
    }
    if (ball.y >= FLOOR - R && ball.vy > 0) {
      land(state, ball);
      return;
    }
    collideBlocks(state, grid, ball, events);
    collectRings(state, ball, events);
    keepVertical(ball);
  }
}

function endTurn(state, rng, events) {
  state.ballCount += state.drops.length;
  state.drops = [];
  state.launchX = state.firstLandX ?? state.launchX;
  state.balls = [];
  for (const block of state.blocks) block.r++;
  for (const ring of state.rings) ring.r++;
  state.rings = state.rings.filter((ring) => ring.r < ROWS);
  if (state.blocks.some((block) => block.r >= ROWS)) {
    state.phase = 'over';
    events.push({ type: 'over' });
    return;
  }
  state.level++;
  spawnRow(state, rng);
  state.phase = 'aim';
  events.push({ type: 'turn' });
}

// Блок на последнем ряду: если его не разбить, следующий ход проигрышный.
export function inDanger(state) {
  return state.blocks.some((block) => block.r >= ROWS - 1);
}

export function launch(state, dir) {
  if (state.phase !== 'aim' || !dir) return false;
  state.phase = 'fly';
  state.dir = dir;
  state.balls = [];
  state.toLaunch = state.ballCount;
  state.launchTimer = INTERVAL;
  state.firstLandX = null;
  state.drops = [];
  state.turnTime = 0;
  return true;
}

// Шар из кольца падает вертикально под силой тяжести и ждёт на полу.
function fall(drop, dt) {
  if (drop.landed) return;
  drop.vy += GRAVITY * dt;
  drop.y += drop.vy * dt;
  if (drop.y < FLOOR - R) return;
  drop.y = FLOOR - R;
  drop.landed = true;
}

function slideTo(item, target, distance) {
  const delta = target - item.x;
  if (Math.abs(delta) <= distance) {
    item.x = target;
    return true;
  }
  item.x += Math.sign(delta) * distance;
  return false;
}

export function step(state, dt, rng = Math.random) {
  const events = [];
  if (state.phase !== 'fly') return events;
  state.turnTime += dt;
  const distance = dt * SPEED;
  const grid = buildGrid(state);
  for (const ball of state.balls) {
    if (ball.landed) slideTo(ball, state.firstLandX, distance);
    else moveBall(state, grid, ball, distance, events);
  }
  for (const drop of state.drops) fall(drop, dt);
  state.launchTimer += dt;
  while (state.toLaunch > 0 && state.launchTimer >= INTERVAL) {
    state.launchTimer -= INTERVAL;
    state.toLaunch--;
    const ball = { x: state.launchX, y: FLOOR - R, vx: state.dir.x, vy: state.dir.y, landed: false };
    state.balls.push(ball);
    moveBall(state, grid, ball, state.launchTimer * SPEED, events);
  }
  if (state.toLaunch > 0 || !state.balls.every((ball) => ball.landed)) return events;
  if (!state.drops.every((drop) => drop.landed)) return events;
  // Все вернулись — шары из колец катятся к первому упавшему, и только потом ход заканчивается.
  let gathered = state.balls.every((ball) => ball.x === state.firstLandX);
  for (const drop of state.drops) if (!slideTo(drop, state.firstLandX, distance)) gathered = false;
  if (gathered) endTurn(state, rng, events);
  return events;
}
