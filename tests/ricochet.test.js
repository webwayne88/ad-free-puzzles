import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLS, FLOOR, R, ROWS, clampAim, aimEnd, createGame, dragToAim, inDanger, pointAim, rowPlan, launch, restore, snapshot, step } from '../js/ricochet/engine.js';

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

test('попадание точно в стык двух блоков бьёт оба и отражает шар как от ровной стены', () => {
  const state = emptyGame({ launchX: 4, blocks: [{ c: 3, r: 2, hp: 3 }, { c: 4, r: 2, hp: 3 }] });
  launch(state, clampAim(0, -1));
  const events = playTurn(state, seeded(12));
  const hits = events.filter((e) => e.type === 'hit');
  assert.equal(hits.filter((e) => e.block.c === 3).length, 1);
  assert.equal(hits.filter((e) => e.block.c === 4).length, 1);
  assert.ok(Math.abs(state.launchX - 4) < 1e-6, `шар ушёл вбок: ${state.launchX}`);
});

test('рогатка: тянешь вниз-влево — шар летит вверх-вправо', () => {
  const aim = dragToAim(-30, 80);
  assert.ok(aim.y < 0 && aim.x > 0);
  assert.equal(dragToAim(0, -80), null, 'тянешь вверх — отмена');
});

test('прицел за пальцем: линия идёт от шара к точке касания, ниже шара — отмена', () => {
  const state = emptyGame({ launchX: 3.5 });
  const aim = pointAim(state, 5.5, FLOOR - R - 2);
  assert.ok(Math.abs(aim.x - Math.SQRT1_2) < 1e-9 && Math.abs(aim.y + Math.SQRT1_2) < 1e-9, 'ровно на 45° вверх-вправо');
  assert.equal(pointAim(state, 2, FLOOR), null);
});

test('ряд: не больше 5 блоков, чаще 2–4; на тесном поле ряды беднеют', () => {
  const rng = seeded(13);
  const counts = [];
  for (let k = 0; k < 2000; k++) counts.push(rowPlan(40, 0.2, rng).hps.length);
  assert.ok(Math.max(...counts) <= 5 && Math.min(...counts) >= 1);
  const average = counts.reduce((a, b) => a + b, 0) / counts.length;
  assert.ok(average > 2.5 && average < 3.6, `в среднем ${average}`);
  const crowded = Array.from({ length: 500 }, () => rowPlan(40, 0.65, rng).hps.length);
  assert.ok(Math.max(...crowded) <= 3, 'при заполнении больше 60% — минус два блока');
});

test('сложность растёт числами: удвоенных блоков с уровнем больше', () => {
  const rng = seeded(14);
  const share = (level) => {
    const hps = Array.from({ length: 1000 }, () => rowPlan(level, 0, rng).hps).flat();
    assert.ok(hps.every((hp) => hp === level || hp === level * 2));
    return hps.filter((hp) => hp === level * 2).length / hps.length;
  };
  assert.equal(share(5), 0);
  const early = share(12);
  const late = share(50);
  assert.ok(early > 0.08 && early < 0.25 && late > 0.38 && late < 0.52, `${early} → ${late}`);
});

test('поле не забивается: в долгой партии свободно больше половины клеток', () => {
  const rng = seeded(15);
  const state = createGame(rng);
  state.ballCount = 200;
  let worst = 0;
  for (let turn = 0; turn < 60 && state.phase !== 'over'; turn++) {
    launch(state, clampAim(rng() * 2 - 1, -1));
    playTurn(state, rng, 120);
    worst = Math.max(worst, state.blocks.length / (COLS * (ROWS - 1)));
  }
  assert.ok(worst < 0.62, `максимальная заполненность ${worst}`);
});
