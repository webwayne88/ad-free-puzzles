import { pick, shuffle } from './stats.js';

// Типографский минус вместо дефиса.
function f(n) {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 2 }).replace('-', '−');
}

// Каждая задача: вопрос, точный ответ, единица и разбор на тех же числах.
const TEMPLATES = [
  function ctr(rng) {
    const shows = pick(rng, [20000, 25000, 40000, 50000, 80000, 120000]);
    const clicks = Math.round((shows * pick(rng, [0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 3, 4])) / 100);
    const answer = (clicks / shows) * 100;
    return {
      question: `Показов ${f(shows)}, кликов ${f(clicks)}. Какой CTR?`,
      answer,
      unit: '%',
      explain: `CTR = клики / показы = ${f(clicks)} / ${f(shows)} = ${f(answer)}%`,
    };
  },
  function conversion(rng) {
    const visits = pick(rng, [1200, 2500, 4000, 8000, 15000]);
    const orders = Math.round((visits * pick(rng, [0.8, 1.5, 2, 2.5, 3.2, 4, 5])) / 100);
    const answer = (orders / visits) * 100;
    return {
      question: `Визитов ${f(visits)}, заказов ${f(orders)}. Какая конверсия?`,
      answer,
      unit: '%',
      explain: `Конверсия = заказы / визиты = ${f(orders)} / ${f(visits)} = ${f(answer)}%`,
    };
  },
  function percentagePoints(rng) {
    const from = pick(rng, [2, 2.5, 4, 5, 8, 10]);
    const delta = pick(rng, [0.5, 1, 2]);
    const answer = (delta / from) * 100;
    return {
      question: `Конверсия выросла с ${f(from)}% до ${f(from + delta)}%. На сколько процентов она выросла?`,
      answer,
      unit: '%',
      explain: `Рост на ${f(delta)} п.п., а относительно — ${f(delta)} / ${f(from)} = ${f(answer)}%. Процентные пункты и проценты — разные вещи.`,
    };
  },
  function downThenUp(rng) {
    const down = pick(rng, [10, 20, 25, 30, 50]);
    const up = pick(rng, [10, 20, 25, 40, 50]);
    const answer = ((1 - down / 100) * (1 + up / 100) - 1) * 100;
    return {
      question: `Выручка упала на ${down}%, а затем выросла на ${up}%. Как она изменилась за весь период?`,
      answer,
      unit: '%',
      explain: `${f(1 - down / 100)} × ${f(1 + up / 100)} − 1 = ${f(answer)}%. Рост считается от уже уменьшенной базы.`,
    };
  },
  function romi(rng) {
    const spend = pick(rng, [100, 200, 250, 400, 500]);
    const profit = spend * pick(rng, [0.5, 0.8, 1.2, 1.5, 2, 3]);
    const answer = ((profit - spend) / spend) * 100;
    return {
      question: `Кампания стоила ${f(spend)} тыс. ₽ и принесла ${f(profit)} тыс. ₽ валовой прибыли. Какой ROMI?`,
      answer,
      unit: '%',
      explain: `ROMI = (прибыль − расходы) / расходы = (${f(profit)} − ${f(spend)}) / ${f(spend)} = ${f(answer)}%`,
    };
  },
  function cac(rng) {
    const budget = pick(rng, [150, 300, 450, 600]);
    const clients = pick(rng, [50, 75, 100, 120, 150, 200, 250, 300]);
    const answer = (budget * 1000) / clients;
    return {
      question: `На рекламу потратили ${f(budget)} тыс. ₽ и привели ${f(clients)} новых клиентов. Какой CAC?`,
      answer,
      unit: '₽',
      explain: `CAC = расходы / новые клиенты = ${f(budget * 1000)} / ${f(clients)} = ${f(answer)} ₽`,
    };
  },
  function funnel(rng) {
    const visits = pick(rng, [10000, 20000, 40000]);
    const cart = pick(rng, [10, 15, 20, 25]);
    const buy = pick(rng, [20, 25, 40, 50]);
    const answer = (visits * cart * buy) / 10000;
    return {
      question: `${f(visits)} визитов, ${cart}% добавляют товар в корзину, ${buy}% из них оформляют заказ. Сколько заказов?`,
      answer,
      unit: 'заказов',
      explain: `${f(visits)} × ${f(cart / 100)} × ${f(buy / 100)} = ${f(answer)}`,
    };
  },
  function funnelBack(rng) {
    const orders = pick(rng, [150, 200, 300, 500]);
    const cr = pick(rng, [1, 2, 2.5, 4, 5]);
    const answer = (orders / cr) * 100;
    return {
      question: `Нужно ${f(orders)} заказов, конверсия сайта ${f(cr)}%. Сколько нужно визитов?`,
      answer,
      unit: 'визитов',
      explain: `Визиты = заказы / конверсия = ${f(orders)} / ${f(cr / 100)} = ${f(answer)}`,
    };
  },
  function averageCheck(rng) {
    const revenue = pick(rng, [1.2, 1.8, 2.4, 3.6]);
    const orders = pick(rng, [400, 600, 800, 1200]);
    const answer = (revenue * 1e6) / orders;
    return {
      question: `Выручка ${f(revenue)} млн ₽ за ${f(orders)} заказов. Какой средний чек?`,
      answer,
      unit: '₽',
      explain: `Средний чек = выручка / заказы = ${f(revenue * 1e6)} / ${f(orders)} = ${f(answer)} ₽`,
    };
  },
  function compound(rng) {
    const growth = pick(rng, [5, 10, 20]);
    const months = pick(rng, [2, 3, 4]);
    const answer = ((1 + growth / 100) ** months - 1) * 100;
    return {
      question: `Аудитория растёт на ${growth}% в месяц. На сколько процентов она вырастет за ${months} месяца?`,
      answer,
      unit: '%',
      explain: `(1 + ${f(growth / 100)})^${months} − 1 = ${f(answer)}%, а не ${growth * months}%: каждый месяц растёт уже увеличенная база.`,
    };
  },
  function ltv(rng) {
    const check = pick(rng, [1500, 2000, 3000, 4000]);
    const purchases = pick(rng, [2, 3, 4, 5, 6]);
    const margin = pick(rng, [20, 25, 30, 40, 50]);
    const answer = (check * purchases * margin) / 100;
    return {
      question: `Средний чек ${f(check)} ₽, клиент делает ${purchases} ${purchases < 5 ? 'покупки' : 'покупок'}, маржа ${margin}%. Какой LTV по марже?`,
      answer,
      unit: '₽',
      explain: `LTV = чек × покупки × маржа = ${f(check)} × ${purchases} × ${f(margin / 100)} = ${f(answer)} ₽`,
    };
  },
  function survey(rng) {
    const total = pick(rng, [400, 800, 1000, 1200]);
    const share = pick(rng, [25, 30, 40, 60]);
    const chose = pick(rng, [10, 15, 20, 25, 50]);
    const answer = (total * share * chose) / 10000;
    return {
      question: `Из ${f(total)} респондентов ${share}% — мужчины, и ${chose}% из них выбрали вариант A. Сколько это человек?`,
      answer,
      unit: 'чел.',
      explain: `${f(total)} × ${f(share / 100)} × ${f(chose / 100)} = ${f(answer)}`,
    };
  },
];

export function createMetricsRounds(rng, count) {
  return shuffle(TEMPLATES, rng)
    .slice(0, count)
    .map((make) => ({ kind: make.name, ...make(rng) }));
}

// Ошибка до 1% — полный балл (округление), дальше линейно до нуля при 20%.
export function scoreNumber(guess, answer) {
  const error = Math.abs(guess - answer) / Math.max(Math.abs(answer), 1);
  if (error <= 0.01) return 10;
  return Math.round(Math.max(0, 1 - (error - 0.01) / 0.19) * 100) / 10;
}

export function formatAnswer(value) {
  return f(Math.round(value * 100) / 100);
}
