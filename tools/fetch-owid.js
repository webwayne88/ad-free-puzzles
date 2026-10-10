// Скачивает показатели по странам с Our World in Data:
// data/correlations.json — среднее по стране за 2017–2021 (корреляция, распределения, выбросы, доли),
// data/trends.json — годовые ряды 2000–2019 для режима «Продолжи тренд».
// Запуск: docker compose run --rm tools node tools/fetch-owid.js
import { writeFileSync } from 'node:fs';

// Среднее за пять лет, а не один год: в оценках ООН бывают резкие провалы отдельных лет
// (например, у ЦАР в 2019 году продолжительность жизни 31,5 при 50–52 в соседние годы).
const PERIOD_FROM = 2017;
const PERIOD_TO = 2021;
const SERIES_FROM = 2000;
const SERIES_TO = 2019;
// Страна попадает в игру, если по ней есть хотя бы столько показателей: так отсекаются микротерритории.
const MIN_COVERAGE = 10;

// Только показатели из открытых источников (Всемирный банк, ООН); log — скошенное распределение, trend — есть годовой ряд.
const INDICATORS = [
  { id: 'gdp', slug: 'gdp-per-capita-worldbank', short: 'World Bank', title: 'ВВП на душу, $ по ППС', log: true, trend: true },
  { id: 'life', slug: 'life-expectancy', short: 'UN WPP', title: 'Продолжительность жизни, лет', trend: true },
  { id: 'internet', slug: 'share-of-individuals-using-the-internet', short: 'ITU', title: 'Пользуются интернетом, %', percent: true, trend: true },
  { id: 'fertility', slug: 'children-per-woman-un', short: 'UN WPP', title: 'Детей на одну женщину', trend: true },
  { id: 'co2', slug: 'co-emissions-per-capita', short: 'Global Carbon Budget', title: 'Выбросы CO₂ на душу, т', log: true, trend: true },
  { id: 'urban', slug: 'share-of-population-urban', short: 'UN DESA', title: 'Городское население, %', percent: true, trend: true },
  { id: 'childMortality', slug: 'child-mortality', short: 'UN IGME', title: 'Смертность до 5 лет, %', log: true, trend: true },
  { id: 'schooling', slug: 'mean-years-of-schooling-long-run', short: 'Barro & Lee', title: 'Средние годы обучения' },
  { id: 'medianAge', slug: 'median-age', short: 'UN WPP', title: 'Медианный возраст, лет' },
  { id: 'electricity', slug: 'share-of-the-population-with-access-to-electricity', short: 'World Bank', title: 'Доступ к электричеству, %', percent: true, trend: true },
  { id: 'density', slug: 'population-density', short: 'UN WPP', title: 'Плотность населения, чел/км²', log: true },
  { id: 'unemployment', slug: 'unemployment-rate', short: 'ILO', title: 'Безработица, %', percent: true },
];

// Названия OWID, которые не совпадают с английскими названиями CLDR.
const NAME_TO_ISO2 = {
  'Democratic Republic of Congo': 'CD',
  Congo: 'CG',
  "Cote d'Ivoire": 'CI',
  'East Timor': 'TL',
  'Micronesia (country)': 'FM',
  Myanmar: 'MM',
  'Cape Verde': 'CV',
  Turkey: 'TR',
  Czechia: 'CZ',
  Palestine: 'PS',
  'Hong Kong': 'HK',
  Macao: 'MO',
  Curacao: 'CW',
  Vatican: 'VA',
  'United States Virgin Islands': 'VI',
  'British Virgin Islands': 'VG',
  'Saint Kitts and Nevis': 'KN',
  'Saint Lucia': 'LC',
  'Saint Vincent and the Grenadines': 'VC',
  'Sao Tome and Principe': 'ST',
  'Bosnia and Herzegovina': 'BA',
  'Antigua and Barbuda': 'AG',
  'Trinidad and Tobago': 'TT',
  'Turks and Caicos Islands': 'TC',
  'Saint Pierre and Miquelon': 'PM',
  'Wallis and Futuna': 'WF',
  'Heard Island and McDonald Islands': 'HM',
  'Falkland Islands': 'FK',
  'Saint Helena': 'SH',
  'Sint Maarten (Dutch part)': 'SX',
  'Saint Martin (French part)': 'MF',
  'Saint Barthelemy': 'BL',
  Reunion: 'RE',
  'Aland Islands': 'AX',
  'Bonaire Sint Eustatius and Saba': 'BQ',
};

