export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

export function shuffle(items, rng) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Нормальное распределение методом Бокса — Мюллера.
export function gauss(rng) {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function pearson(points) {
  const n = points.length;
  const mx = points.reduce((sum, p) => sum + p.x, 0) / n;
  const my = points.reduce((sum, p) => sum + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

export function linearFit(points) {
  const n = points.length;
  const mx = points.reduce((sum, p) => sum + p.x, 0) / n;
  const my = points.reduce((sum, p) => sum + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
  }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

export function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Квантиль отсортированного массива с линейной интерполяцией.
export function quantile(sorted, q) {
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

// 10 очков при точном ответе, линейно до 0 при ошибке zeroAt.
export function scoreByError(error, zeroAt) {
  return Math.round(Math.max(0, 1 - error / zeroAt) * 100) / 10;
}

// Число для подписей: тысячи без дробей, мелкие — с 1–2 знаками.
export function formatValue(value) {
  const abs = Math.abs(value);
  let digits = 2;
  if (abs >= 100) digits = 0;
  else if (abs >= 10) digits = 1;
  return value.toLocaleString('ru-RU', { maximumFractionDigits: digits }).replace('-', '−');
}

// «Круглый» порог: две значащие цифры.
export function roundNice(value) {
  if (value === 0) return 0;
  const step = 10 ** (Math.floor(Math.log10(Math.abs(value))) - 1);
  return Math.round(value / step) * step;
}
