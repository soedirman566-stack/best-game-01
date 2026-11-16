// EMBERFALL — entry point and game orchestration. Owns the state machine
// (menu → playing ⇄ level-up / pause → game over), the fixed-step loop, mouse
// and keyboard routing, and the deterministic staged scenes the screenshots
// are taken from (?shot=<scene>&seed=<n>, the house pattern).

import { FIXED_STEP, UPGRADES, VIEW_WIDTH, VIEW_HEIGHT } from './config.js';
import { World, autopilotControl, mulberry32 } from './world.js';
import { Renderer } from './render.js';
import { input } from './input.js';
import { sound } from './audio.js';

const CARD = { w: 292, h: 330, gap: 28, y: 216 };

export function formatTime(seconds) {
  const t = Math.floor(seconds);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.world = new World(mulberry32((Math.random() * 1e9) | 0));
    this.state = 'menu';
    this.highScore = 0;
    this.choices = [];
    this.hover = -1;
    this.mouse = { x: 0, y: 0 };
    this.acc = 0;
    this.lastTs = 0;
    this.gameOverAt = 0;
    this.attractDead = 0;
    input.attach();
    input.onFirstGesture = () => sound.unlock();
    canvas.addEventListener('pointerdown', (e) => { sound.unlock(); this.handleClick(e); });
    canvas.addEventListener('pointermove', (e) => this.handleMove(e));
  }

  viewPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (VIEW_WIDTH / rect.width),
      y: (e.clientY - rect.top) * (VIEW_HEIGHT / rect.height),
    };
  }

  handleMove(e) {
    this.mouse = this.viewPoint(e);
    if (this.state === 'levelup') this.hover = this.cardAt(this.mouse.x, this.mouse.y);
  }

  cardAt(x, y) {
    const total = CARD.w * 3 + CARD.gap * 2;
    const x0 = (VIEW_WIDTH - total) / 2;
    for (let i = 0; i < 3; i++) {
      const cx = x0 + i * (CARD.w + CARD.gap);
      if (x >= cx && x <= cx + CARD.w && y >= CARD.y && y <= CARD.y + CARD.h) return i;
    }
    return -1;
  }

  handleClick(e) {
    const pt = this.viewPoint(e);
    if (this.state === 'menu') this.startRun();
    else if (this.state === 'levelup') {
      const i = this.cardAt(pt.x, pt.y);
      if (i >= 0) this.pickUpgrade(i);
    } else if (this.state === 'gameover' && performance.now() - this.gameOverAt > 700) {
      this.startRun();
    }
  }

  startRun() {
    this.world = new World(mulberry32((Math.random() * 1e9) | 0));
    this.state = 'playing';
    sound.uiClick();
  }

  pickUpgrade(i) {
    const choice = this.choices[i];
    if (!choice) return;
    this.world.applyUpgrade(choice);
    if (this.world.pendingLevelUps > 0) {
      this.choices = this.world.rollUpgradeChoices();
    } else {
      this.state = 'playing';
      this.choices = [];
    }
  }

  openLevelUp() {
    this.state = 'levelup';
    this.choices = this.world.rollUpgradeChoices();
    this.hover = -1;
    sound.levelUp();
  }

  frame(ts) {
    requestAnimationFrame((t) => this.frame(t));
    if (!this.lastTs) this.lastTs = ts;
    let dt = Math.min(0.1, (ts - this.lastTs) / 1000);
    this.lastTs = ts;
    this.pollKeys();
    if (this.state === 'playing' || this.state === 'menu') {
      const scale = this.world.hitStop > 0 ? 0.12 : 1;
      this.acc += dt * scale;
      let guard = 0;
      while (this.acc >= FIXED_STEP && guard < 40) {
        const control = this.state === 'menu'
          ? autopilotControl(this.world)
          : this.readControl();
        this.world.update(FIXED_STEP, control);
        this.acc -= FIXED_STEP;
        guard += 1;
      }
      if (this.state === 'playing' && this.world.playerDead) {
        this.state = 'gameover';
        this.gameOverAt = performance.now();
        this.highScore = Math.max(this.highScore, this.world.score);
        sound.gameOver();
      }
      if (this.state === 'playing' && this.world.pendingLevelUps > 0) this.openLevelUp();
      if (this.state === 'menu' && this.world.playerDead) {
        this.attractDead += dt;
        if (this.attractDead > 2.5) {
          this.world = new World(mulberry32((Math.random() * 1e9) | 0));
          this.attractDead = 0;
        }
      }
    } else if (this.state === 'gameover') {
      this.world.updateFx(dt);
    }
    this.renderer.draw(this.world, this.ui());
    input.endFrame();
  }

  readControl() {
    const axis = input.axis();
    const dash = input.consumePress('ShiftLeft', 'ShiftRight', 'Space');
    return { x: axis.x, y: axis.y, dash };
  }

  pollKeys() {
    if (input.consumePress('KeyM')) sound.setMuted(!sound.muted);
    if (this.state === 'menu') {
      if (input.consumePress('Enter', 'Space')) this.startRun();
    } else if (this.state === 'playing') {
      if (input.consumePress('KeyP', 'Escape')) this.state = 'paused';
    } else if (this.state === 'paused') {
      if (input.consumePress('KeyP', 'Escape')) this.state = 'playing';
    } else if (this.state === 'levelup') {
      if (input.consumePress('Digit1')) this.pickUpgrade(0);
      else if (input.consumePress('Digit2')) this.pickUpgrade(1);
      else if (input.consumePress('Digit3')) this.pickUpgrade(2);
    } else if (this.state === 'gameover') {
      if (input.consumePress('KeyR', 'Enter') && performance.now() - this.gameOverAt > 700) this.startRun();
    }
  }

  ui() {
    return {
      state: this.state,
      choices: this.choices,
      hover: this.hover,
      highScore: this.highScore,
      timeText: formatTime(this.world.time),
    };
  }

  run() {
    requestAnimationFrame((t) => this.frame(t));
  }
}

