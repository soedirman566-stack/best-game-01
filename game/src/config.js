// EMBERFALL — tuning constants, palette and upgrade definitions.
// Everything the balance hangs off lives here so the other modules stay logic-only.

export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;
export const ARENA = { x: 28, y: 64, w: VIEW_WIDTH - 56, h: VIEW_HEIGHT - 108 };
export const FIXED_STEP = 1 / 120;

export const PALETTE = {
  void: '#0b0908',
  charcoal: '#16100d',
  panel: 'rgba(16, 11, 9, 0.88)',
  ember: '#ff7a26',
  emberHot: '#ffb347',
  emberDeep: '#c33d0e',
  gold: '#ffd166',
  teal: '#2fd4c4',
  tealDeep: '#147d74',
  violet: '#b388ff',
  rust: '#e5484d',
  bone: '#f5ead9',
  ash: '#9a8b7a',
  shard: '#ffc46b',
};

export const PLAYER_BASE = {
  radius: 14,
  speed: 262,
  maxHp: 100,
  damage: 11,
  fireRate: 3.4, // bolts per second
  projectiles: 1,
  pierce: 0,
  magnet: 78,
  dashCooldown: 2.3,
  dashTime: 0.16,
  dashSpeed: 940,
  blades: 0,
  chain: 0,
};

export const ENEMY_KINDS = {
  drifter: { radius: 13, hp: 18, speed: 70, damage: 8, xp: 1, score: 10, colour: '#2fd4c4' },
  darter: { radius: 10, hp: 12, speed: 132, damage: 6, xp: 1, score: 15, colour: '#b388ff' },
  splitter: { radius: 16, hp: 27, speed: 54, damage: 8, xp: 2, score: 20, colour: '#ffd166' },
  spark: { radius: 7, hp: 6, speed: 158, damage: 5, xp: 1, score: 5, colour: '#ffe9a8' },
  bulwark: { radius: 25, hp: 95, speed: 33, damage: 16, xp: 3, score: 30, colour: '#e5484d' },
  boss: { radius: 52, hp: 950, speed: 27, damage: 22, xp: 25, score: 500, colour: '#ff5a1f' },
};

export function xpForLevel(level) {
  return 5 + (level - 1) * 4;
}

export function waveBudget(wave) {
  return 7 + wave * 4;
}

// The level-up pool. apply() mutates the player's derived stats through the
// world's recompute; max stacks keep late-game choices meaningful.
export const UPGRADES = [
  {
    id: 'damage', name: 'Ember Core', glyph: '◆', max: 6,
    blurb: '+25% bolt damage',
    apply: (s) => { s.damageMul += 0.25; },
  },
  {
    id: 'rate', name: 'Rapid Cycle', glyph: '»', max: 6,
    blurb: '+18% fire rate',
    apply: (s) => { s.rateMul += 0.18; },
  },
  {
    id: 'multi', name: 'Split Shot', glyph: '⋔', max: 3,
    blurb: '+1 bolt per volley',
    apply: (s) => { s.projectiles += 1; },
  },
  {
    id: 'pierce', name: 'Piercing Bolts', glyph: '➤', max: 3,
    blurb: 'Bolts pierce +1 husk',
    apply: (s) => { s.pierce += 1; },
  },
  {
    id: 'blades', name: 'Orbit Blade', glyph: '✦', max: 3,
    blurb: '+1 orbiting blade',
    apply: (s) => { s.blades += 1; },
  },
  {
    id: 'chain', name: 'Chain Spark', glyph: 'ϟ', max: 3,
    blurb: 'Bolts arc to +1 nearby foe',
    apply: (s) => { s.chain += 1; },
  },
  {
    id: 'magnet', name: 'Ember Magnet', glyph: '◎', max: 3,
    blurb: '+55% shard pull radius',
    apply: (s) => { s.magnetMul += 0.55; },
  },
  {
    id: 'dash', name: 'Swift Ash', glyph: '↯', max: 3,
    blurb: '-22% dash cooldown',
    apply: (s) => { s.dashMul *= 0.78; },
  },
  {
    id: 'stride', name: 'Ashen Stride', glyph: '➶', max: 4,
    blurb: '+9% move speed',
    apply: (s) => { s.speedMul += 0.09; },
  },
  {
    id: 'vitality', name: 'Vital Flame', glyph: '♥', max: 99,
    blurb: '+25 max health, mend 30',
    apply: (s) => { s.maxHpBonus += 25; s.heal += 30; },
  },
];

export const FALLBACK_UPGRADE = {
  id: 'secondwind', name: 'Second Wind', glyph: '✚', max: 99,
  blurb: 'Mend 50 health now',
  apply: (s) => { s.heal += 50; },
};
