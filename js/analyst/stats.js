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

// Аппроксимация Абрамовица — Стиган, погрешность меньше 1.5e-7.
function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const y = 1 - poly * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

export function normCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

const Z_95 = 1.959964;
const Z_POWER_80 = 0.841621;

// Z-тест для двух долей: двусторонний p-value, 95% ДИ разницы и размер выборки для 80% мощности.
export function twoProportionTest(nA, cA, nB, cB) {
  const pA = cA / nA;
  const pB = cB / nB;
  const pooled = (cA + cB) / (nA + nB);
  const sePooled = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB));
  const z = sePooled === 0 ? 0 : (pB - pA) / sePooled;
  const pValue = 2 * (1 - normCdf(Math.abs(z)));
  const se = Math.sqrt((pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB);
  const diff = pB - pA;
  const variance = pA * (1 - pA) + pB * (1 - pB);
  const neededN = diff === 0 ? Infinity : Math.ceil(((Z_95 + Z_POWER_80) ** 2 * variance) / diff ** 2);
  let winner = 'none';
  if (pValue < 0.05) winner = diff > 0 ? 'B' : 'A';
  return { pA, pB, diff, z, pValue, ciLow: diff - Z_95 * se, ciHigh: diff + Z_95 * se, neededN, winner };
}
