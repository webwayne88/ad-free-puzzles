import { COLS, FLOOR, GAP, HEIGHT, R, RING_R, aimEnd, clampAim, launch, step } from './engine.js';
import { clearGame, loadBest, newGame, saveBest, saveGame } from './session.js';
import { icon } from '../icons.js';
import { chooseTheme } from '../settings.js';
import { el, isOverlayOpen, openOverlay, resultRow } from '../ui.js';

const BLOCK_TEXT = '#141826';
// Шар из кольца — другого цвета, пока не присоединится к остальным.
const DROP_COLOR = '#4fb3a0';
const FONT = "Roboto, system-ui, -apple-system, 'Segoe UI', sans-serif";
const SHIFT_MS = 240;
const FLASH_MS = 90;
const PARTICLE_MS = 450;
const BOOST_SPEED = 4;
const DRAG_THRESHOLD_PX = 14;
const AIM_DOT_STEP = 0.34;
const KEY_TURN = (2 * Math.PI) / 180;
const KEY_MAX_ANGLE = (80 * Math.PI) / 180;

let ctx = null;

const SCREEN_HTML = `
  <header class="topbar">
    <button type="button" class="pill pill-icon" data-act="back" aria-label="Назад">${icon('back')}</button>
    <div class="pill pill-group">
      <button type="button" class="pill-icon" data-act="theme" aria-label="Оформление">${icon('palette')}</button>
      <button type="button" class="pill-icon" data-act="pause" aria-label="Пауза">${icon('pause')}</button>
    </div>
  </header>
  <main class="bz-play">
    <section class="board-card bz-card">
      <div class="status">
        <span class="status-level">Рекорд <span class="bz-best"></span></span>
        <span class="bz-score" aria-live="polite"></span>
        <span class="bz-balls"></span>
      </div>
      <canvas class="bz-canvas" role="img" aria-label="Игровое поле"></canvas>
    </section>
    <div class="bz-bottom">
      <button type="button" class="btn bz-boost" data-act="boost" hidden>${icon('forward', 'icon icon-sm')}<span>Ускорить ×4</span></button>
      <p class="bz-hint" hidden>Потяни вниз и отпусти</p>
    </div>
  </main>`;

// Оттенки как в оригинале, тона — под палитру приложения; тёмные цифры читаются на всех (контраст ≥ 4.4).
function blockColor(hp, level) {
  const ratio = hp / level;
  if (ratio > 1.05) return '#9077f0';
  if (ratio >= 0.9) return '#4fb3a0';
  if (ratio >= 0.7) return '#5b7fe0';
  if (ratio >= 0.4) return '#d0569a';
  return '#f08c62';
}

function easeOut(t) {
  return 1 - (1 - t) ** 3;
}

function speedFor(seconds, boosted) {
  if (boosted) return BOOST_SPEED;
  if (seconds < 3) return 1;
  return seconds < 6 ? 1.7 : 2.6;
}

function readColors(c) {
  const style = getComputedStyle(c.els.screen);
  const token = (name) => style.getPropertyValue(name).trim();
  c.colors = { field: token('--bg'), ball: token('--accent'), text: token('--muted') };
}

// ---------- Отрисовка ----------

function resize(c) {
  const play = c.els.play.getBoundingClientRect();
  const reserved = c.els.status.offsetHeight + c.els.bottom.offsetHeight + 8 + 16;
  c.unit = Math.max(10, Math.floor(Math.min((play.width - 8) / COLS, (play.height - reserved) / HEIGHT)));
  c.dpr = window.devicePixelRatio || 1;
  const canvas = c.els.canvas;
  canvas.style.width = `${c.unit * COLS}px`;
  canvas.style.height = `${c.unit * HEIGHT}px`;
  canvas.width = Math.round(c.unit * COLS * c.dpr);
  canvas.height = Math.round(c.unit * HEIGHT * c.dpr);
  c.els.screen.style.setProperty('--field-w', `${c.unit * COLS}px`);
}