// Привычные русские названия вместо формулировок CLDR.
const RUSSIAN_OVERRIDES = {
  COD: 'ДР Конго',
  COG: 'Республика Конго',
  HKG: 'Гонконг',
  KOR: 'Южная Корея',
  MAC: 'Макао',
  MMR: 'Мьянма',
  USA: 'США',
  VGB: 'Британские Виргинские острова',
  VIR: 'Виргинские острова США',
};

function normalize(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z]/g, '');
}

function buildIso2Lookup() {
  const english = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
  const lookup = {};
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = english.of(code);
      if (name) lookup[normalize(name)] = code;
    }
  }
  return lookup;
}

function round3(value) {
  return Number(value.toPrecision(4));
}

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

// Среднее за период, годовой ряд и английское название страны.
function parseIndicator(csv) {
  const [header, ...lines] = csv.trim().split('\n');
  const columns = parseCsvLine(header);
  const entityAt = columns.indexOf('entity');
  const codeAt = columns.indexOf('code');
  const yearAt = columns.indexOf('year');
  const valueAt = yearAt + 1;
  const sums = {};
  const series = {};
  const names = {};
  for (const line of lines) {
    const cells = parseCsvLine(line);
    const code = cells[codeAt];
    const year = Number(cells[yearAt]);
    const value = Number(cells[valueAt]);
    if (!/^[A-Z]{3}$/.test(code) || cells[valueAt] === '' || !Number.isFinite(value)) continue;
    names[code] = cells[entityAt];
    if (year >= SERIES_FROM && year <= SERIES_TO) {
      series[code] ??= {};
      series[code][year] = value;
    }
    if (year < PERIOD_FROM || year > PERIOD_TO) continue;
    sums[code] ??= { total: 0, count: 0 };
    sums[code].total += value;
    sums[code].count++;
  }
  return {
    column: columns[valueAt],
    values: Object.fromEntries(Object.entries(sums).map(([code, s]) => [code, round3(s.total / s.count)])),
    series,
    names,
  };
}

const indicators = [];
const englishNames = {};
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
  const parsed = parseIndicator(await csvResponse.text());
  const meta = await metaResponse.json();
  const columnMeta = meta.columns?.[parsed.column] ?? Object.values(meta.columns ?? {})[0] ?? {};
  Object.assign(englishNames, parsed.names);
  console.error(`${indicator.id}: ${Object.keys(parsed.values).length} стран`);
  indicators.push({ ...indicator, source: columnMeta.citationShort ?? '', ...parsed });
}

const lookup = buildIso2Lookup();
const russian = new Intl.DisplayNames(['ru'], { type: 'region', fallback: 'none' });
const countries = [...new Set(indicators.flatMap((i) => Object.keys(i.values)))]
  .filter((code) => indicators.filter((i) => i.values[code] !== undefined).length >= MIN_COVERAGE)
  .sort();
const missing = [];
const names = countries.map((code) => {
  const english = englishNames[code];
  const iso2 = NAME_TO_ISO2[english] ?? lookup[normalize(english)];
  const name = RUSSIAN_OVERRIDES[code] ?? (iso2 && russian.of(iso2));
  if (!name) missing.push(`${code} ${english}`);
  return name || english;
});
if (missing.length) console.error(`Без русского названия (${missing.length}): ${missing.join('; ')}`);

writeFileSync(
  new URL('../data/correlations.json', import.meta.url),
  JSON.stringify({
    source: 'Our World in Data, CC BY 4.0',
    period: `${PERIOD_FROM}–${PERIOD_TO}`,
    countries,
    names,
    indicators: indicators.map((i) => ({
      id: i.id,
      title: i.title,
      short: i.short,
      log: Boolean(i.log),
      percent: Boolean(i.percent),
      source: i.source,
      values: countries.map((code) => i.values[code] ?? null),
    })),
  }),
);

// Ряды только без пропусков за все годы — иначе линия рвётся.
const years = Array.from({ length: SERIES_TO - SERIES_FROM + 1 }, (_, k) => SERIES_FROM + k);
const trends = indicators
  .filter((i) => i.trend)
  .map((i) => ({
    id: i.id,
    title: i.title,
    short: i.short,
    percent: Boolean(i.percent),
    series: Object.fromEntries(
      Object.entries(i.series)
        .filter(([code, byYear]) => countries.includes(code) && years.every((y) => byYear[y] !== undefined))
        .map(([code, byYear]) => [code, years.map((y) => round3(byYear[y]))]),
    ),
  }));
writeFileSync(
  new URL('../data/trends.json', import.meta.url),
  JSON.stringify({ source: 'Our World in Data, CC BY 4.0', years, countries, names, indicators: trends }),
);
console.error(`Готово: ${indicators.length} показателей, ${countries.length} стран, рядов: ${trends.map((t) => `${t.id} ${Object.keys(t.series).length}`).join(', ')}`);