// ---- staged scenes for screenshots -------------------------------------

function grantUpgrades(world, ids) {
  world.pendingLevelUps = ids.length;
  for (const id of ids) {
    const u = UPGRADES.find((x) => x.id === id);
    if (u) world.applyUpgrade(u);
  }
  world.pendingLevelUps = 0;
}

function stepSeconds(game, seconds, controlFn) {
  const steps = Math.round(seconds / FIXED_STEP);
  for (let i = 0; i < steps; i++) {
    game.world.update(FIXED_STEP, controlFn(game.world));
  }
}

export function stageShot(game, name, seed) {
  const rng = mulberry32(seed);
  game.world = new World(rng);
  const pilot = (w) => autopilotControl(w);
  if (name === 'menu') {
    game.world.startWave();
    stepSeconds(game, 4.5, pilot);
    game.highScore = 12480;
    game.state = 'menu';
  } else if (name === 'fight') {
    grantUpgrades(game.world, ['damage', 'damage', 'multi', 'blades', 'rate']);
    game.world.player.level = 6;
    game.world.wave = 5;
    game.world.startWave(); // wave 6, no boss
    // A dense pack already closing in, so the frame is mid-fight, not a trickle.
    const w = game.world;
    const ring = (kinds, dist) => kinds.forEach((kind, i) => {
      const a = (i / kinds.length) * Math.PI * 2 + rng() * 0.4;
      const d = dist + rng() * 90;
      w.spawnEnemy(kind, w.player.x + Math.cos(a) * d, w.player.y + Math.sin(a) * d);
    });
    ring(['drifter', 'drifter', 'darter', 'splitter', 'drifter', 'darter', 'bulwark', 'splitter', 'drifter', 'darter', 'spark', 'bulwark'], 190);
    stepSeconds(game, 3.2, pilot);
    // A fresh wavelet at bolt range, so the captured frame has fire in flight.
    ring(['drifter', 'darter', 'splitter', 'drifter', 'darter', 'spark'], 170);
    stepSeconds(game, 0.5, pilot);
    if (w.playerDead) { w.playerDead = false; w.player.hp = 68; }
    w.player.hp = Math.min(w.player.hp, 68);
    w.score = Math.max(w.score, 2640);
    w.kills = Math.max(w.kills, 57);
    w.time = 128;
    game.state = 'playing';
  } else if (name === 'upgrade') {
    grantUpgrades(game.world, ['damage', 'multi']);
    game.world.player.level = 4;
    game.world.wave = 2;
    game.world.startWave();
    stepSeconds(game, 6, pilot);
    game.world.pendingLevelUps = 1;
    game.choices = [
      UPGRADES.find((u) => u.id === 'multi'),
      UPGRADES.find((u) => u.id === 'chain'),
      UPGRADES.find((u) => u.id === 'blades'),
    ];
    game.hover = 1;
    game.state = 'levelup';
  } else if (name === 'gameover') {
    grantUpgrades(game.world, ['damage', 'multi', 'rate', 'blades', 'chain']);
    game.world.player.level = 9;
    game.world.wave = 9;
    game.world.startWave(); // wave 10: the Pyre Husk
    stepSeconds(game, 6, pilot);
    const w = game.world;
    w.score = Math.max(w.score, 11840);
    w.kills = Math.max(w.kills, 214);
    w.time = 392;
    w.deathCause = 'Felled by the Pyre Husk';
    w.playerDead = true;
    w.player.hp = 0;
    game.highScore = w.score;
    game.state = 'gameover';
  }
  game.renderer.draw(game.world, game.ui());
  window.__shotReady = true;
}

// ---- boot ------------------------------------------------------------------

const canvas = document.getElementById('game');
const game = new Game(canvas);
window.__emberfall = game; // debug handle for playtests and staged screenshots
const params = new URLSearchParams(location.search);
if (params.has('shot')) {
  stageShot(game, params.get('shot'), Number(params.get('seed') || 1));
} else {
  game.run();
}
