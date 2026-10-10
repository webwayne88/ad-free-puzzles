import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distance, feedback, hsvToRgb, isLight, randomColor, scoreFor, toHex } from '../js/hues/color.js';
import { HARMONIES, buildPalette, harmonyById } from '../js/hues/harmony.js';
import { ROUNDS, beginPick, createGame, next, submit, targetOf, total } from '../js/hues/game.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hueGap(a, b) {
  return (((b - a) % 360) + 360) % 360;
}

test('HSV → RGB и HEX для опорных цветов', () => {
  assert.deepEqual(hsvToRgb({ h: 0, s: 1, v: 1 }), [255, 0, 0]);
  assert.deepEqual(hsvToRgb({ h: 120, s: 1, v: 1 }), [0, 255, 0]);
  assert.deepEqual(hsvToRgb({ h: 240, s: 1, v: 1 }), [0, 0, 255]);
  assert.deepEqual(hsvToRgb({ h: 200, s: 0, v: 1 }), [255, 255, 255]);
  assert.equal(toHex({ h: 360, s: 1, v: 1 }), '#FF0000');
  assert.ok(isLight({ h: 60, s: 0.2, v: 1 }));
  assert.ok(!isLight({ h: 240, s: 1, v: 0.5 }));
});

test('очки: совпадение 10, едва заметная разница около 9, далёкий цвет 0, монотонно', () => {
  const base = { h: 210, s: 0.6, v: 0.8 };
  assert.equal(scoreFor(distance(base, base)), 10);
  assert.ok(scoreFor(0.02) >= 9);
  assert.equal(scoreFor(0.4), 0);
  assert.equal(scoreFor(distance({ h: 0, s: 1, v: 1 }, { h: 180, s: 1, v: 1 })), 0);
  let previous = 11;
  for (let d = 0; d <= 0.4; d += 0.02) {
    const score = scoreFor(d);
    assert.ok(score <= previous);
    previous = score;
  }
});

test('подсказка называет главную ошибку', () => {
  const target = { h: 210, s: 0.6, v: 0.6 };
  assert.equal(feedback(target, target), 'Идеально');
  assert.equal(feedback(target, { ...target, v: 1 }), 'Светлее, чем нужно');
  assert.equal(feedback(target, { ...target, v: 0.2 }), 'Темнее, чем нужно');
  assert.equal(feedback({ h: 30, s: 0.9, v: 0.8 }, { h: 30, s: 0.25, v: 0.8 }), 'Слишком блёклый');
  assert.equal(feedback({ h: 30, s: 0.8, v: 0.8 }, { h: 200, s: 0.8, v: 0.8 }), 'Не тот оттенок');
});

test('гармонии строятся по правилам круга', () => {
  const base = { h: 350, s: 0.7, v: 0.8 };
  const triad = buildPalette(harmonyById('triad'), base);
  assert.deepEqual(triad.map((c) => c.h), [350, 110, 230]);
  assert.equal(hueGap(triad[0].h, triad[1].h), 120);
  const square = buildPalette(harmonyById('square'), base);
  assert.equal(square.length, 4);
  const mono = buildPalette(harmonyById('mono'), base);
  assert.ok(mono.every((c) => c.h === 350 && c.s === 0.7));
  assert.ok(mono[0].v > mono[3].v);
  assert.equal(buildPalette(harmonyById('complementary'), base)[1].h, 170);
});

test('случайные цвета без серых и почти чёрных', () => {
  const rng = seeded(1);
  for (let k = 0; k < 200; k++) {
    const c = randomColor(rng);
    assert.ok(c.h >= 0 && c.h < 360 && c.s >= 0.3 && c.v >= 0.4 && c.s <= 1 && c.v <= 1);
  }
});

test('режим «запомни цвет»: показ → подбор → ответ → следующий раунд → итог', () => {
  const game = createGame('memory', seeded(2));
  assert.equal(game.rounds.length, ROUNDS);
  assert.equal(game.phase, 'show');
  assert.equal(submit(game, { h: 0, s: 0, v: 1 }), null);
  for (let k = 0; k < ROUNDS; k++) {
    beginPick(game);
    const result = submit(game, targetOf(game.rounds[game.index]));
    assert.equal(result.score, 10);
    next(game);
  }
  assert.equal(game.phase, 'done');
  assert.equal(total(game), 50);
});

test('режим палитры: пять разных гармоний, загадан скрытый цвет', () => {
  const game = createGame('palette', seeded(3));
  assert.equal(game.phase, 'pick');
  assert.equal(new Set(game.rounds.map((r) => r.harmony)).size, ROUNDS);
  for (const round of game.rounds) {
    const harmony = HARMONIES.find((h) => h.id === round.harmony);
    assert.equal(round.colors.length, harmony.hues.length);
    assert.ok(round.hidden >= 0 && round.hidden < round.colors.length);
    assert.deepEqual(targetOf(round), round.colors[round.hidden]);
  }
  const far = submit(game, { h: (targetOf(game.rounds[0]).h + 180) % 360, s: 1, v: 0.3 });
  assert.ok(far.score < 3);
  next(game);
  assert.equal(game.phase, 'pick');
  assert.equal(game.index, 1);
});
