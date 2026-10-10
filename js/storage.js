// localStorage может быть недоступен (приватный режим) — игра должна работать и без сохранений.
export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // нет места или хранилище заблокировано
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // хранилище заблокировано
  }
}
