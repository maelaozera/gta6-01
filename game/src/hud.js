// HUD: health, money, wanted stars, clock, mission objective, dialogue,
// speedometer, ammo, toasts, and the circular minimap.
import { citySize } from './config.js';

export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      money: document.getElementById('money'),
      health: document.getElementById('healthfill'),
      clock: document.getElementById('clock'),
      wanted: document.getElementById('wanted'),
      objective: document.getElementById('objective'),
      dialog: document.getElementById('dialog'),
      toast: document.getElementById('toast'),
      speedo: document.getElementById('speedo'),
      ammo: document.getElementById('ammo'),
      crosshair: document.getElementById('crosshair'),
      minimap: document.getElementById('minimap'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.dialogTimer = null;
    this.toastTimer = null;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  setMoney(n) { this.el.money.textContent = '$' + Math.floor(n).toLocaleString('en-US'); }
  setHealth(h, max) {
    const pct = Math.max(0, Math.min(100, (h / max) * 100));
    this.el.health.style.width = pct + '%';
    this.el.health.style.background = pct > 50
      ? 'linear-gradient(90deg,#37d67a,#a5ff6e)'
      : pct > 25 ? 'linear-gradient(90deg,#e8a13a,#ffd23e)' : 'linear-gradient(90deg,#d63a37,#ff7a6e)';
  }
  setClock(hour, minute) {
    this.el.clock.textContent = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  }
  setWanted(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '<span class="dim">★</span>';
    this.el.wanted.innerHTML = s;
  }
  setObjective(text) {
    this.el.objective.innerHTML = text ? '<b>MISI</b><br>' + text : '';
  }
  setSpeed(kmh, driving) {
    this.el.speedo.classList.toggle('hidden', !driving);
    if (driving) this.el.speedo.querySelector('.num').textContent = Math.round(kmh);
  }
  setAmmo(ammo, inCar) {
    this.el.ammo.textContent = inCar ? '' : 'Pistol  •  ' + ammo + ' peluru   (F pukul)';
    this.el.crosshair.classList.toggle('hidden', inCar);
  }

  showDialog(text, seconds) {
    const d = this.el.dialog;
    d.innerHTML = '<b>Marco</b> — ' + text.replace(/^Marco:\s*/, '');
    d.classList.remove('hidden');
    if (this.dialogTimer) clearTimeout(this.dialogTimer);
    this.dialogTimer = setTimeout(() => d.classList.add('hidden'), (seconds || 6) * 1000);
  }

  toast(text, seconds) {
    const t = this.el.toast;
    t.textContent = text;
    t.classList.remove('hidden');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.add('hidden'), (seconds || 2.5) * 1000);
  }

  // Top-down minimap: roads, player arrow, traffic, police, mission waypoint.
  drawMinimap(state) {
    const ctx = this.mapCtx;
    const S = 180;
    const size = citySize();
    const scale = S / (size + 30);
    const toMap = (x, z) => [S / 2 + x * scale, S / 2 + z * scale];
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(10,24,34,0.9)';
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.clip();
    // Roads.
    ctx.strokeStyle = 'rgba(180,190,205,0.55)';
    ctx.lineWidth = 4;
    for (const c of state.roadCentres) {
      const [x1, y1] = toMap(c, -size / 2);
      const [x2, y2] = toMap(c, size / 2);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [x3, y3] = toMap(-size / 2, c);
      const [x4, y4] = toMap(size / 2, c);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }
    // Mission waypoint.
    if (state.target) {
      const [x, y] = toMap(state.target.x, state.target.z);
      ctx.fillStyle = '#ffd23e';
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
    }
    // Traffic (white), police (blue/red), player (green arrow).
    ctx.fillStyle = '#dfe6ee';
    for (const c of state.traffic) {
      const [x, y] = toMap(c.x, c.z);
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    for (const p of state.police) {
      const [x, y] = toMap(p.x, p.z);
      ctx.fillStyle = '#4d8dff';
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#dfe6ee';
    }
    const [px, py] = toMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(state.player.headingX, state.player.headingZ));
    ctx.fillStyle = '#37d67a';
    ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
  }
}
