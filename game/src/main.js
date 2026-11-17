// Vice Shores — main game loop: scene, camera, wanted system, police,
// crimes, collisions, missions, HUD, save/load and screenshot staging.
import * as THREE from 'three';
import { CITY, PLAYER, WANTED, roadCentres, citySize, mulberry32 } from './config.js';
import { City } from './city.js';
import { Traffic, makeCarMesh } from './vehicles.js';
import { Pedestrians } from './peds.js';
import { Player } from './player.js';
import { Missions, STORY } from './missions.js';
import { HUD } from './hud.js';
import { SoundEngine } from './audio.js';
import { Input } from './input.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { shotFromUrl, applyShot } from './shots.js';

const SEED = 20261117;

export class Game {
  constructor() {
    this.state = 'menu';   // menu | playing | paused | wasted | busted
    this.wanted = 0;
    this.wantedTimer = 0;
    this.crimeCooldown = 0;
    this.clockMinutes = 8 * 60;
    this.playTime = 0;
    this.chaseTargetDown = false;
    this.bustedTimer = 0;
    this.saveTimer = 0;
    this.shot = shotFromUrl();
    this.rng = mulberry32(SEED);
    this.sound = new SoundEngine();
    this.hud = new HUD();
    this.setupScene();
    this.city = new City(this.scene, SEED);
    this.traffic = new Traffic(this.scene, this.rng, this.city);
    this.peds = new Pedestrians(this.scene, this.rng, this.city);
    this.player = new Player(this.scene, this.city, this.sound);
    this.missions = new Missions(this.scene, this.rng);
    this.missions.onEvent = (type, data) => this.onMissionEvent(type, data);
    this.input = new Input(this.renderer.domElement);
    this.input.onAction = (code) => this.onAction(code);
    this.wireMenus();
    this.animate = this.animate.bind(this);
    this.lastTime = performance.now();
    requestAnimationFrame(this.animate);
    if (this.shot) {
      // Staged screenshots render the world behind the title screen too.
      applyShot(this.shot, this);
    } else {
      this.showMenu();
    }
    window.__gameReady = true;
  }

