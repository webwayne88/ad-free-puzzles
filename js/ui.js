const stack = [];
let overlayId = 0;

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function resultRow(label, value, accent) {
  const row = el('div', 'result-row');
  row.append(el('span', 'result-label', label), el('span', accent ? 'result-value is-accent' : 'result-value', value));
  return row;
}

export function isOverlayOpen() {
  return stack.length > 0;
}

function focusables(panel) {
  return [...panel.querySelectorAll('button:not([disabled])')];
}

function closeEntry(entry) {
  if (entry.closed) return;
  entry.closed = true;
  stack.splice(stack.indexOf(entry), 1);
  entry.backdrop.classList.remove('open');
  setTimeout(() => entry.backdrop.remove(), 320);
  if (entry.previousFocus && document.contains(entry.previousFocus)) entry.previousFocus.focus({ preventScroll: true });
  if (entry.onClose) entry.onClose();
}

// variant: 'sheet' — шторка снизу, 'dialog' — карточка по центру.
export function openOverlay({ title, body, actions = [], variant = 'sheet', dismissible = true, onClose }) {
  overlayId++;
  const backdrop = el('div', `overlay overlay-${variant}`);
  const panel = el('div', 'overlay-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', `overlay-title-${overlayId}`);
  const heading = el('h2', 'overlay-title', title);
  heading.id = `overlay-title-${overlayId}`;
  panel.append(heading);
  if (body) panel.append(body);

  const entry = { backdrop, panel, dismissible, onClose, closed: false, previousFocus: document.activeElement };
  if (actions.length) {
    const row = el('div', 'overlay-actions');
    for (const action of actions) {
      const button = el('button', action.primary ? 'btn btn-primary' : 'btn', action.label);
      button.type = 'button';
      button.addEventListener('click', () => {
        closeEntry(entry);
        action.onClick();
      });
      row.append(button);
    }
    panel.append(row);
  }

  backdrop.append(panel);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop && entry.dismissible) closeEntry(entry);
  });
  document.body.append(backdrop);
  stack.push(entry);
  void backdrop.offsetWidth;
  backdrop.classList.add('open');
  // В шторке фокус на самой панели, чтобы не рисовать рамку на первом пункте; в диалоге — на главной кнопке.
  panel.tabIndex = -1;
  (panel.querySelector('.btn-primary') || panel).focus({ preventScroll: true });
  return () => closeEntry(entry);
}

export function closeAllOverlays() {
  for (const entry of [...stack]) closeEntry(entry);
}

document.addEventListener('keydown', (event) => {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (event.key === 'Escape' && top.dismissible) {
    // Нажатие, закрывшее шторку, не должно дойти до игры (иначе тут же открывается пауза).
    event.preventDefault();
    event.stopImmediatePropagation();
    closeEntry(top);
    return;
  }
  if (event.key !== 'Tab') return;
  const items = focusables(top.panel);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

// Список вариантов. С selected — это радиогруппа (тема), без — меню действий (сложность).
export function choiceList(options, { selected, onPick }) {
  const list = el('div', 'choices');
  list.setAttribute('role', selected === undefined ? 'group' : 'radiogroup');
  for (const option of options) {
    const button = el('button', 'choice');
    button.type = 'button';
    if (selected !== undefined) {
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(option.value === selected));
    }
    const text = el('span', 'choice-text');
    text.append(el('span', 'choice-label', option.label));
    if (option.hint) text.append(el('span', 'choice-hint', option.hint));
    button.append(text);
    if (option.meta) button.append(el('span', 'choice-meta', option.meta));
    if (selected !== undefined) button.append(el('span', 'choice-radio'));
    button.addEventListener('click', () => onPick(option.value));
    list.append(button);
  }
  return list;
}

export function switchList(items) {
  const list = el('div', 'switches');
  for (const item of items) {
    const button = el('button', 'switch-row');
    button.type = 'button';
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-checked', String(item.checked));
    button.append(el('span', 'switch-label', item.label), el('span', 'switch-track'));
    button.addEventListener('click', () => {
      const next = button.getAttribute('aria-checked') !== 'true';
      button.setAttribute('aria-checked', String(next));
      item.onChange(next);
    });
    list.append(button);
  }
  return list;
}
