// EMBERFALL — keyboard state with edge detection. The game polls isDown() for
// movement and consumePress() for one-shot actions (dash, pause, confirm), so
// a held key never double-fires a menu action.

const PREVENT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set();
    this.onFirstGesture = null;
    this.boundDown = (e) => this.handleDown(e);
    this.boundUp = (e) => this.handleUp(e);
    this.boundBlur = () => { this.down.clear(); this.pressed.clear(); };
  }

  attach() {
    window.addEventListener('keydown', this.boundDown);
    window.addEventListener('keyup', this.boundUp);
    window.addEventListener('blur', this.boundBlur);
  }

  detach() {
    window.removeEventListener('keydown', this.boundDown);
    window.removeEventListener('keyup', this.boundUp);
    window.removeEventListener('blur', this.boundBlur);
  }

  handleDown(e) {
    if (PREVENT.has(e.code)) e.preventDefault();
    if (this.onFirstGesture) { const cb = this.onFirstGesture; this.onFirstGesture = null; cb(); }
    if (!e.repeat) this.pressed.add(e.code);
    this.down.add(e.code);
  }

  handleUp(e) {
    this.down.delete(e.code);
  }

  isDown(...codes) {
    return codes.some((c) => this.down.has(c));
  }

  consumePress(...codes) {
    for (const c of codes) {
      if (this.pressed.has(c)) {
        this.pressed.delete(c);
        return true;
      }
    }
    return false;
  }

  endFrame() {
    this.pressed.clear();
  }

  axis() {
    const x = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    const y = (this.isDown('KeyS', 'ArrowDown') ? 1 : 0) - (this.isDown('KeyW', 'ArrowUp') ? 1 : 0);
    return { x, y };
  }
}

export const input = new Input();
