// Keyboard + mouse input. WASD moves, mouse drags (or pointer lock) the camera.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouseDown = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.clicked = false;      // consumed by the game loop each frame
    this.locked = false;
    this.canvas = canvas;
    this.onAction = null;      // callback for one-shot keys (E, F, P, M, H, Space)

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (this.onAction) this.onAction(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.clicked = true;
      if (e.button === 0 && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    });
    window.addEventListener('mouseup', () => { this.mouseDown = false; });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      } else if (this.mouseDown) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    // Touch fallback: drag to look, virtual joystick is out of scope.
    canvas.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (!t || this.lastTouch === undefined) { this.lastTouch = t; return; }
      this.mouseDX += (t.clientX - this.lastTouch.clientX) * 2;
      this.mouseDY += (t.clientY - this.lastTouch.clientY) * 2;
      this.lastTouch = t;
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchend', () => { this.lastTouch = undefined; });
  }

  down(code) { return this.keys.has(code); }

  // Forward / strafe in -1..1, from WASD or arrows.
  moveAxes() {
    let f = 0, s = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) f += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) f -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) s += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) s -= 1;
    return { f, s };
  }

  consumeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  consumeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }
}