function drawBlocks(c, u, offset, appear, now) {
  const g = c.g;
  const size = (1 - 2 * GAP) * u;
  const radius = 0.08 * u;
  g.font = `500 ${Math.round(u * 0.34)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const block of c.state.blocks) {
    const x = (block.c + GAP) * u;
    const y = (block.r - offset + GAP) * u;
    g.globalAlpha = block.r === 1 ? appear : 1;
    g.fillStyle = blockColor(block.hp, c.state.level);
    g.beginPath();
    g.roundRect(x, y, size, size, radius);
    g.fill();
    if ((c.flash.get(block) ?? 0) > now) {
      g.fillStyle = 'rgba(255, 255, 255, 0.4)';
      g.fill();
    }
    g.fillStyle = BLOCK_TEXT;
    g.fillText(String(block.hp), x + size / 2, y + size / 2 + u * 0.02);
  }
  g.globalAlpha = 1;
}

function drawRings(c, u, offset, appear, now) {
  const g = c.g;
  const pulse = 1 + 0.07 * Math.sin(now / 220);
  g.strokeStyle = c.colors.ball;
  g.fillStyle = c.colors.ball;
  g.lineWidth = u * 0.055;
  for (const ring of c.state.rings) {
    const x = (ring.c + 0.5) * u;
    const y = (ring.r + 0.5 - offset) * u;
    g.globalAlpha = ring.r === 1 ? appear : 1;
    g.beginPath();
    g.arc(x, y, (RING_R - 0.03) * u * pulse, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(x, y, 0.085 * u, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function drawBall(g, x, y, u) {
  g.beginPath();
  g.arc(x * u, y * u, R * u, 0, Math.PI * 2);
  g.fill();
}

function drawAim(c, u) {
  const s = c.state;
  if (!c.aim || s.phase !== 'aim') return;
  const end = aimEnd(s, c.aim);
  const length = Math.hypot(end.x - s.launchX, end.y - (FLOOR - R));
  const g = c.g;
  g.fillStyle = c.colors.ball;
  for (let d = AIM_DOT_STEP; d < length; d += AIM_DOT_STEP) {
    g.beginPath();
    g.arc((s.launchX + c.aim.x * d) * u, (FLOOR - R + c.aim.y * d) * u, 0.055 * u, 0, Math.PI * 2);
    g.fill();
  }
}

function drawLauncher(c, u) {
  const s = c.state;
  const waiting = s.phase === 'aim' ? s.ballCount : s.toLaunch;
  if (!waiting) return;
  const g = c.g;
  g.fillStyle = c.colors.ball;
  drawBall(g, s.launchX, FLOOR - R, u);
  g.fillStyle = c.colors.text;
  g.font = `400 ${Math.round(u * 0.3)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const labelX = Math.min(Math.max(s.launchX, 0.5), COLS - 0.5);
  g.fillText(`x${waiting}`, labelX * u, (FLOOR - R - 0.32) * u);
}

function drawParticles(c, u, now) {
  const g = c.g;
  c.particles = c.particles.filter((p) => now - p.born < PARTICLE_MS);
  for (const p of c.particles) {
    const t = (now - p.born) / 1000;
    g.globalAlpha = 1 - (now - p.born) / PARTICLE_MS;
    g.fillStyle = p.color;
    const size = 0.12 * u;
    g.fillRect((p.x + p.vx * t) * u - size / 2, (p.y + p.vy * t + 6 * t * t) * u - size / 2, size, size);
  }
  g.globalAlpha = 1;
}

function draw(c, now) {
  const g = c.g;
  const u = c.unit * c.dpr;
  const progress = Math.min(1, (now - c.shiftStart) / SHIFT_MS);
  const offset = 1 - easeOut(progress);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = c.colors.field;
  g.fillRect(0, 0, c.els.canvas.width, c.els.canvas.height);
  drawBlocks(c, u, offset, progress, now);
  drawRings(c, u, offset, progress, now);
  drawAim(c, u);
  g.fillStyle = c.colors.ball;
  for (const ball of c.state.balls) drawBall(g, ball.x, ball.y, u);
  g.fillStyle = DROP_COLOR;
  for (const drop of c.state.drops) drawBall(g, drop.x, drop.y, u);
  drawLauncher(c, u);
  drawParticles(c, u, now);
}

// ---------- Игровой цикл ----------

function burst(c, x, y, color, now) {
  for (let k = 0; k < 10; k++) {
    const angle = (k / 10) * Math.PI * 2 + Math.random() * 0.5;
    const speed = 1.5 + Math.random() * 2;
    c.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 1.5, color, born: now });
  }
}

