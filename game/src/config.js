// Vice Shores: shared constants for the open world.
// The city is a grid of blocks separated by roads. All units are metres.
export const CITY = {
  blocks: 7,          // blocks per side
  block: 44,          // block size
  road: 14,           // road width
  sidewalk: 3,        // sidewalk strip around each block
};

export function citySize() {
  const n = CITY.blocks;
  return n * CITY.block + (n + 1) * CITY.road;
}

// Road centre lines, in world coordinates (city centred on 0,0).
export function roadCentres() {
  const out = [];
  const half = citySize() / 2;
  for (let i = 0; i <= CITY.blocks; i++) {
    out.push(-half + CITY.road / 2 + i * (CITY.block + CITY.road));
  }
  return out;
}

export function clampToCity(x, z) {
  const half = citySize() / 2 - 4;
  return {
    x: Math.max(-half, Math.min(half, x)),
    z: Math.max(-half, Math.min(half, z)),
  };
}

export function nearestRoadCoord(v) {
  const centres = roadCentres();
  let best = centres[0];
  for (const c of centres) {
    if (Math.abs(c - v) < Math.abs(best - v)) best = c;
  }
  return best;
}

// Is this point on a road (not inside a block)?
export function onRoad(x, z) {
  const centres = roadCentres();
  const halfRoad = CITY.road / 2 + 0.5;
  const onX = centres.some((c) => Math.abs(x - c) < halfRoad);
  const onZ = centres.some((c) => Math.abs(z - c) < halfRoad);
  return onX || onZ;
}

export const PLAYER = {
  walkSpeed: 6,
  runSpeed: 10,
  radius: 0.6,
  maxHealth: 100,
};

export const CAR = {
  accel: 16,
  brake: 30,
  maxSpeed: 34,
  reverseMax: 10,
  turn: 1.9,
};

export const WANTED = {
  decaySeconds: 45,   // seconds without crime to drop one star
  max: 5,
};

export const MISSION_REWARDS = [150, 300, 450, 600, 500, 1200];

export const COLORS = {
  sky: 0x87bfe8,
  sun: 0xfff2cc,
  ground: 0x3a3f46,
  road: 0x2b2e33,
  sidewalk: 0x8d9299,
  building: [0xd8a06a, 0x9fb4c7, 0xc7b299, 0x8fa3b8, 0xe0c090, 0xb98a7a, 0x7fa88f, 0xd9d3c3],
  car: [0xc0392b, 0x2471a3, 0xf1c40f, 0x7d3c98, 0x1e8449, 0xe67e22, 0x95a5a6, 0x2c3e50, 0xecf0f1],
  police: 0x1a2a44,
  taxi: 0xf7dc1e,
};

// Deterministic-ish random helper (seeded by the game seed).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
