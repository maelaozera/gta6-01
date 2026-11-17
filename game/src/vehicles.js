// Vehicles: car meshes, traffic AI that follows the road grid, parked cars,
// and police cruisers that chase the player.
import * as THREE from 'three';
import { CITY, citySize, roadCentres, onRoad, COLORS } from './config.js';

export function makeCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x182430 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 4.2), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.0), glassMat);
  cabin.position.set(0, 1.15, -0.2);
  g.add(cabin);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10), wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w);
    wheels.push(w);
  }
  // Headlights and taillights.
  const head = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  for (const wx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), head);
    h.position.set(wx, 0.6, 2.12);
    g.add(h);
  }
  const tail = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const wx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tail);
    t.position.set(wx, 0.6, -2.12);
    g.add(t);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar.position.set(0, 1.6, -0.2);
    g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar2.position.set(0, 1.6, -0.2);
    bar2.position.z = -0.2;
    g.add(bar2);
    g.userData.lightBar = bar;
  }
  g.userData.wheels = wheels;
  return g;
}

function randomRoadPoint(rng) {
  const centres = roadCentres();
  const c = centres[Math.floor(rng() * centres.length)];
  const half = citySize() / 2;
  const along = (rng() * 2 - 1) * (half - 8);
  if (rng() < 0.5) return { x: c + (rng() < 0.5 ? 3 : -3), z: along, axis: 'z' };
  return { x: along, z: c + (rng() < 0.5 ? 3 : -3), axis: 'x' };
}

export class Traffic {
  constructor(scene, rng, city) {
    this.scene = scene;
    this.rng = rng;
    this.city = city;
    this.cars = [];       // moving traffic
    this.parked = [];     // stealable parked cars
    this.police = [];     // police cruisers
    this.spawnTraffic(14);
    this.spawnParked(10);
  }

  spawnTraffic(n) {
    for (let i = 0; i < n; i++) {
      const p = randomRoadPoint(this.rng);
      const color = COLORS.car[Math.floor(this.rng() * COLORS.car.length)];
      const mesh = makeCarMesh(color, false);
      mesh.position.set(p.x, 0, p.z);
      const dir = this.rng() < 0.5 ? 1 : -1;
      mesh.rotation.y = p.axis === 'z' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      this.scene.add(mesh);
      this.cars.push({
        mesh, axis: p.axis, dir,
        speed: 7 + this.rng() * 5,
        baseSpeed: 7 + this.rng() * 5,
      });
    }
  }

  spawnParked(n) {
    for (let i = 0; i < n; i++) {
      const p = randomRoadPoint(this.rng);
      const color = COLORS.car[Math.floor(this.rng() * COLORS.car.length)];
      const mesh = makeCarMesh(color, false);
      mesh.position.set(p.x, 0, p.z);
      mesh.rotation.y = p.axis === 'z' ? 0 : Math.PI / 2;
      this.scene.add(mesh);
      this.parked.push({ mesh, stolen: false, color });
    }
  }

  // A parked car near (x,z) the player can steal, or null.
  nearestParked(x, z, maxDist) {
    let best = null, bd = maxDist;
    for (const p of this.parked) {
      if (p.stolen) continue;
      const d = Math.hypot(p.mesh.position.x - x, p.mesh.position.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // A moving traffic car near (x,z) the player can steal, or null.
  nearestTraffic(x, z, maxDist) {
    let best = null, bd = maxDist;
    for (const c of this.cars) {
      const d = Math.hypot(c.mesh.position.x - x, c.mesh.position.z - z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  removeTrafficCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    this.scene.remove(car.mesh);
  }

  spawnPolice(x, z) {
    const mesh = makeCarMesh(COLORS.police, true);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const cop = { mesh, speed: 0, maxSpeed: 26 };
    this.police.push(cop);
    return cop;
  }

  update(dt, playerPos, wanted) {
    const half = citySize() / 2;
    // Traffic: drive straight along the road, turn at random intersections.
    for (const c of this.cars) {
      const m = c.mesh;
      const step = c.speed * c.dir * dt;
      if (c.axis === 'z') {
        m.position.z += step;
        if (Math.abs(m.position.z) > half - 6) { c.dir *= -1; m.rotation.y += Math.PI; }
        if (this.rng() < dt * 0.15) this.turnCar(c);
      } else {
        m.position.x += step;
        if (Math.abs(m.position.x) > half - 6) { c.dir *= -1; m.rotation.y += Math.PI; }
        if (this.rng() < dt * 0.15) this.turnCar(c);
      }
    }
    // Police: steer toward the player, faster with more stars.
    for (const p of this.police) {
      const m = p.mesh;
      const dx = playerPos.x - m.position.x;
      const dz = playerPos.z - m.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      const target = Math.atan2(dx, dz);
      let diff = target - m.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      m.rotation.y += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      const targetSpeed = Math.min(p.maxSpeed, 14 + wanted * 3.5);
      p.speed += (targetSpeed - p.speed) * Math.min(1, dt * 1.2);
      m.position.x += Math.sin(m.rotation.y) * p.speed * dt;
      m.position.z += Math.cos(m.rotation.y) * p.speed * dt;
      if (m.userData.lightBar) {
        m.userData.lightBar.material.color.setHex(
          Math.floor(performance.now() / 350) % 2 === 0 ? 0xff2222 : 0x2244ff);
      }
    }
  }

  turnCar(c) {
    const m = c.mesh;
    const centres = roadCentres();
    const near = (v) => centres.some((cc) => Math.abs(cc - v) < 4);
    if (c.axis === 'z' && near(m.position.z)) {
      c.axis = 'x';
      c.dir = this.rng() < 0.5 ? 1 : -1;
      m.rotation.y = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      m.position.z = centres.reduce((a, b) => Math.abs(b - m.position.z) < Math.abs(a - m.position.z) ? b : a);
    } else if (c.axis === 'x' && near(m.position.x)) {
      c.axis = 'z';
      c.dir = this.rng() < 0.5 ? 1 : -1;
      m.rotation.y = c.dir > 0 ? 0 : Math.PI;
      m.position.x = centres.reduce((a, b) => Math.abs(b - m.position.x) < Math.abs(a - m.position.x) ? b : a);
    }
  }
}
