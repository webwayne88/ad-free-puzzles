import { load, save } from './storage.js';
import { choiceList, openOverlay } from './ui.js';

const KEY = 'settings';

const DEFAULTS = {
  theme: 'system',
  mistakeLimit: true,
  highlightArea: true,
  highlightSame: true,
  autoNotes: true,
  showTimer: true,
};

export function loadSettings() {
  return { ...DEFAULTS, ...load(KEY, {}) };
}

export function saveSettings(settings) {
  save(KEY, settings);
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#12151c' : '#f2f4f9');
}

const THEMES = [
  { value: 'system', label: 'Как в системе' },
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
];

export function chooseTheme(onClose) {
  const settings = loadSettings();
  let close = null;
  const list = choiceList(THEMES, {
    selected: settings.theme,
    onPick: (value) => {
      settings.theme = value;
      saveSettings(settings);
      applyTheme(value);
      close();
    },
  });
  close = openOverlay({ title: 'Оформление', body: list, onClose });
}
