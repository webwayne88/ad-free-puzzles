import { el } from '../ui.js';

const KEY_STEPS = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
const THUMB_INSET = 14;

function clampToStep(slider, raw) {
  const steps = Math.round((raw - slider.min) / slider.step);
  const value = slider.min + steps * slider.step;
  return Math.round(Math.min(slider.max, Math.max(slider.min, value)) * 1000) / 1000;
}

function setFromPointer(slider, event) {
  const rect = slider.track.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left - THUMB_INSET) / (rect.width - THUMB_INSET * 2)));
  setSliderValue(slider, slider.min + ratio * (slider.max - slider.min), true);
}

// Один ползунок с подписью и значением; клавиатура и ARIA как у системного, но в стиле приложения.
export function createSlider(container, { label, min, max, step, value, format, onChange }) {
  const root = el('div', 'picker-row');
  const head = el('div', 'picker-head');
  const valueNode = el('span', 'picker-value');
  head.append(el('span', 'picker-label', label), valueNode);
  const track = el('div', 'picker-slider an-track');
  track.tabIndex = 0;
  track.setAttribute('role', 'slider');
  track.setAttribute('aria-label', label);
  track.setAttribute('aria-valuemin', String(min));
  track.setAttribute('aria-valuemax', String(max));
  const thumb = el('span', 'picker-thumb an-thumb');
  track.append(el('span', 'an-zero'), thumb);
  root.append(head, track);
  container.append(root);
  const slider = { min, max, step, value, format, onChange, track, thumb, valueNode, disabled: false };
  track.addEventListener('pointerdown', (event) => {
    if (slider.disabled) return;
    track.setPointerCapture(event.pointerId);
    track.focus({ preventScroll: true });
    setFromPointer(slider, event);
  });
  track.addEventListener('pointermove', (event) => {
    if (track.hasPointerCapture(event.pointerId)) setFromPointer(slider, event);
  });
  track.addEventListener('keydown', (event) => {
    if (slider.disabled || !(event.key in KEY_STEPS)) return;
    event.preventDefault();
    setSliderValue(slider, slider.value + KEY_STEPS[event.key] * slider.step, true);
  });
  renderSlider(slider);
  return slider;
}

export function setSliderValue(slider, raw, notify = false) {
  slider.value = clampToStep(slider, raw);
  renderSlider(slider);
  if (notify && slider.onChange) slider.onChange(slider.value);
}

export function renderSlider(slider) {
  const text = slider.format(slider.value);
  slider.track.style.setProperty('--pos', String((slider.value - slider.min) / (slider.max - slider.min)));
  slider.track.setAttribute('aria-valuenow', String(slider.value));
  slider.track.setAttribute('aria-valuetext', text);
  slider.valueNode.textContent = text;
}
