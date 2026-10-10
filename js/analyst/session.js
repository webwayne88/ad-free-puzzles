import { load, save } from '../storage.js';

const STATS_KEY = 'analyst:stats';

export function loadStats() {
  return load(STATS_KEY, {});
}

export function recordGame(mode, score) {
  const stats = loadStats();
  const stat = stats[mode] ?? { played: 0, best: null };
  const isRecord = stat.best === null || score > stat.best;
  stat.played++;
  if (isRecord) stat.best = score;
  stats[mode] = stat;
  save(STATS_KEY, stats);
  return { best: stat.best, isRecord };
}

export function formatNumber(value, digits = 1) {
  return value.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace('-', '−');
}