  setupScene() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.className = 'webgl';
    document.getElementById('app').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87bfe8);
    this.scene.fog = new THREE.Fog(0x9fc6e8, 120, 420);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
    const sun = new THREE.DirectionalLight(0xfff2cc, 2.2);
    sun.position.set(80, 140, 40);
    this.scene.add(sun);
    this.scene.add(new THREE.AmbientLight(0x8899bb, 0.9));
    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x54452e, 0.7);
    this.scene.add(hemi);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  wireMenus() {
    const $ = (id) => document.getElementById(id);
    $('btnNew').addEventListener('click', () => { this.sound.ensure(); this.newGame(); });
    $('btnContinue').addEventListener('click', () => { this.sound.ensure(); this.continueGame(); });
    $('btnResume').addEventListener('click', () => this.resume());
    $('btnSaveQuit').addEventListener('click', () => { this.doSave(); this.showMenu(); });
    $('btnRetry').addEventListener('click', () => { this.sound.ensure(); this.retryAfterDeath(); });
    if (!hasSave()) $('btnContinue').style.opacity = '0.4';
  }

  showMenu() {
    this.state = 'menu';
    document.getElementById('menu').classList.remove('hidden');
    document.getElementById('pause').classList.add('hidden');
    document.getElementById('wasted').classList.add('hidden');
    this.hud.hide();
    this.sound.engine(0, false);
    this.sound.siren(false);
    // Slow cinematic orbit behind the menu.
    this.player.reset(0, 60);
  }

  startPlay(fresh) {
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('pause').classList.add('hidden');
    document.getElementById('wasted').classList.add('hidden');
    this.state = 'playing';
    this.hud.show();
    this.sound.ensure();
    if (fresh) this.hud.showDialog(STORY.intro, 7);
  }

  newGame() {
    clearSave();
    this.player.money = 0;
    this.player.ammo = 24;
    this.player.reset(0, 20);
    this.setWanted(0);
    this.clockMinutes = 8 * 60;
    this.missions.index = 0;
    this.missions.state = 'idle';
    this.startPlay(true);
    this.missions.start();
    this.refreshObjective();
  }

  continueGame() {
    const data = loadGame();
    if (!data) { this.newGame(); return; }
    this.player.money = data.money || 0;
    this.player.ammo = data.ammo ?? 24;
    this.player.health = data.health ?? 100;
    this.player.reset(data.x || 0, data.z || 20);
    this.setWanted(data.wanted || 0);
    this.clockMinutes = data.clockMinutes || 8 * 60;
    this.missions.index = Math.min(data.mission || 0, 5);
    this.startPlay(false);
    this.missions.start();
    this.refreshObjective();
  }

  retryAfterDeath() {
    this.player.health = PLAYER.maxHealth;
    this.player.reset(0, 20);
    this.setWanted(0);
    this.startPlay(false);
    this.refreshObjective();
    if (this.missions.state !== 'active') this.missions.start();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    document.getElementById('pause').classList.remove('hidden');
    this.sound.engine(0, false);
    this.sound.siren(false);
    this.doSave();
  }

  resume() {
    if (this.state !== 'paused') return;
    document.getElementById('pause').classList.add('hidden');
    this.state = 'playing';
    this.sound.ensure();
  }

  endScreen(kind, text) {
    this.state = kind; // 'wasted' or 'busted'
    document.getElementById('wastedTitle').textContent = kind === 'wasted' ? 'WASTED' : 'BUSTED';
    document.getElementById('wastedText').textContent = text;
    document.getElementById('wasted').classList.remove('hidden');
    this.hud.hide();
    this.sound.engine(0, false);
    this.sound.siren(false);
    this.sound.busted();
    if (this.player.inCar) this.player.exitCar();
    this.player.money = Math.max(0, this.player.money - 100);
    this.doSave();
  }

  onAction(code) {
    if (code === 'KeyM') {
      this.sound.ensure();
      this.sound.setMuted(!this.sound.muted);
      this.hud.toast(this.sound.muted ? 'Suara mati' : 'Suara hidup', 1.5);
      return;
    }
    if (this.state === 'menu') return;
    if (code === 'KeyP' || code === 'Escape') {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
      return;
    }
    if (this.state !== 'playing') return;
    if (code === 'KeyE') this.tryEnterExitCar();
    if (code === 'KeyF') this.doPunch();
    if (code === 'KeyH') this.sound.horn();
  }

  tryEnterExitCar() {
    if (this.player.inCar) { this.player.exitCar(); return; }
    const p = this.player;
    const parked = this.traffic.nearestParked(p.x, p.z, 4.5);
    if (parked) { this.stealCar(parked, true); return; }
    const moving = this.traffic.nearestTraffic(p.x, p.z, 4.5);
    if (moving) {
      this.traffic.removeTrafficCar(moving);
      this.player.enterCar({ mesh: moving.mesh, stolen: true });
      this.addWanted(1);
      this.hud.toast('Mobil dicuri! Polisi waspada.', 2.5);
    }
  }

  stealCar(parked, quiet) {
    parked.stolen = true;
    this.player.enterCar(parked);
    if (!quiet) this.addWanted(1);
    if (!quiet) this.hud.toast('Mobil dicuri! Polisi waspada.', 2.5);
    this.sound.horn();
  }

  doPunch() {
    if (this.player.inCar) return;
    const hit = this.player.punch(this.peds);
    if (hit === 'ped') { this.addWanted(1); this.hud.toast('Kekerasan di jalanan!', 2); }
    if (hit === 'cop') { this.addWanted(1); this.player.health -= 0; }
  }

  doShoot() {
    if (this.player.inCar) return;
    const hit = this.player.shoot(this.peds, this.traffic);
    if (hit === 'cop' || hit === 'ped') this.addWanted(2);
  }

  addCash(n) {
    this.player.money += n;
    this.sound.cash();
  }

  addWanted(n) {
    if (this.wanted >= 5) return;
    this.setWanted(Math.min(5, this.wanted + n));
    this.wantedTimer = 0;
  }

  setWanted(n) {
    this.wanted = Math.max(0, Math.min(5, n));
    this.wantedTimer = 0;
    this.hud.setWanted(this.wanted);
    this.spawnPoliceForWanted();
    this.sound.siren(this.wanted >= 2);
  }

  spawnPoliceForWanted() {
    const wantCars = this.wanted;
    while (this.traffic.police.length < wantCars) {
      const a = this.rng() * Math.PI * 2;
      const x = this.player.x + Math.cos(a) * 45;
      const z = this.player.z + Math.sin(a) * 45;
      this.traffic.spawnPolice(x, z);
    }
    while (this.traffic.police.length > wantCars) {
      const cop = this.traffic.police.pop();
      this.scene.remove(cop.mesh);
    }
    const wantCops = this.wanted >= 2 ? this.wanted - 1 : 0;
    while (this.peds.cops.length < wantCops) {
      const a = this.rng() * Math.PI * 2;
      this.peds.spawnCop(this.player.x + Math.cos(a) * 20, this.player.z + Math.sin(a) * 20);
    }
    while (this.peds.cops.length > wantCops) {
      const cop = this.peds.cops.pop();
      this.scene.remove(cop.mesh);
    }
  }

  refreshObjective() {
    const def = this.missions.current();
    if (!def) {
      this.hud.setObjective('Cerita selesai! Jelajahi kota dengan bebas. Uang: $' + this.player.money);
      return;
    }
    let text = '<b>' + def.title + '</b><br>' + def.brief;
    if (this.missions.timer > 0) text += '<br>Waktu: ' + Math.ceil(this.missions.timer) + ' dtk';
    if (def.count) text += '<br>Dikumpulkan: ' + this.missions.collected + '/' + def.count;
    this.hud.setObjective(text);
  }

  onMissionEvent(type, data) {
    if (type === 'dialog') this.hud.showDialog(data, 6);
    if (type === 'mission-start') { this.refreshObjective(); this.sound.mission(); }
    if (type === 'mission-done') {
      this.addCash(data.reward);
      this.hud.toast(data.title + ' selesai! +$' + data.reward, 3);
      this.sound.mission();
      setTimeout(() => {
        if (this.state === 'playing' && this.missions.current()) {
          this.missions.start();
          this.refreshObjective();
        }
      }, 2500);
    }
    if (type === 'mission-fail') {
      this.hud.toast('Misi gagal: ' + data + ' Coba lagi.', 3);
      setTimeout(() => {
        if (this.state === 'playing') { this.missions.start(); this.refreshObjective(); }
      }, 2000);
    }
    if (type === 'story-done') {
      this.hud.showDialog(data, 8);
      this.hud.toast('CERITA SELESAI — Vice Shores milikmu!', 5);
      this.refreshObjective();
    }
    if (type === 'set-wanted') this.setWanted(data);
    if (type === 'pickup') { this.sound.pickup(); this.refreshObjective(); }
    if (type === 'spawn-chase-target') {
      const cars = this.traffic.cars;
      if (cars.length > 0) {
        const t = cars[Math.floor(this.rng() * cars.length)];
        t.mesh.children[0].material = t.mesh.children[0].material.clone();
        t.mesh.children[0].material.color.setHex(0xc0392b);
        t.speed = 16;
        this.missions.chaseTarget = t;
        this.missions.target = { x: t.mesh.position.x, z: t.mesh.position.z };
        this.hud.toast('Target: mobil merah. Tabrak sampai berhenti!', 3);
      }
    }
  }

  doSave() {
    saveGame({
      money: this.player.money,
      ammo: this.player.ammo,
      health: this.player.health,
      x: this.player.x,
      z: this.player.z,
      wanted: this.wanted,
      clockMinutes: this.clockMinutes,
      mission: this.missions.index,
      savedAt: Date.now(),
    });
  }

  update(dt) {
    this.playTime += dt;
    this.clockMinutes += dt * 0.6; // 1 detik nyata = ~0.6 menit game
    if (this.clockMinutes >= 24 * 60) this.clockMinutes -= 24 * 60;
    if (this.crimeCooldown > 0) this.crimeCooldown -= dt;

    const axes = this.shotCruise && this.player.inCar
      ? { f: 1, s: 0 } : this.input.moveAxes();
    const mouse = this.input.consumeMouse();
    this.player.camYaw -= mouse.dx * 0.0032;
    this.player.camPitch = Math.max(0.06, Math.min(1.1, this.player.camPitch + mouse.dy * 0.0022));

    if (this.input.consumeClick()) this.doShoot();

    const running = this.input.down('ShiftLeft') || this.input.down('ShiftRight');
    let hitWall = false;
    if (this.player.inCar) {
      hitWall = this.player.drive(dt, axes, this.input.down('Space'));
      // Camera follows the car's heading.
      const targetYaw = this.player.heading + Math.PI;
      let diff = targetYaw - this.player.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.player.camYaw += diff * Math.min(1, dt * 2.2);
    } else {
      this.player.walk(dt, axes, running);
    }
    // Keep the player inside the city.
    const half = citySize() / 2 - 3;
    this.player.pos.x = Math.max(-half, Math.min(half, this.player.pos.x));
    this.player.pos.z = Math.max(-half, Math.min(half, this.player.pos.z));
    if (this.player.inCar) {
      this.player.inCar.mesh.position.x = this.player.pos.x;
      this.player.inCar.mesh.position.z = this.player.pos.z;
    }

    // Crash into traffic while driving fast: damage + wanted.
    if (this.player.inCar) {
      for (const c of this.traffic.cars) {
        const d = Math.hypot(c.mesh.position.x - this.player.pos.x, c.mesh.position.z - this.player.pos.z);
        if (d < 4.2 && Math.abs(this.player.carSpeed) > 9) {
          if (this.crimeCooldown <= 0) {
            this.crimeCooldown = 3;
            this.addWanted(1);
            this.hud.toast('Tabrakan! Polisi melihatmu.', 2);
            this.sound.noise(0.25, 0.4, 700);
          }
          this.player.carSpeed *= 0.35;
          c.speed *= 0.4;
        }
      }
      // Ramming the chase target stops it.
      const t = this.missions.chaseTarget;
      if (t && this.missions.index === 2 && this.missions.state === 'active') {
        const d = Math.hypot(t.mesh.position.x - this.player.pos.x, t.mesh.position.z - this.player.pos.z);
        if (d < 4.5 && Math.abs(this.player.carSpeed) > 10) {
          t.speed = 0;
          this.chaseTargetDown = true;
        }
      }
    }

    this.traffic.update(dt, this.player.pos, this.wanted);
    this.peds.update(dt, this.player.pos, this.wanted);
    this.missions.update(dt, this);
    this.refreshObjectiveThrottled(dt);

    // Wanted decay when quiet.
    if (this.wanted > 0) {
      this.wantedTimer += dt;
      if (this.wantedTimer > WANTED.decaySeconds) this.setWanted(this.wanted - 1);
    }

    // Police catch the player.
    if (this.wanted > 0) {
      if (!this.player.inCar) {
        for (const c of this.peds.cops) {
          const d = Math.hypot(c.mesh.position.x - this.player.x, c.mesh.position.z - this.player.z);
          if (d < 2.2) { this.endScreen('busted', 'Polisi menangkapmu di jalanan. Uang denda $100.'); return; }
        }
        for (const p of this.traffic.police) {
          const d = Math.hypot(p.mesh.position.x - this.player.x, p.mesh.position.z - this.player.z);
          if (d < 2.6) { this.endScreen('busted', 'Mobil patroli menangkapmu. Uang denda $100.'); return; }
        }
      } else {
        for (const p of this.traffic.police) {
          const d = Math.hypot(p.mesh.position.x - this.player.x, p.mesh.position.z - this.player.z);
          if (d < 3.6) {
            this.player.carSpeed *= Math.max(0, 1 - dt * 1.5);
            this.player.health -= 6 * dt;
            if (this.player.health <= 0) {
              this.endScreen('wasted', 'Mobilmu dihancurkan polisi dalam kejar-kejaran.');
              return;
            }
          }
        }
      }
    }

    // Health regen slowly when safe.
    if (this.wanted === 0 && this.player.health < PLAYER.maxHealth) {
      this.player.health = Math.min(PLAYER.maxHealth, this.player.health + 2 * dt);
    }
    if (this.player.health <= 0 && this.state === 'playing') {
      this.endScreen('wasted', 'Kau kehabisan nyawa di jalanan Vice Shores.');
      return;
    }

    // Autosave.
    this.saveTimer += dt;
    if (this.saveTimer > 10) { this.saveTimer = 0; this.doSave(); }

    // HUD.
    const hour = Math.floor(this.clockMinutes / 60);
    const minute = Math.floor(this.clockMinutes % 60);
    this.hud.setMoney(this.player.money);
    this.hud.setHealth(this.player.health, PLAYER.maxHealth);
    this.hud.setClock(hour, minute);
    this.hud.setSpeed(Math.abs(this.player.carSpeed || 0) * 3.6, !!this.player.inCar);
    this.hud.setAmmo(this.player.ammo, !!this.player.inCar);
    this.hud.drawMinimap({
      roadCentres: roadCentres(),
      target: this.missions.state === 'active' ? this.missions.target : null,
      traffic: this.traffic.cars.map((c) => ({ x: c.mesh.position.x, z: c.mesh.position.z })),
      police: this.traffic.police.map((p) => ({ x: p.mesh.position.x, z: p.mesh.position.z })),
      player: {
        x: this.player.x, z: this.player.z,
        headingX: Math.sin(this.player.heading), headingZ: Math.cos(this.player.heading),
      },
    });
  }

  refreshObjectiveThrottled(dt) {
    this._objTimer = (this._objTimer || 0) + dt;
    if (this._objTimer > 0.5) { this._objTimer = 0; this.refreshObjective(); }
  }

  updateCamera(dt) {
    const p = this.player;
    const yaw = p.camYaw, pitch = p.camPitch;
    const dist = p.inCar ? 11 : 8;
    const height = p.inCar ? 4.2 : 3.2;
    const cx = p.x + Math.sin(yaw) * Math.cos(pitch) * dist;
    const cz = p.z + Math.cos(yaw) * Math.cos(pitch) * dist;
    const cy = height + Math.sin(pitch) * dist * 0.6;
    // Menu orbit: slow cinematic pan.
    if (this.state === 'menu') {
      const t = performance.now() / 9000;
      this.camera.position.set(Math.sin(t) * 90, 42, Math.cos(t) * 90);
      this.camera.lookAt(0, 8, 0);
      return;
    }
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(p.x, 1.6, p.z);
  }

  animate() {
    requestAnimationFrame(this.animate);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.state === 'playing') this.update(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }
}

new Game();