function updateHud(c) {
  const s = c.state;
  if (s.level > c.best) {
    c.best = s.level;
    saveBest(s.level);
  }
  c.els.score.textContent = String(s.level);
  c.els.best.textContent = String(c.best);
  c.els.balls.textContent = `Шары: ${s.ballCount}`;
}

function handleEvents(c, events, now) {
  for (const event of events) {
    if (event.type === 'hit') c.flash.set(event.block, now + FLASH_MS);
    if (event.type === 'break') burst(c, event.block.c + 0.5, event.block.r + 0.5, blockColor(1, c.state.level), now);
    if (event.type === 'ring') burst(c, event.ring.c + 0.5, event.ring.r + 0.5, c.colors.ball, now);
    if (event.type === 'turn') {
      c.shiftStart = now;
      saveGame(c.state);
      updateHud(c);
    }
    if (event.type === 'over') gameOver(c);
  }
}

function frame(now) {
  const c = ctx;
  if (!c) return;
  c.raf = requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - c.last) / 1000);
  c.last = now;
  if (c.state.phase === 'fly' && !c.paused) {
    c.turnSeconds += dt;
    handleEvents(c, step(c.state, dt * speedFor(c.turnSeconds, c.boosted)), now);
  }
  c.els.boost.hidden = !(c.state.phase === 'fly' && !c.boosted);
  draw(c, now);
}

function fire(c) {
  if (!launch(c.state, c.aim)) return;
  c.aim = null;
  c.turnSeconds = 0;
  c.boosted = false;
  c.els.hint.hidden = true;
}

// ---------- Ввод: оттянуть вниз и отпустить, как рогатку ----------

function onPointerDown(event) {
  const c = ctx;
  if (!c || c.paused || c.state.phase !== 'aim' || event.target.closest('button')) return;
  c.drag = { x0: event.clientX, y0: event.clientY, id: event.pointerId };
  c.aim = null;
  c.els.screen.setPointerCapture(event.pointerId);
}

function onPointerMove(event) {
  const c = ctx;
  if (!c || !c.drag || event.pointerId !== c.drag.id) return;
  const dx = c.drag.x0 - event.clientX;
  const dy = c.drag.y0 - event.clientY;
  c.aim = Math.hypot(dx, dy) > DRAG_THRESHOLD_PX ? clampAim(dx, dy) : null;
}

function onPointerUp(event) {
  const c = ctx;
  if (!c || !c.drag || event.pointerId !== c.drag.id) return;
  c.drag = null;
  if (event.type === 'pointerup' && c.aim) fire(c);
  else c.aim = null;
}

