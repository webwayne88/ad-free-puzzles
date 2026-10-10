// Значения показателя по странам; для лог-шкалы — только положительные.
export function countryValues(data, indicator) {
  const out = [];
  data.countries.forEach((code, k) => {
    const value = indicator.values[k];
    if (value === null || (indicator.log && value <= 0)) return;
    out.push({ code, name: data.names[k], value });
  });
  return out;
}

export function fromAxis(indicator, t) {
  return indicator.log ? 10 ** t : t;
}

export function sourceNote(count, period, shorts) {
  return `${count} стран, в среднем за ${period}. Данные: ${[...new Set(shorts)].join(', ')} через Our World in Data`;
}

// Первая буква строчная, но аббревиатуры («ВВП», «CO₂») не трогаем.
export function decapitalize(text) {
  return /^[A-ZА-ЯЁ]{2}/.test(text) ? text : text[0].toLowerCase() + text.slice(1);
}
