// Story missions: six jobs for Marco, the fixer who runs Vice Shores' streets.
// Each mission has an objective, a waypoint, dialogue and a cash reward.
import * as THREE from 'three';
import { roadCentres, citySize } from './config.js';

export const STORY = {
  intro: 'Marco: "Selamat datang di Vice Shores, anak baru. Kerjakan tugasku, dan kota ini jadi milikmu."',
  outro: 'Marco: "Kau sudah membuktikan dirimu. Vice Shores sekarang menghormati namamu."',
};

function waypointOnRoad(rng) {
  const centres = roadCentres();
  const c = centres[Math.floor(rng() * centres.length)];
  const half = citySize() / 2;
  const along = (rng() * 2 - 1) * (half - 14);
  if (rng() < 0.5) return { x: c, z: along };
  return { x: along, z: c };
}

export class Missions {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.index = 0;            // current mission (0..5), 6 = story complete
    this.state = 'idle';       // idle | active | done
    this.target = null;        // {x, z} waypoint
    this.timer = 0;            // mission countdown, 0 = no limit
    this.collected = 0;
    this.needed = 0;
    this.chaseTarget = null;   // traffic car to stop
    this.collectibles = [];
    this.onEvent = null;       // (type, data) -> game
    this.marker = this.makeMarker();
    scene.add(this.marker);
    this.marker.visible = false;
  }

  makeMarker() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 30, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.28, side: THREE.DoubleSide })
    );
    beam.position.y = 15;
    g.add(beam);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.25, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23e })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    g.add(ring);
    return g;
  }

  definitions() {
    return [
      {
        title: 'Misi 1 — Paket Pertama',
        brief: 'Ambil paket di titik kuning dan bawa ke Marco. Jangan menarik perhatian polisi.',
        dialog: 'Marco: "Ada paket di ujung jalan. Ambil, jangan dibuka, jangan ditanya."',
      },
      {
        title: 'Misi 2 — Antar Kilat',
        brief: 'Antar paket ke tempat penjemputan sebelum waktu habis. Mengemudi cepat membantu.',
        dialog: 'Marco: "Klien menunggu. Kau punya 90 detik. Mobil lebih cepat dari kaki."',
        time: 90,
      },
      {
        title: 'Misi 3 — Kejar Target',
        brief: 'Kejar mobil target dan tabrak sampai berhenti, atau tembak pengemudinya.',
        dialog: 'Marco: "Si pengkhianat kabur dengan mobil merah. Hentikan dia, dengan cara apa pun."',
      },
      {
        title: 'Misi 4 — Kabur dari Polisi',
        brief: 'Kau diburu! Bertahan 60 detik tanpa tertangkap, lalu kehilangan polisi.',
        dialog: 'Marco: "Polisi mengepungmu! Kabur, sembunyi, bertahan 60 detik!"',
        time: 60,
        wanted: 3,
      },
      {
        title: 'Misi 5 — Koin Jalanan',
        brief: 'Kumpulkan 5 paket uang yang tersebar di kota. Ikuti penanda kuning.',
        dialog: 'Marco: "Lima paket uang tersebar di kota. Kumpulkan semuanya, jangan sampai ketahuan."',
        count: 5,
      },
      {
        title: 'Misi 6 — Perampokan Terakhir',
        brief: 'Masuk ke bank, ambil uangnya, lalu kabur ke safehouse dengan polisi mengejarmu.',
        dialog: 'Marco: "Satu pekerjaan besar terakhir. Bank, uang, lalu kabur. Kau siap?"',
        wanted: 4,
      },
    ];
  }

  current() {
    const defs = this.definitions();
    return this.index < defs.length ? defs[this.index] : null;
  }

  start() {
    const def = this.current();
    if (!def) return;
    this.state = 'active';
    this.collected = 0;
    this.needed = def.count || 0;
    this.timer = def.time || 0;
    this.target = waypointOnRoad(this.rng);
    this.marker.position.set(this.target.x, 0, this.target.z);
    this.marker.visible = true;
    if (def.wanted && this.onEvent) this.onEvent('set-wanted', def.wanted);
    if (this.index === 4) this.spawnCollectibles();
    if (this.index === 2 && this.onEvent) this.onEvent('spawn-chase-target', null);
    if (this.onEvent) this.onEvent('dialog', def.dialog);
    if (this.onEvent) this.onEvent('mission-start', def);
  }

  fail(reason) {
    if (this.state !== 'active') return;
    this.state = 'idle';
    this.marker.visible = false;
    this.clearCollectibles();
    if (this.onEvent) this.onEvent('mission-fail', reason);
  }

  complete(reward) {
    if (this.state !== 'active') return;
    this.state = 'idle';
    this.marker.visible = false;
    this.clearCollectibles();
    const done = this.current();
    this.index += 1;
    if (this.onEvent) this.onEvent('mission-done', { reward, title: done.title });
    if (this.index >= this.definitions().length && this.onEvent) {
      this.onEvent('story-done', STORY.outro);
    }
  }

  spawnCollectibles() {
    this.clearCollectibles();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0x7dff9a });
    for (let i = 0; i < this.needed; i++) {
      const p = waypointOnRoad(this.rng);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(p.x, 0.7, p.z);
      this.scene.add(m);
      this.collectibles.push(m);
    }
    if (this.collectibles.length > 0) {
      this.target = {
        x: this.collectibles[0].position.x,
        z: this.collectibles[0].position.z,
      };
      this.marker.position.set(this.target.x, 0, this.target.z);
    }
  }

  clearCollectibles() {
    for (const m of this.collectibles) this.scene.remove(m);
    this.collectibles = [];
  }

  // Called every frame while a mission is active.
  update(dt, game) {
    if (this.state !== 'active') return;
    const def = this.current();
    if (!def) return;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.index === 3) { this.complete(600); return; } // survived the heat
        this.fail('Waktu habis!');
        return;
      }
    }
    const px = game.player.x, pz = game.player.z;
    if (this.marker) this.marker.rotation.y += dt * 1.5;

    if (this.index === 2 && this.chaseTarget) {
      const t = this.chaseTarget.mesh.position;
      this.target = { x: t.x, z: t.z };
      this.marker.position.set(t.x, 0, t.z);
      const d = Math.hypot(px - t.x, pz - t.z);
      const stopped = Math.abs(this.chaseTarget.speed) < 0.5 && d < 6;
      if (stopped || game.chaseTargetDown) this.complete(450);
      return;
    }
    if (this.index === 4) {
      for (let i = this.collectibles.length - 1; i >= 0; i--) {
        const c = this.collectibles[i];
        c.rotation.y += dt * 2;
        if (Math.hypot(px - c.position.x, pz - c.position.z) < 2.5) {
          this.scene.remove(c);
          this.collectibles.splice(i, 1);
          this.collected += 1;
          game.addCash(50);
          if (this.onEvent) this.onEvent('pickup', this.collected);
          if (this.collectibles.length > 0) {
            const n = this.collectibles[0];
            this.target = { x: n.position.x, z: n.position.z };
            this.marker.position.set(n.position.x, 0, n.position.z);
          }
        }
      }
      if (this.collectibles.length === 0) this.complete(500);
      return;
    }
    if (!this.target) return;
    const d = Math.hypot(px - this.target.x, pz - this.target.z);
    if (d < 4) {
      if (this.index === 0) {
        // Picked up the package: now deliver it somewhere else.
        this.target = waypointOnRoad(this.rng);
        this.marker.position.set(this.target.x, 0, this.target.z);
        this.collected = 1;
        if (this.onEvent) this.onEvent('dialog', 'Marco: "Bagus. Sekarang antar ke tempat penjemputan."');
      } else if (this.index === 5) {
        if (this.collected === 0) {
          this.collected = 1;
          game.addCash(800);
          if (this.onEvent) this.onEvent('dialog', 'Marco: "Uang didapat! Sekarang kabur ke safehouse!"');
          this.target = { x: 0, z: -40 };
          this.marker.position.set(0, 0, -40);
          game.setWanted(4);
        } else {
          this.complete(1200);
        }
      } else {
        const rewards = [150, 300, 600];
        const r = rewards[this.index] || 300;
        this.complete(r);
      }
    }
  }
}
