import './styles/ui.css';
import { GameManager } from './game/GameManager';
import { UI } from './ui/UI';
import { audio } from './audio/Audio';
import { Logger } from './core/Logger';

function boot() {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiRoot = document.getElementById('ui-root')!;
  const touchRoot = document.getElementById('touch-root')!;

  // strat pentru damage numbers
  const floatRoot = document.createElement('div');
  floatRoot.id = 'float-root';
  document.getElementById('app')!.appendChild(floatRoot);

  const ui = new UI(uiRoot);
  let game: GameManager | null = null;
  try {
    game = new GameManager(canvas, touchRoot, floatRoot, ui);
    ui.attach(game);
  } catch (e) {
    // fără WebGL (browser foarte vechi / mediu fără GPU): meniul rămâne funcțional
    Logger.err('WebGL indisponibil', e);
    const warn = document.createElement('div');
    warn.id = 'toast';
    warn.style.display = 'block';
    warn.textContent = '⚠️ WebGL indisponibil — meciurile 3D nu pot porni aici.';
    uiRoot.appendChild(warn);
  }

  // pornește muzica de meniu + scena 3D din meniu după primul gest (politica autoplay)
  const unlock = () => {
    audio.unlock();
    audio.startMusic(false);
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock);

  // eroare globală -> mesaj vizibil, nu ecran negru
  window.addEventListener('error', (e) => {
    Logger.err('global', e.message);
    ui.toast('A apărut o eroare — reîncarcă dacă ceva pare blocat.');
  });

  Logger.info('NOVA ARENA v0.1 pornit');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
