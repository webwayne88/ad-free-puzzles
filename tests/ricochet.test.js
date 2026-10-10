import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, FLOOR, R, ROWS, clampAim, aimEnd, createGame, inDanger, launch, restore, snapshot, step } from '../js/ricochet/engine.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function emptyGame(extra = {}) {
  return restore({ level: 5, ballCount: 1, launchX: 3.5, blocks: [], rings: [], ...extra });
}

function playTurn(state, rng, limit = 120) {
  const events = [];
  for (let t = 0; t < limit && state.phase === 'fly'; t += 1 / 120) events.push(...step(state, 1 / 120, rng));
  return events;
}

test('первый ряд: блоки со значением 1, одно кольцо, верхний ряд пуст', () => {
  const state = createGame(seeded(1));
  assert.ok(state.blocks.length >= 1 && state.blocks.length <= 6);
  assert.ok(state.blocks.every((b) => b.hp === 1 && b.r === 1));
  assert.equal(state.rings.length, 1);
  const cells = new Set([...state.blocks, ...state.rings].map((x) => x.c));
  assert.equal(cells.size, state.blocks.length + 1);
});

test('clampAim: вниз — отмена, почти горизонтально — поднимает до минимума', () => {
  assert.equal(clampAim(1, 0.5), null);
  const flat = clampAim(1, -0.001);
  assert.ok(flat.y < -0.13 && flat.x > 0);
  assert.ok(Math.abs(Math.hypot(flat.x, flat.y) - 1) < 1e-9);
});

test('выстрел вверх в блок снимает по единице за удар и разбивает его', () => {
  const state = emptyGame({ ballCount: 3, blocks: [{ c: 3, r: 2, hp: 3 }] });
  launch(state, clampAim(0, -1));
  const events = playTurn(state, seeded(2));
  assert.equal(events.filter((e) => e.type === 'hit').length, 3);
  assert.equal(events.filter((e) => e.type === 'break').length, 1);
  assert.equal(state.phase, 'aim');
});

test('шар отражается от стен и потолка и приземляется на пол', () => {
  const state = emptyGame();
  launch(state, clampAim(1, -0.4));
  let maxX = 0;
  for (let t = 0; t < 20 && state.phase === 'fly'; t += 1 / 120) {
    step(state, 1 / 120, seeded(3));
    for (const ball of state.balls) {
      maxX = Math.max(maxX, ball.x);
      assert.ok(ball.x >= R - 1e-9 && ball.x <= COLS - R + 1e-9 && ball.y >= R - 1e-9);
    }
  }
  assert.ok(maxX > COLS - 0.5);
  assert.equal(state.phase, 'aim');
  assert.notEqual(state.launchX, 3.5);
});

test('шар из кольца падает вертикально, ждёт на полу и собирается к первому упавшему', () => {
  const state = emptyGame({ launchX: 1.5, rings: [{ c: 5, r: 5 }] });
  launch(state, clampAim(1, -1.1));
  let sawDrop = false;
  let landedAtRing = false;
  for (let t = 0; t < 20 && state.phase === 'fly'; t += 1 / 120) {
    step(state, 1 / 120, seeded(10));
    for (const drop of state.drops) {
      sawDrop = true;
      assert.equal(drop.x === 5.5 || drop.landed, true);
      if (drop.landed && drop.x === 5.5) landedAtRing = true;
    }
  }
  assert.ok(sawDrop && landedAtRing);
  assert.equal(state.ballCount, 2);
  assert.equal(state.drops.length, 0);
});

test('кольцо даёт шар на следующий ход', () => {
  const state = emptyGame({ rings: [{ c: 3, r: 5 }] });
  launch(state, clampAim(0, -1));
  playTurn(state, seeded(4));
  assert.equal(state.ballCount, 2);
});

test('после хода ряды сдвигаются вниз, сверху появляется новый, уровень растёт', () => {
  const state = emptyGame({ blocks: [{ c: 0, r: 3, hp: 50 }] });
  launch(state, clampAim(0, -1));
  playTurn(state, seeded(5));
  assert.equal(state.level, 6);
  assert.ok(state.blocks.some((b) => b.c === 0 && b.r === 4));
  assert.ok(state.blocks.some((b) => b.r === 1 && b.hp >= 6));
});

test('блок на последнем ряду после хода — конец игры', () => {
  const state = emptyGame({ blocks: [{ c: 0, r: ROWS - 1, hp: 50 }] });
  launch(state, clampAim(0, -1));
  playTurn(state, seeded(6));
  assert.equal(state.phase, 'over');
  assert.equal(state.level, 5);
});

test('прицел останавливается на первом блоке', () => {
  const state = emptyGame({ blocks: [{ c: 3, r: 4, hp: 1 }] });
  const end = aimEnd(state, clampAim(0, -1));
  assert.ok(end.y > 5 && end.y < 5.3);
});

test('длинная случайная партия: каждый ход завершается, координаты конечны', () => {
  const rng = seeded(8);
  const state = createGame(rng);
  state.ballCount = 40;
  for (let turn = 0; turn < 60 && state.phase !== 'over'; turn++) {
    launch(state, clampAim(rng() * 2 - 1, -rng() - 0.05));
    playTurn(state, rng, 90);
    assert.notEqual(state.phase, 'fly', `ход ${turn} не завершился`);
    assert.ok(Number.isFinite(state.launchX) && state.launchX >= R && state.launchX <= COLS - R);
  }
  assert.ok(state.level > 10);
});

test('snapshot/restore сохраняет позицию между сессиями', () => {
  const state = createGame(seeded(9));
  const copy = restore(JSON.parse(JSON.stringify(snapshot(state))));
  assert.deepEqual(copy.blocks, state.blocks);
  assert.equal(copy.phase, 'aim');
  assert.equal(copy.balls.length, 0);
  assert.equal(FLOOR, 10);
});

test('опасность — блок на последнем ряду перед зоной запуска', () => {
  assert.equal(inDanger(emptyGame({ blocks: [{ c: 0, r: ROWS - 2, hp: 1 }] })), false);
  assert.equal(inDanger(emptyGame({ blocks: [{ c: 0, r: ROWS - 1, hp: 1 }] })), true);
});
