// Скачивает показатели по странам с Our World in Data и собирает data/correlations.json.
// Запуск: docker compose run --rm tools node tools/fetch-owid.js
import { writeFileSync } from 'node:fs';

const TARGET_YEAR = 2019;
const MIN_YEAR = 2015;
const MAX_YEAR = 2022;

// Только показатели из открытых источников (Всемирный банк, ООН); log — скошенное распределение.
const INDICATORS = [
  { id: 'gdp', slug: 'gdp-per-capita-worldbank', short: 'World Bank', title: 'ВВП на душу, $ по ППС', log: true },
  { id: 'life', slug: 'life-expectancy', short: 'UN WPP', title: 'Продолжительность жизни, лет' },
  { id: 'internet', slug: 'share-of-individuals-using-the-internet', short: 'ITU', title: 'Пользуются интернетом, %' },
  { id: 'fertility', slug: 'children-per-woman-un', short: 'UN WPP', title: 'Детей на одну женщину' },
  { id: 'co2', slug: 'co-emissions-per-capita', short: 'Global Carbon Budget', title: 'Выбросы CO₂ на душу, т', log: true },
  { id: 'urban', slug: 'share-of-population-urban', short: 'UN DESA', title: 'Городское население, %' },
  { id: 'childMortality', slug: 'child-mortality', short: 'UN IGME', title: 'Смертность до 5 лет, %', log: true },
  { id: 'schooling', slug: 'mean-years-of-schooling-long-run', short: 'Barro & Lee', title: 'Средние годы обучения' },
  { id: 'medianAge', slug: 'median-age', short: 'UN WPP', title: 'Медианный возраст, лет' },
  { id: 'electricity', slug: 'share-of-the-population-with-access-to-electricity', short: 'World Bank', title: 'Доступ к электричеству, %' },
  { id: 'density', slug: 'population-density', short: 'UN WPP', title: 'Плотность населения, чел/км²', log: true },
  { id: 'unemployment', slug: 'unemployment-rate', short: 'ILO', title: 'Безработица, %' },
];

function parseCsvLine(line) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

// Для каждой страны — значение в год, ближайший к TARGET_YEAR.
function closestValues(csv) {
  const [header, ...lines] = csv.trim().split('\n');
  const columns = parseCsvLine(header);
  const codeAt = columns.indexOf('code');
  const yearAt = columns.indexOf('year');
  const valueAt = yearAt + 1;
  const best = {};
  for (const line of lines) {
    const cells = parseCsvLine(line);
    const code = cells[codeAt];
    const year = Number(cells[yearAt]);
    const value = Number(cells[valueAt]);
    if (!/^[A-Z]{3}$/.test(code) || cells[valueAt] === '' || !Number.isFinite(value)) continue;
    if (year < MIN_YEAR || year > MAX_YEAR) continue;
    const distance = Math.abs(year - TARGET_YEAR);
    if (!best[code] || distance < best[code].distance) best[code] = { value, distance };
  }
  return { column: columns[valueAt], values: Object.fromEntries(Object.entries(best).map(([code, b]) => [code, b.value])) };
}

const indicators = [];
for (const indicator of INDICATORS) {
  const base = `https://ourworldindata.org/grapher/${indicator.slug}`;
  const [csvResponse, metaResponse] = await Promise.all([
    fetch(`${base}.csv?v=1&csvType=full&useColumnShortNames=true`),
    fetch(`${base}.metadata.json?v=1&csvType=full&useColumnShortNames=true`),
  ]);
  if (!csvResponse.ok || !metaResponse.ok) {
    console.error(`${indicator.id}: ${csvResponse.status}/${metaResponse.status} — пропускаю`);
    continue;
  }
  const { column, values } = closestValues(await csvResponse.text());
  const meta = await metaResponse.json();
  const columnMeta = meta.columns?.[column] ?? Object.values(meta.columns ?? {})[0] ?? {};
  const source = columnMeta.citationShort ?? columnMeta.citation ?? meta.chart?.citation ?? '';
  console.error(`${indicator.id}: ${Object.keys(values).length} стран, колонка ${column}; ${source.slice(0, 90)}`);
  indicators.push({ id: indicator.id, title: indicator.title, short: indicator.short, log: Boolean(indicator.log), source, values });
}

const countries = [...new Set(indicators.flatMap((i) => Object.keys(i.values)))].sort();
const data = {
  source: 'Our World in Data, CC BY 4.0',
  year: TARGET_YEAR,
  countries,
  indicators: indicators.map((i) => ({
    id: i.id,
    title: i.title,
    short: i.short,
    log: i.log,
    source: i.source,
    values: countries.map((code) => i.values[code] ?? null),
  })),
};
writeFileSync(new URL('../data/correlations.json', import.meta.url), JSON.stringify(data));
console.error(`Готово: ${data.indicators.length} показателей, ${countries.length} стран`);
