import { wrapHue } from './color.js';

// Гармонии на цветовом круге: сдвиги тона от базового цвета. В монохромной меняется только яркость.
export const HARMONIES = [
  { id: 'complementary', name: 'Комплементарная', explain: 'Противоположные цвета на круге, 180°', hues: [0, 180] },
  { id: 'analogous', name: 'Аналоговая', explain: 'Соседи на круге с шагом 30°', hues: [-30, 0, 30] },
  { id: 'triad', name: 'Триада', explain: 'Три цвета через 120°', hues: [0, 120, 240] },
  { id: 'split', name: 'Сплит-комплементарная', explain: 'Цвет и два соседа его противоположности: 150° и 210°', hues: [0, 150, 210] },
  { id: 'square', name: 'Квадрат', explain: 'Четыре цвета через 90°', hues: [0, 90, 180, 270] },
  { id: 'mono', name: 'Монохромная', explain: 'Один тон, яркость меняется ступенями', hues: [0, 0, 0, 0], values: [0.95, 0.78, 0.61, 0.44] },
];

export function harmonyById(id) {
  return HARMONIES.find((harmony) => harmony.id === id);
}

export function buildPalette(harmony, base) {
  return harmony.hues.map((shift, k) => ({
    h: wrapHue(base.h + shift),
    s: base.s,
    v: harmony.values ? harmony.values[k] : base.v,
  }));
}

function round2(x) {
  return Math.round(x * 100) / 100;
}

export function createPaletteRound(harmony, rng) {
  const base = { h: Math.floor(rng() * 360), s: round2(0.45 + rng() * 0.45), v: round2(0.62 + rng() * 0.33) };
  const colors = buildPalette(harmony, base);
  return { harmony: harmony.id, colors, hidden: Math.floor(rng() * colors.length) };
}
