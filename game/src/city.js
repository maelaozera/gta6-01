// Procedural city: roads, sidewalks, buildings with lit windows, lamps, trees,
// benches, traffic lights and the beachfront that gives Vice Shores its name.
import * as THREE from 'three';
import { CITY, citySize, roadCentres, mulberry32, COLORS } from './config.js';

function facadeTexture(baseColor, litRatio, rng) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 256);
  const cols = 5, rows = 12;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? '#ffe9a8' : 'rgba(20,28,44,0.85)';
      g.fillRect(8 + x * 24, 10 + y * 20, 15, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBuildingMaterial(rng) {
  const palette = COLORS.building;
  const color = palette[Math.floor(rng() * palette.length)];
  const hex = '#' + color.toString(16).padStart(6, '0');
  const tex = facadeTexture(hex, 0.35 + rng() * 0.3, rng);
  return new THREE.MeshLambertMaterial({ map: tex });
}

export class City {
  constructor(scene, seed) {
    this.group = new THREE.Group();
    this.scene = scene;
    this.rng = mulberry32(seed);
    this.buildings = [];   // {x, z, w, d, h} for collision
    this.lamps = [];
    this.build();
    scene.add(this.group);
  }

  build() {
    const rng = this.rng;
    const size = citySize();
    const half = size / 2;

    // Ground + beach strip on the south edge.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size + 160, size + 160),
      new THREE.MeshLambertMaterial({ color: 0x4a7d5a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    this.group.add(ground);

    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(size + 160, 26),
      new THREE.MeshLambertMaterial({ color: 0xe8d29a })
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(0, 0, half + 13);
    this.group.add(sand);

    const sea = new THREE.Mesh(
      new THREE.PlaneGeometry(size + 160, 120),
      new THREE.MeshLambertMaterial({ color: 0x2e7fa8 })
    );
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -0.08, half + 26 + 60);
    this.group.add(sea);

    // Roads: one dark plane per road line, plus centre dashes.
    const centres = roadCentres();
    const roadMat = new THREE.MeshLambertMaterial({ color: COLORS.road });
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c95a });
    for (const c of centres) {
      const h = new THREE.Mesh(new THREE.PlaneGeometry(size, CITY.road), roadMat);
      h.rotation.x = -Math.PI / 2; h.position.set(0, 0.01, c);
      this.group.add(h);
      const v = new THREE.Mesh(new THREE.PlaneGeometry(CITY.road, size), roadMat);
      v.rotation.x = -Math.PI / 2; v.position.set(c, 0.01, 0);
      this.group.add(v);
      for (let d = -half + 6; d < half; d += 12) {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.5), dashMat);
        dash.rotation.x = -Math.PI / 2; dash.position.set(d, 0.02, c);
        this.group.add(dash);
        const dash2 = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 4), dashMat);
        dash2.rotation.x = -Math.PI / 2; dash2.position.set(c, 0.02, d);
        this.group.add(dash2);
      }
    }

    // Sidewalks around every block.
    const walkMat = new THREE.MeshLambertMaterial({ color: COLORS.sidewalk });
    const blockSpan = CITY.block + CITY.sidewalk * 2;
    for (let bx = 0; bx < CITY.blocks; bx++) {
      for (let bz = 0; bz < CITY.blocks; bz++) {
        const cx = -half + CITY.road + CITY.block / 2 + bx * (CITY.block + CITY.road);
        const cz = -half + CITY.road + CITY.block / 2 + bz * (CITY.block + CITY.road);
        const walk = new THREE.Mesh(new THREE.PlaneGeometry(blockSpan, blockSpan), walkMat);
        walk.rotation.x = -Math.PI / 2;
        walk.position.set(cx, 0.02, cz);
        this.group.add(walk);
        this.buildBlock(cx, cz, bx, bz);
      }
    }

    this.buildProps();
  }

  buildBlock(cx, cz, bx, bz) {
    const rng = this.rng;
    const isDowntown = Math.abs(bx - 3) <= 1 && Math.abs(bz - 3) <= 1;
    const count = isDowntown ? 1 : (rng() < 0.5 ? 2 : 1);
    const spots = count === 1
      ? [{ dx: 0, dz: 0, w: 30, d: 30 }]
      : [{ dx: -9, dz: 0, w: 15, d: 26 }, { dx: 9, dz: 0, w: 15, d: 26 }];
    for (const s of spots) {
      const h = isDowntown ? 28 + rng() * 55 : 8 + rng() * 20;
      const mat = makeBuildingMaterial(rng);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.w, h, s.d), mat);
      mesh.position.set(cx + s.dx, h / 2, cz + s.dz);
      this.group.add(mesh);
      // Roof trim so towers read at a distance.
      const roof = new THREE.Mesh(
        new THREE.BoxGeometry(s.w + 1, 1, s.d + 1),
        new THREE.MeshLambertMaterial({ color: 0x333a44 })
      );
      roof.position.set(cx + s.dx, h + 0.5, cz + s.dz);
      this.group.add(roof);
      this.buildings.push({ x: cx + s.dx, z: cz + s.dz, w: s.w, d: s.d, h });
      // A few rooftop beacons downtown.
      if (h > 55 && rng() < 0.6) {
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(0.9, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff4444 })
        );
        beacon.position.set(cx + s.dx, h + 2, cz + s.dz);
        this.group.add(beacon);
      }
    }
  }

  buildProps() {
    const rng = this.rng;
    const size = citySize();
    const half = size / 2;
    const centres = roadCentres();
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2f36 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });

    // Street lamps at intersections.
    for (const cx of centres) {
      for (const cz of centres) {
        if (rng() < 0.4) continue;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), poleMat);
        pole.position.set(cx + CITY.road / 2 + 1, 3.5, cz + CITY.road / 2 + 1);
        this.group.add(pole);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), lampMat);
        lamp.position.set(cx + CITY.road / 2 + 1, 7.2, cz + CITY.road / 2 + 1);
        this.group.add(lamp);
        this.lamps.push(lamp.position.clone());
      }
    }

    // Palm trees along the beachfront and a few inland.
    for (let x = -half + 8; x < half; x += 14) {
      this.palm(x, half - 2, trunkMat, leafMat);
      if (rng() < 0.3) this.palm(x + 5, -half + 8, trunkMat, leafMat);
    }
    // Benches and hydrants scattered on sidewalks.
    const benchMat = new THREE.MeshLambertMaterial({ color: 0x8a5a2b });
    for (let i = 0; i < 40; i++) {
      const x = (rng() * 2 - 1) * (half - 10);
      const z = (rng() * 2 - 1) * (half - 10);
      const bench = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.8), benchMat);
      bench.position.set(x, 0.4, z);
      bench.rotation.y = rng() * Math.PI;
      this.group.add(bench);
    }
  }

  palm(x, z, trunkMat, leafMat) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 6), trunkMat);
    trunk.position.set(x, 3.5, z);
    trunk.rotation.z = 0.12;
    this.group.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.4, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(x + Math.cos(a) * 1.2, 7.4, z + Math.sin(a) * 1.2);
      leaf.rotation.z = Math.cos(a) * 0.9;
      leaf.rotation.x = -Math.sin(a) * 0.9;
      this.group.add(leaf);
    }
  }

  // Keep a circle out of building footprints (player, cars, peds).
  collides(x, z, radius) {
    for (const b of this.buildings) {
      if (Math.abs(x - b.x) < b.w / 2 + radius && Math.abs(z - b.z) < b.d / 2 + radius) return true;
    }
    return false;
  }

  // Slide along a building: try x-only then z-only movement.
  resolveMove(x, z, nx, nz, radius) {
    if (!this.collides(nx, nz, radius)) return { x: nx, z: nz };
    if (!this.collides(nx, z, radius)) return { x: nx, z };
    if (!this.collides(x, nz, radius)) return { x, z: nz };
    return { x, z };
  }
}
