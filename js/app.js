import { mountAnalyst, unmountAnalyst } from './analyst/view.js';
import { renderHome } from './home.js';
import { mountHues, unmountHues } from './hues/view.js';
import { loadGame as loadRicochetGame, newGame as newRicochetGame } from './ricochet/session.js';
import { mountRicochet, unmountRicochet } from './ricochet/view.js';
import { applyTheme, loadSettings } from './settings.js';
import { loadGame } from './sudoku/session.js';
import { mountSudoku, unmountSudoku } from './sudoku/view.js';
import { closeAllOverlays } from './ui.js';

const root = document.getElementById('app');
let openedFromHome = false;

function openGame(name) {
  openedFromHome = true;
  location.hash = `#/${name}`;
}

// Назад из игры — шаг по истории, чтобы системная кнопка «назад» на Android вела себя так же.
function exitToHome() {
  if (openedFromHome) {
    openedFromHome = false;
    history.back();
  } else {
    location.replace('#/');
  }
}

function route() {
  unmountSudoku();
  unmountRicochet();
  unmountHues();
  unmountAnalyst();
  closeAllOverlays();
  root.replaceChildren();
  const analyst = location.hash.match(/^#\/analyst\/(corr|dist|trend|outlier|share|metrics)$/);
  if (analyst) {
    mountAnalyst(root, analyst[1], { onExit: exitToHome });
    return;
  }
  if (location.hash === '#/hues/memory' || location.hash === '#/hues/palette') {
    mountHues(root, location.hash.slice('#/hues/'.length), { onExit: exitToHome });
    return;
  }
  if (location.hash === '#/ricochet') {
    mountRicochet(root, loadRicochetGame() ?? newRicochetGame(), { onExit: exitToHome });
    return;
  }
  if (location.hash === '#/sudoku') {
    const game = loadGame();
    if (game) {
      mountSudoku(root, game, { onExit: exitToHome });
      return;
    }
    history.replaceState(null, '', '#/');
  }
  renderHome(root, { onOpen: openGame });
}

applyTheme(loadSettings().theme);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(loadSettings().theme));
window.addEventListener('hashchange', route);
route();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
