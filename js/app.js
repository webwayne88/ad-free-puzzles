import { loadGame as loadBallzGame, newGame as newBallzGame } from './ballz/session.js';
import { mountBallz, unmountBallz } from './ballz/view.js';
import { renderHome } from './home.js';
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
  unmountBallz();
  closeAllOverlays();
  root.replaceChildren();
  if (location.hash === '#/ballz') {
    mountBallz(root, loadBallzGame() ?? newBallzGame(), { onExit: exitToHome });
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