function onKeyDown(event) {
  const c = ctx;
  if (!c || isOverlayOpen() || event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key;
  if (key === 'Escape' || key === 'p' || key === 'з') openPause(c);
  else if (key === 'ArrowDown' && c.state.phase === 'fly') c.boosted = true;
  else if ((key === 'ArrowLeft' || key === 'ArrowRight') && c.state.phase === 'aim') {
    const delta = key === 'ArrowLeft' ? -KEY_TURN : KEY_TURN;
    c.keyAngle = Math.min(KEY_MAX_ANGLE, Math.max(-KEY_MAX_ANGLE, c.keyAngle + delta));
    c.aim = clampAim(Math.sin(c.keyAngle), -Math.cos(c.keyAngle));
  } else if ((key === 'Enter' || key === ' ' || key === 'ArrowUp') && c.state.phase === 'aim') {
    if (!c.aim) c.aim = clampAim(Math.sin(c.keyAngle), -Math.cos(c.keyAngle));
    fire(c);
  } else return;
  event.preventDefault();
}

// ---------- Пауза, тема и конец игры ----------

function resumeAfterOverlay(c) {
  c.paused = false;
  c.last = performance.now();
}

function restartGame(c) {
  c.state = newGame();
  c.particles = [];
  c.aim = null;
  c.shiftStart = performance.now();
  c.els.hint.hidden = false;
  updateHud(c);
}

function openPause(c) {
  if (c.paused) return;
  c.paused = true;
  c.drag = null;
  c.aim = null;
  openOverlay({
    title: 'Пауза',
    variant: 'dialog',
    actions: [
      { label: 'На главную', onClick: () => c.onExit() },
      { label: 'Заново', onClick: () => restartGame(c) },
      { label: 'Продолжить', primary: true, onClick: () => {} },
    ],
    onClose: () => resumeAfterOverlay(c),
  });
}

function openTheme(c) {
  c.paused = true;
  chooseTheme(() => resumeAfterOverlay(c));
}

function gameOver(c) {
  clearGame();
  updateHud(c);
  const body = el('div', 'result');
  body.append(resultRow('Счёт', String(c.state.level)), resultRow('Рекорд', String(c.best)));
  setTimeout(() => {
    if (ctx !== c) return;
    openOverlay({
      title: 'Игра окончена',
      variant: 'dialog',
      dismissible: false,
      body,
      actions: [
        { label: 'На главную', onClick: () => c.onExit() },
        { label: 'Ещё раз', primary: true, onClick: () => restartGame(c) },
      ],
    });
  }, 500);
}

// ---------- Жизненный цикл ----------

function onThemeChange() {
  if (ctx) readColors(ctx);
}

const themeObserver = new MutationObserver(onThemeChange);
const darkQuery = matchMedia('(prefers-color-scheme: dark)');

export function mountBallz(root, state, { onExit }) {
  const screen = el('div', 'screen ballz');
  screen.innerHTML = SCREEN_HTML;
  root.append(screen);
  const now = performance.now();
  ctx = {
    state,
    onExit,
    els: {
      screen,
      play: screen.querySelector('.bz-play'),
      status: screen.querySelector('.status'),
      bottom: screen.querySelector('.bz-bottom'),
      canvas: screen.querySelector('.bz-canvas'),
      score: screen.querySelector('.bz-score'),
      best: screen.querySelector('.bz-best'),
      balls: screen.querySelector('.bz-balls'),
      boost: screen.querySelector('.bz-boost'),
      hint: screen.querySelector('.bz-hint'),
    },
    g: null,
    colors: null,
    unit: 0,
    dpr: 1,
    flash: new WeakMap(),
    particles: [],
    drag: null,
    aim: null,
    keyAngle: 0,
    paused: false,
    turnSeconds: 0,
    boosted: false,
    shiftStart: now,
    last: now,
    best: loadBest(),
    raf: 0,
    observer: null,
  };
  const c = ctx;
  c.g = c.els.canvas.getContext('2d');
  c.els.hint.hidden = state.level > 1;
  screen.querySelector('[data-act="back"]').addEventListener('click', () => c.onExit());
  screen.querySelector('[data-act="theme"]').addEventListener('click', () => openTheme(c));
  screen.querySelector('[data-act="pause"]').addEventListener('click', () => openPause(c));
  c.els.boost.addEventListener('click', () => {
    c.boosted = true;
  });
  screen.addEventListener('pointerdown', onPointerDown);
  screen.addEventListener('pointermove', onPointerMove);
  screen.addEventListener('pointerup', onPointerUp);
  screen.addEventListener('pointercancel', onPointerUp);
  document.addEventListener('keydown', onKeyDown);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  darkQuery.addEventListener('change', onThemeChange);
  c.observer = new ResizeObserver(() => resize(c));
  c.observer.observe(c.els.play);
  readColors(c);
  updateHud(c);
  resize(c);
  c.raf = requestAnimationFrame(frame);
}

export function unmountBallz() {
  if (!ctx) return;
  cancelAnimationFrame(ctx.raf);
  ctx.observer.disconnect();
  themeObserver.disconnect();
  darkQuery.removeEventListener('change', onThemeChange);
  document.removeEventListener('keydown', onKeyDown);
  ctx = null;
}
