// Pedestrians: walkers on the sidewalks, a fleeing target, and foot police.
import * as THREE from 'three';
import { citySize, onRoad, mulberry32 } from './config.js';

const SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0x34495e];
const SKINS = [0xf1c27d, 0xe0ac69, 0x8d5524, 0xffdbac, 0xc68642];

export function makePedMesh(shirt, skin, isCop) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: isCop ? 0x1a2a44 : shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const pantsMat = new THREE.MeshLambertMaterial({ color: isCop ? 0x101418 : 0x2c3e50 });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.28), pantsMat);
  legs.position.y = 0.4;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), shirtMat);
  torso.position.y = 1.15;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), skinMat);
  head.position.y = 1.72;
  g.add(head);
  if (isCop) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10),
      new THREE.MeshLambertMaterial({ color: 0x0e1626 }));
    cap.position.y = 1.92;
    g.add(cap);
  } else {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8, 0, Math.PI * 2, 0, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x2a1a0e }));
    hair.position.y = 1.76;
    g.add(hair);
  }
  g.userData.torso = torso;
  return g;
}

function randomSidewalkPoint(rng) {
  const half = citySize() / 2;
  for (let tries = 0; tries < 20; tries++) {
    const x = (rng() * 2 - 1) * (half - 6);
    const z = (rng() * 2 - 1) * (half - 6);
    if (!onRoad(x, z)) return { x, z };
  }
  return { x: 0, z: 0 };
}

export class Pedestrians {
  constructor(scene, rng, city) {
    this.scene = scene;
    this.rng = rng;
    this.city = city;
    this.peds = [];
    this.cops = [];
    this.spawnPeds(26);
  }

  spawnPeds(n) {
    for (let i = 0; i < n; i++) {
      const p = randomSidewalkPoint(this.rng);
      const mesh = makePedMesh(
        SHIRTS[Math.floor(this.rng() * SHIRTS.length)],
        SKINS[Math.floor(this.rng() * SKINS.length)],
        false
      );
      mesh.position.set(p.x, 0, p.z);
      this.scene.add(mesh);
      this.peds.push({
        mesh, speed: 1 + this.rng() * 1.2,
        dir: this.rng() * Math.PI * 2,
        changeIn: 2 + this.rng() * 4,
        fleeing: false,
      });
    }
  }

  spawnCop(x, z) {
    const mesh = makePedMesh(0, SKINS[Math.floor(this.rng() * SKINS.length)], true);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const cop = { mesh, speed: 6.5 };
    this.cops.push(cop);
    return cop;
  }

  // A pedestrian near (x,z) that can be punched / shot, or null.
  nearestPed(x, z, maxDist) {
    let best = null, bd = maxDist;
    for (const p of this.peds) {
      const d = Math.hypot(p.mesh.position.x - x, p.mesh.position.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  removePed(ped) {
    const i = this.peds.indexOf(ped);
    if (i >= 0) this.peds.splice(i, 1);
    this.scene.remove(ped.mesh);
  }

  update(dt, playerPos, wanted) {
    const half = citySize() / 2;
    for (const p of this.peds) {
      const m = p.mesh;
      p.changeIn -= dt;
      const playerDist = Math.hypot(playerPos.x - m.position.x, playerPos.z - m.position.z);
      if (wanted >= 3 && playerDist < 18) p.fleeing = true;
      if (p.fleeing) {
        const dx = m.position.x - playerPos.x;
        const dz = m.position.z - playerPos.z;
        const d = Math.hypot(dx, dz) || 1;
        p.dir = Math.atan2(dx, dz);
        p.speed = 5;
      } else if (p.changeIn <= 0) {
        p.dir = this.rng() * Math.PI * 2;
        p.changeIn = 3 + this.rng() * 5;
        p.speed = 1 + this.rng() * 1.2;
      }
      const nx = m.position.x + Math.sin(p.dir) * p.speed * dt;
      const nz = m.position.z + Math.cos(p.dir) * p.speed * dt;
      if (Math.abs(nx) < half && Math.abs(nz) < half && !this.city.collides(nx, nz, 0.5)) {
        m.position.x = nx; m.position.z = nz;
      } else {
        p.dir += Math.PI / 2;
      }
      m.rotation.y = p.dir;
      m.userData.torso.position.y = 1.15 + Math.abs(Math.sin(performance.now() / 160 + p.dir)) * 0.06;
    }
    // Foot police chase the player on foot.
    for (const c of this.cops) {
      const m = c.mesh;
      const dx = playerPos.x - m.position.x;
      const dz = playerPos.z - m.position.z;
      const d = Math.hypot(dx, dz) || 1;
      m.rotation.y = Math.atan2(dx, dz);
      const nx = m.position.x + (dx / d) * c.speed * dt;
      const nz = m.position.z + (dz / d) * c.speed * dt;
      if (!this.city.collides(nx, nz, 0.5)) { m.position.x = nx; m.position.z = nz; }
    }
  }
}
