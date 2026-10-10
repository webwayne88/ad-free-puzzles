import { toHex } from './color.js';
import { el } from '../ui.js';

const SLIDERS = [
  { key: 'h', label: 'Тон', max: 360, scale: 1, unit: '°' },
  { key: 's', label: 'Насыщенность', max: 100, scale: 100, unit: '%' },
  { key: 'v', label: 'Яркость', max: 100, scale: 100, unit: '%' },
];
const HUE_TRACK = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360]
  .map((h) => toHex({ h, s: 1, v: 1 }))
  .join(', ')})`;
const KEY_STEPS = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
const THUMB_INSET = 14;

function sliderValue(picker, def) {
  return Math.round(picker.value[def.key] * def.scale);
}

function setSlider(picker, def, raw) {
  const clamped = Math.min(def.max, Math.max(0, Math.round(raw)));
  picker.value = { ...picker.value, [def.key]: clamped / def.scale };
  renderPicker(picker);
  picker.onChange(picker.value);
}

function onPointer(picker, def, slider, event) {
  if (picker.disabled) return;
  const rect = slider.getBoundingClientRect();
  const ratio = (event.clientX - rect.left - THUMB_INSET) / (rect.width - THUMB_INSET * 2);
  setSlider(picker, def, Math.min(1, Math.max(0, ratio)) * def.max);
}

function onKey(picker, def, event) {
  if (picker.disabled) return;
  let next = null;
  if (event.key in KEY_STEPS) next = sliderValue(picker, def) + KEY_STEPS[event.key];
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = def.max;
  if (next === null) return;
  event.preventDefault();
  setSlider(picker, def, next);
}

function buildRow(picker, def) {
  const row = el('div', 'picker-row');
  const head = el('div', 'picker-head');
  const value = el('span', 'picker-value');
  head.append(el('span', 'picker-label', def.label), value);
  const slider = el('div', 'picker-slider');
  slider.tabIndex = 0;
  slider.setAttribute('role', 'slider');
  slider.setAttribute('aria-label', def.label);
  slider.setAttribute('aria-valuemin', '0');
  slider.setAttribute('aria-valuemax', String(def.max));
  const thumb = el('span', 'picker-thumb');
  slider.append(thumb);
  slider.addEventListener('pointerdown', (event) => {
    if (picker.disabled) return;
    slider.setPointerCapture(event.pointerId);
    slider.focus({ preventScroll: true });
    onPointer(picker, def, slider, event);
  });
  slider.addEventListener('pointermove', (event) => {
    if (slider.hasPointerCapture(event.pointerId)) onPointer(picker, def, slider, event);
  });
  slider.addEventListener('keydown', (event) => onKey(picker, def, event));
  row.append(head, slider);
  picker.rows.push({ def, slider, thumb, value });
  return row;
}

// Три ползунка HSV вместо системного выбора цвета.
export function createPicker(container, onChange) {
  const picker = { value: { h: 0, s: 0.5, v: 0.75 }, disabled: false, rows: [], onChange, root: el('div', 'picker') };
  for (const def of SLIDERS) picker.root.append(buildRow(picker, def));
  container.append(picker.root);
  renderPicker(picker);
  return picker;
}

export function setPickerValue(picker, hsv) {
  picker.value = { ...hsv };
  renderPicker(picker);
}

export function setPickerDisabled(picker, disabled) {
  picker.disabled = disabled;
  renderPicker(picker);
}

export function renderPicker(picker) {
  const { h, s, v } = picker.value;
  const tracks = {
    h: HUE_TRACK,
    s: `linear-gradient(to right, ${toHex({ h, s: 0, v })}, ${toHex({ h, s: 1, v })})`,
    v: `linear-gradient(to right, #000000, ${toHex({ h, s, v: 1 })})`,
  };
  picker.root.classList.toggle('is-disabled', picker.disabled);
  for (const row of picker.rows) {
    const current = sliderValue(picker, row.def);
    row.slider.style.background = tracks[row.def.key];
    row.slider.style.setProperty('--pos', String(current / row.def.max));
    row.slider.setAttribute('aria-valuenow', String(current));
    row.slider.setAttribute('aria-valuetext', `${current}${row.def.unit}`);
    row.slider.setAttribute('aria-disabled', String(picker.disabled));
    row.slider.tabIndex = picker.disabled ? -1 : 0;
    row.thumb.style.background = toHex(picker.value);
    row.value.textContent = `${current}${row.def.unit}`;
  }
}
