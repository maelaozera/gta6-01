// The player: on-foot third-person movement, arcade driving, stealing cars,
// punching and shooting.
import * as THREE from 'three';
import { PLAYER, CAR } from './config.js';
import { makePedMesh as makePed } from './peds.js';

export class Player {
  constructor(scene, city, sound) {
    this.scene = scene;
    this.city = city;
    this.sound = sound;
    this.mesh = makePed(0x2ecc71, 0xf1c27d, false);
    this.mesh.visible = true;
    scene.add(this.mesh);
    this.pos = new THREE.Vector3(0, 0, 20);
    this.heading = 0;        // facing angle, radians
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.health = PLAYER.maxHealth;
    this.money = 0;
    this.ammo = 24;
    this.inCar = null;       // the stolen/driven car object, or null
    this.carSpeed = 0;
    this.carColor = 0xc0392b;
    this.mesh.position.copy(this.pos);
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  reset(x, z) {
    this.pos.set(x, 0, z);
    this.heading = 0;
    this.health = PLAYER.maxHealth;
    if (this.inCar) this.exitCar();
    this.mesh.position.copy(this.pos);
    this.mesh.visible = true;
  }

  enterCar(carObj) {
    this.inCar = carObj;
    this.carSpeed = 0;
    this.mesh.visible = false;
    this.sound.engine(0, true);
  }

  exitCar() {
    if (!this.inCar) return;
    const m = this.inCar.mesh;
    const side = new THREE.Vector3(Math.cos(m.rotation.y), 0, -Math.sin(m.rotation.y));
    this.pos.set(m.position.x + side.x * 2.2, 0, m.position.z + side.z * 2.2);
    const fixed = this.city.resolveMove(m.position.x, m.position.z, this.pos.x, this.pos.z, 0.6);
    this.pos.x = fixed.x; this.pos.z = fixed.z;
    this.inCar = null;
    this.carSpeed = 0;
    this.mesh.visible = true;
    this.mesh.position.copy(this.pos);
    this.sound.engine(0, false);
  }

  // On-foot step. Returns true when a wall blocked the move.
  walk(dt, axes, running) {
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    const fx = -sin, fz = -cos;         // camera forward on the ground
    const sx = -cos, sz = sin;          // camera right
    const mx = fx * axes.f + sx * axes.s;
    const mz = fz * axes.f + sz * axes.s;
    const len = Math.hypot(mx, mz);
    if (len < 0.01) return;
    const nx = this.pos.x + (mx / len) * speed * dt;
    const nz = this.pos.z + (mz / len) * speed * dt;
    const fixed = this.city.resolveMove(this.pos.x, this.pos.z, nx, nz, PLAYER.radius);
    this.pos.x = fixed.x; this.pos.z = fixed.z;
    this.heading = Math.atan2(mx, mz);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    // Walk bob.
    const t = performance.now() / 140;
    this.mesh.userData.torso.position.y = 1.15 + Math.abs(Math.sin(t)) * 0.05;
  }

  // Arcade driving. axes.f: W/S throttle, axes.s: A/D steering.
  drive(dt, axes, handbrake) {
    const car = this.inCar;
    if (!car) return;
    const m = car.mesh;
    if (axes.f > 0) this.carSpeed += CAR.accel * dt;
    else if (axes.f < 0) {
      this.carSpeed -= (this.carSpeed > 0.5 ? CAR.brake : CAR.accel * 0.6) * dt;
    } else {
      this.carSpeed -= Math.sign(this.carSpeed) * 8 * dt;
      if (Math.abs(this.carSpeed) < 0.4) this.carSpeed = 0;
    }
    if (handbrake) this.carSpeed *= Math.max(0, 1 - dt * 4);
    this.carSpeed = Math.max(-CAR.reverseMax, Math.min(CAR.maxSpeed, this.carSpeed));
    const steer = axes.s * CAR.turn * dt * (this.carSpeed >= 0 ? 1 : -1)
      * Math.min(1, Math.abs(this.carSpeed) / 8);
    m.rotation.y += steer * (this.carSpeed >= 0 ? 1 : -1) * -1;
    // Note: forward is +Z in the car mesh's local frame, so heading uses sin/cos.
    const nx = m.position.x + Math.sin(m.rotation.y) * this.carSpeed * dt;
    const nz = m.position.z + Math.cos(m.rotation.y) * this.carSpeed * dt;
    let hitWall = false;
    if (this.city.collides(nx, nz, 2.2)) {
      hitWall = true;
      this.carSpeed *= 0.4;
    } else {
      m.position.x = nx; m.position.z = nz;
    }
    this.pos.set(m.position.x, 0, m.position.z);
    this.heading = m.rotation.y;
    // Wheel spin.
    for (const w of m.userData.wheels || []) w.rotation.x += this.carSpeed * dt * 1.4;
    this.sound.engine(Math.abs(this.carSpeed) / CAR.maxSpeed, true);
    return hitWall;
  }

  // Punch: hits the nearest pedestrian within 2.2 m in front.
  punch(peds) {
    this.sound.punch();
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let best = null, bd = 2.4;
    for (const p of peds.peds) {
      const dx = p.mesh.position.x - this.pos.x;
      const dz = p.mesh.position.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < bd && (dx * fx + dz * fz) / (d || 1) > 0.2) { bd = d; best = p; }
    }
    if (best) {
      peds.removePed(best);
      return 'ped';
    }
    // Punching a cop is a crime too, and hurts.
    for (const c of peds.cops) {
      const d = Math.hypot(c.mesh.position.x - this.pos.x, c.mesh.position.z - this.pos.z);
      if (d < 2.4) { this.health -= 8; return 'cop'; }
    }
    return null;
  }

  // Shoot: hits the nearest cop or ped roughly in the camera's aim.
  shoot(peds, traffic) {
    if (this.ammo <= 0) { this.sound.click(); return null; }
    this.ammo -= 1;
    this.sound.shoot();
    const fx = -Math.sin(this.camYaw), fz = -Math.cos(this.camYaw);
    const candidates = [];
    for (const c of peds.cops) candidates.push({ mesh: c.mesh, kind: 'cop', obj: c });
    for (const p of peds.peds) candidates.push({ mesh: p.mesh, kind: 'ped', obj: p });
    let best = null, bd = 40;
    for (const c of candidates) {
      const dx = c.mesh.position.x - this.pos.x;
      const dz = c.mesh.position.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 40 || d < 0.5) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot > 0.94 && d < bd) { bd = d; best = c; }
    }
    if (!best) return 'miss';
    if (best.kind === 'cop') {
      const i = peds.cops.indexOf(best.obj);
      if (i >= 0) peds.cops.splice(i, 1);
      this.scene.remove(best.mesh);
      return 'cop';
    }
    peds.removePed(best.obj);
    return 'ped';
  }
}
