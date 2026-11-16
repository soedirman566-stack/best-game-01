// EMBERFALL — the simulation. World owns every entity and rule: the wisp, the
// husk swarm, bolts, shards, particles, waves and the boss. It advances in
// fixed steps and knows nothing about pixels; render.js draws what it holds.

import {
  ARENA, ENEMY_KINDS, PLAYER_BASE, UPGRADES, FALLBACK_UPGRADE,
  waveBudget, xpForLevel,
} from './config.js';
import { sound } from './audio.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export function createPlayer() {
  const stats = {
    damageMul: 1, rateMul: 1, projectiles: PLAYER_BASE.projectiles,
    pierce: PLAYER_BASE.pierce, magnetMul: 1, dashMul: 1, speedMul: 1,
    maxHpBonus: 0, blades: PLAYER_BASE.blades, chain: PLAYER_BASE.chain, heal: 0,
  };
  return {
    x: ARENA.x + ARENA.w / 2, y: ARENA.y + ARENA.h / 2,
    vx: 0, vy: 0, r: PLAYER_BASE.radius,
    hp: PLAYER_BASE.maxHp, maxHp: PLAYER_BASE.maxHp,
    level: 1, xp: 0, xpNext: xpForLevel(1),
    aim: -Math.PI / 2, fireTimer: 0,
    dashTimer: 0, dashCd: 0, dashDirX: 1, dashDirY: 0,
    iframes: 0, hurtFlash: 0, moveMag: 0,
    stats, stacks: {},
  };
}

export class World {
  constructor(rng) {
    this.rng = rng;
    this.embers = [];
    for (let i = 0; i < 46; i++) {
      this.embers.push({
        x: ARENA.x + rng() * ARENA.w, y: ARENA.y + rng() * ARENA.h,
        s: 0.6 + rng() * 1.9, v: 4 + rng() * 11, drift: rng() * TAU,
      });
    }
    this.reset();
  }

  reset() {
    this.player = createPlayer();
    this.enemies = [];
    this.bolts = [];
    this.hostileBolts = [];
    this.shards = [];
    this.particles = [];
    this.texts = [];
    this.beams = [];
    this.wave = 0;
    this.phase = 'intermission';
    this.phaseTimer = 1.4;
    this.spawnLeft = 0;
    this.spawnTimer = 0;
    this.boss = null;
    this.score = 0;
    this.kills = 0;
    this.time = 0;
    this.shake = 0;
    this.hitStop = 0;
    this.pendingLevelUps = 0;
    this.playerDead = false;
    this.deathCause = '';
    this.pickupCombo = 0;
    this.comboTimer = 0;
    this.bladeAngle = 0;
    this.bannerText = '';
    this.bannerTimer = 0;
  }

  // ---- waves ------------------------------------------------------------

  startWave() {
    this.wave += 1;
    this.phase = 'combat';
    const isBoss = this.wave % 5 === 0;
    this.spawnLeft = isBoss ? 6 + this.wave : waveBudget(this.wave);
    this.spawnTimer = 0.4;
    this.bannerText = isBoss ? `WAVE ${this.wave} — THE PYRE HUSK STIRS` : `WAVE ${this.wave}`;
    this.bannerTimer = 2.2;
    if (isBoss) {
      this.spawnEnemy('boss', ARENA.x + ARENA.w / 2, ARENA.y + 92);
      sound.bossRoar();
    } else {
      sound.waveStart();
    }
  }

  spawnInterval() {
    return Math.max(0.3, 0.92 - this.wave * 0.05);
  }

  pickKind() {
    const w = this.wave;
    const roll = this.rng();
    if (w >= 4 && roll < 0.13) return 'bulwark';
    if (w >= 3 && roll < 0.30) return 'splitter';
    if (w >= 2 && roll < 0.52) return 'darter';
    return 'drifter';
  }

  spawnPoint() {
    for (let tries = 0; tries < 8; tries++) {
      const side = Math.floor(this.rng() * 4);
      let x, y;
      if (side === 0) { x = ARENA.x + this.rng() * ARENA.w; y = ARENA.y + 14; }
      else if (side === 1) { x = ARENA.x + this.rng() * ARENA.w; y = ARENA.y + ARENA.h - 14; }
      else if (side === 2) { x = ARENA.x + 14; y = ARENA.y + this.rng() * ARENA.h; }
      else { x = ARENA.x + ARENA.w - 14; y = ARENA.y + this.rng() * ARENA.h; }
      if (dist2(x, y, this.player.x, this.player.y) > 150 * 150) return { x, y };
    }
    return { x: ARENA.x + ARENA.w / 2, y: ARENA.y + 16 };
  }

  spawnEnemy(kind, x, y) {
    const base = ENEMY_KINDS[kind];
    const hpScale = 1 + (this.wave - 1) * 0.16;
    const e = {
      kind, x, y, vx: 0, vy: 0,
      r: base.radius,
      hp: Math.round(base.hp * (kind === 'boss' ? 1 + (this.wave / 5 - 1) * 0.7 : hpScale)),
      maxHp: 0, speed: base.speed * (0.9 + this.rng() * 0.2),
      damage: base.damage, xp: base.xp, score: base.score, colour: base.colour,
      flash: 0, touchCd: 0, bladeCd: 0, wobble: this.rng() * TAU,
      burstTimer: 2.4, summonTimer: 3.2, dead: false,
    };
    e.maxHp = e.hp;
    this.enemies.push(e);
    if (kind === 'boss') this.boss = e;
    return e;
  }

  // ---- upgrades -----------------------------------------------------------

  rollUpgradeChoices() {
    const open = UPGRADES.filter((u) => (this.player.stacks[u.id] || 0) < u.max);
    const picks = [];
    const pool = [...open];
    while (picks.length < 3 && pool.length > 0) {
      const i = Math.floor(this.rng() * pool.length);
      picks.push(pool.splice(i, 1)[0]);
    }
    while (picks.length < 3) picks.push(FALLBACK_UPGRADE);
    return picks;
  }

  applyUpgrade(u) {
    const p = this.player;
    p.stacks[u.id] = (p.stacks[u.id] || 0) + 1;
    const beforeMax = p.maxHp;
    u.apply(p.stats);
    p.maxHp = PLAYER_BASE.maxHp + p.stats.maxHpBonus;
    if (p.maxHp > beforeMax) p.hp += p.maxHp - beforeMax;
    if (p.stats.heal > 0) {
      p.hp = Math.min(p.maxHp, p.hp + p.stats.heal);
      p.stats.heal = 0;
    }
    this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);
    this.burst(p.x, p.y, 26, '#ffd166', 190, 0.5);
    sound.uiClick();
  }

  gainXp(amount) {
    const p = this.player;
    p.xp += amount;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.level += 1;
      p.xpNext = xpForLevel(p.level);
      this.pendingLevelUps += 1;
    }
  }

  // ---- effects ------------------------------------------------------------

  burst(x, y, n, colour, speed, life) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 420) return;
      const a = this.rng() * TAU;
      const v = speed * (0.25 + this.rng() * 0.75);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: life * (0.5 + this.rng() * 0.8), maxLife: life,
        size: 1.4 + this.rng() * 2.6, colour, drag: 3.2,
      });
    }
  }

  addText(x, y, text, colour, size = 13) {
    if (this.texts.length > 42) this.texts.shift();
    this.texts.push({ x, y, text, colour, size, life: 0.75, maxLife: 0.75 });
  }

  addShake(amount) {
    this.shake = Math.min(15, this.shake + amount);
  }

  // ---- combat ---------------------------------------------------------------

  damageEnemy(e, dmg, angle) {
    if (e.dead) return;
    e.hp -= dmg;
    e.flash = 0.09;
    e.vx += Math.cos(angle) * 46;
    e.vy += Math.sin(angle) * 46;
    this.addText(e.x + (this.rng() - 0.5) * 10, e.y - e.r - 4, String(Math.round(dmg)), '#ffd9a0', e.kind === 'boss' ? 15 : 12);
    sound.hit();
    if (e.hp <= 0) this.killEnemy(e);
  }

  killEnemy(e) {
    e.dead = true;
    this.kills += 1;
    this.score += e.score;
    this.burst(e.x, e.y, e.kind === 'boss' ? 70 : 12, e.colour, e.kind === 'boss' ? 300 : 170, 0.55);
    this.burst(e.x, e.y, 6, '#ffb347', 120, 0.4);
    sound.kill();
    if (e.kind === 'splitter') {
      for (let i = 0; i < 2; i++) {
        const s = this.spawnEnemy('spark', e.x + (this.rng() - 0.5) * 22, e.y + (this.rng() - 0.5) * 22);
        s.vx = (this.rng() - 0.5) * 220; s.vy = (this.rng() - 0.5) * 220;
      }
    }
    const shardValue = e.xp;
    for (let i = 0; i < shardValue; i++) {
      this.shards.push({
        x: e.x + (this.rng() - 0.5) * 26, y: e.y + (this.rng() - 0.5) * 26,
        vx: (this.rng() - 0.5) * 60, vy: (this.rng() - 0.5) * 60,
        value: 1, r: 5, pulled: false,
      });
    }
    if (e.kind === 'boss') {
      this.boss = null;
      this.score += 250;
      this.addShake(13);
      this.hitStop = 0.22;
      this.addText(e.x, e.y - 60, 'PYRE HUSK FELLED', '#ffd166', 22);
    }
  }

  damagePlayer(dmg, cause) {
    const p = this.player;
    if (p.iframes > 0 || this.playerDead) return;
    p.hp -= dmg;
    p.iframes = 0.45;
    p.hurtFlash = 0.25;
    this.addShake(6);
    this.hitStop = Math.max(this.hitStop, 0.05);
    this.burst(p.x, p.y, 14, '#e5484d', 200, 0.4);
    sound.hurt();
    if (p.hp <= 0) {
      p.hp = 0;
      this.playerDead = true;
      this.deathCause = cause;
      this.burst(p.x, p.y, 60, '#ff7a26', 280, 0.8);
      this.burst(p.x, p.y, 30, '#f5ead9', 160, 0.6);
      this.addShake(14);
    }
  }

  // ---- update ---------------------------------------------------------------

  update(dt, control) {
    this.time += dt;
    if (this.bannerTimer > 0) this.bannerTimer -= dt;
    if (this.hitStop > 0) this.hitStop -= dt;
    this.shake = Math.max(0, this.shake - dt * 34);
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.pickupCombo = 0; }

    for (const em of this.embers) {
      em.y -= em.v * dt;
      em.x += Math.sin(this.time * 0.6 + em.drift) * 5 * dt;
      if (em.y < ARENA.y - 6) { em.y = ARENA.y + ARENA.h + 6; em.x = ARENA.x + this.rng() * ARENA.w; }
    }

    this.updateWaves(dt);
    this.updatePlayer(dt, control);
    this.updateEnemies(dt);
    this.updateBolts(dt);
    this.updateShards(dt);
    this.updateFx(dt);
  }

  updateWaves(dt) {
    if (this.phase === 'intermission') {
      this.phaseTimer -= dt;
      if (this.phaseTimer <= 0 && !this.playerDead) this.startWave();
      return;
    }
    if (this.spawnLeft > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && this.enemies.length < 42) {
        this.spawnTimer = this.spawnInterval();
        this.spawnLeft -= 1;
        const pt = this.spawnPoint();
        this.spawnEnemy(this.pickKind(), pt.x, pt.y);
      }
    } else if (this.enemies.length === 0 && !this.playerDead) {
      this.score += 25 * this.wave;
      this.addText(this.player.x, this.player.y - 44, `WAVE ${this.wave} CLEAR  +${25 * this.wave}`, '#2fd4c4', 16);
      this.phase = 'intermission';
      this.phaseTimer = 2.4;
    }
  }

  updatePlayer(dt, control) {
    const p = this.player;
    if (this.playerDead) return;
    if (p.iframes > 0) p.iframes -= dt;
    if (p.hurtFlash > 0) p.hurtFlash -= dt;
    if (p.dashCd > 0) p.dashCd -= dt;

    let mx = control.x, my = control.y;
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }
    p.moveMag = Math.min(1, mag);

    if (control.dash && p.dashCd <= 0) {
      p.dashTimer = PLAYER_BASE.dashTime;
      p.dashCd = PLAYER_BASE.dashCooldown * p.stats.dashMul;
      p.dashDirX = mag > 0.1 ? mx : Math.cos(p.aim);
      p.dashDirY = mag > 0.1 ? my : Math.sin(p.aim);
      p.iframes = Math.max(p.iframes, PLAYER_BASE.dashTime + 0.05);
      sound.dash();
      this.burst(p.x, p.y, 10, '#2fd4c4', 90, 0.3);
    }

    const speed = PLAYER_BASE.speed * p.stats.speedMul;
    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      p.vx = p.dashDirX * PLAYER_BASE.dashSpeed;
      p.vy = p.dashDirY * PLAYER_BASE.dashSpeed;
      if (this.particles.length < 420) {
        this.particles.push({
          x: p.x, y: p.y, vx: 0, vy: 0, life: 0.28, maxLife: 0.28,
          size: p.r * 0.9, colour: '#2fd4c4', drag: 0,
        });
      }
    } else {
      const accel = 2400;
      p.vx += mx * accel * dt;
      p.vy += my * accel * dt;
      const damp = Math.exp(-9 * dt);
      if (mag < 0.1) { p.vx *= damp; p.vy *= damp; }
      const v = Math.hypot(p.vx, p.vy);
      if (v > speed) { p.vx = (p.vx / v) * speed; p.vy = (p.vy / v) * speed; }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.x = Math.max(ARENA.x + p.r, Math.min(ARENA.x + ARENA.w - p.r, p.x));
    p.y = Math.max(ARENA.y + p.r, Math.min(ARENA.y + ARENA.h - p.r, p.y));

    // Aim + auto-fire at the nearest husk.
    let target = null, best = 560 * 560;
    for (const e of this.enemies) {
      const d = dist2(p.x, p.y, e.x, e.y);
      if (d < best) { best = d; target = e; }
    }
    if (target) p.aim = Math.atan2(target.y - p.y, target.x - p.x);
    else if (mag > 0.1) p.aim = Math.atan2(my, mx);

    p.fireTimer -= dt;
    if (target && p.fireTimer <= 0) {
      p.fireTimer = 1 / (PLAYER_BASE.fireRate * p.stats.rateMul);
      const n = p.stats.projectiles;
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 0.085;
        const a = p.aim + spread;
        this.bolts.push({
          x: p.x + Math.cos(p.aim) * (p.r + 4), y: p.y + Math.sin(p.aim) * (p.r + 4),
          vx: Math.cos(a) * 640, vy: Math.sin(a) * 640,
          dmg: PLAYER_BASE.damage * p.stats.damageMul,
          pierce: p.stats.pierce, life: 0.95, hitSet: null,
        });
      }
      sound.shoot();
    }

    // Orbit blades.
    if (p.stats.blades > 0) {
      this.bladeAngle += dt * 2.7;
      for (const e of this.enemies) {
        if (e.bladeCd > 0) continue;
        for (let i = 0; i < p.stats.blades; i++) {
          const a = this.bladeAngle + (i * TAU) / p.stats.blades;
          const bx = p.x + Math.cos(a) * 62, by = p.y + Math.sin(a) * 62;
          if (dist2(bx, by, e.x, e.y) < (e.r + 13) * (e.r + 13)) {
            e.bladeCd = 0.38;
            this.damageEnemy(e, 14 * p.stats.damageMul, a);
            break;
          }
        }
      }
    }
  }

  updateEnemies(dt) {
    const p = this.player;
    for (const e of this.enemies) {
      if (e.flash > 0) e.flash -= dt;
      if (e.touchCd > 0) e.touchCd -= dt;
      if (e.bladeCd > 0) e.bladeCd -= dt;
      const dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let mx = dx / d, my = dy / d;
      if (e.kind === 'darter') {
        const s = Math.sin(this.time * 5 + e.wobble) * 0.75;
        const px = -my * s, py = mx * s;
        mx += px; my += py;
        const m = Math.hypot(mx, my) || 1; mx /= m; my /= m;
      }
      const enraged = e.kind === 'boss' && e.hp < e.maxHp * 0.35;
      const sp = e.speed * (enraged ? 1.5 : 1);
      e.vx += (mx * sp - e.vx) * Math.min(1, dt * 3.2);
      e.vy += (my * sp - e.vy) * Math.min(1, dt * 3.2);
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.x = Math.max(ARENA.x + e.r, Math.min(ARENA.x + ARENA.w - e.r, e.x));
      e.y = Math.max(ARENA.y + e.r, Math.min(ARENA.y + ARENA.h - e.r, e.y));

      if (e.kind === 'boss' && !this.playerDead) {
        e.burstTimer -= dt * (enraged ? 1.5 : 1);
        if (e.burstTimer <= 0) {
          e.burstTimer = 2.6;
          const n = 14;
          const off = this.rng() * TAU;
          for (let i = 0; i < n; i++) {
            const a = off + (i * TAU) / n;
            this.hostileBolts.push({ x: e.x, y: e.y, vx: Math.cos(a) * 168, vy: Math.sin(a) * 168, r: 6, life: 3.4 });
          }
          sound.bossRoar();
        }
        e.summonTimer -= dt;
        if (e.summonTimer <= 0 && this.enemies.length < 40) {
          e.summonTimer = 4.2;
          this.spawnEnemy('drifter', e.x - 60, e.y + 40);
          this.spawnEnemy('drifter', e.x + 60, e.y - 40);
        }
      }

      if (!this.playerDead && e.touchCd <= 0 && p.iframes <= 0 &&
          dist2(e.x, e.y, p.x, p.y) < (e.r + p.r - 2) * (e.r + p.r - 2)) {
        e.touchCd = 0.7;
        this.damagePlayer(e.damage, e.kind === 'boss' ? 'Felled by the Pyre Husk' : `Felled by a ${e.kind}`);
      }
    }
    // Separation so the swarm reads as bodies, not a blob.
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        const rr = a.r + b.r;
        const d2 = dist2(a.x, a.y, b.x, b.y);
        if (d2 > 0.01 && d2 < rr * rr) {
          const d = Math.sqrt(d2);
          const push = ((rr - d) / d) * 0.5 * 26 * dt;
          const ux = (b.x - a.x), uy = (b.y - a.y);
          a.x -= ux * push; a.y -= uy * push;
          b.x += ux * push; b.y += uy * push;
        }
      }
    }
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  updateBolts(dt) {
    const p = this.player;
    for (const b of this.bolts) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (b.hitSet && b.hitSet.has(e)) continue;
        if (dist2(b.x, b.y, e.x, e.y) < (e.r + 5) * (e.r + 5)) {
          if (!b.hitSet) b.hitSet = new Set();
          b.hitSet.add(e);
          const angle = Math.atan2(b.vy, b.vx);
          this.damageEnemy(e, b.dmg, angle);
          // Chain spark: arc a share of the hit to nearby untouched foes.
          let arcs = p.stats.chain;
          let from = e;
          const hitByChain = new Set([e]);
          while (arcs > 0) {
            let near = null, nd = 150 * 150;
            for (const o of this.enemies) {
              if (o.dead || hitByChain.has(o)) continue;
              const dd = dist2(from.x, from.y, o.x, o.y);
              if (dd < nd) { nd = dd; near = o; }
            }
            if (!near) break;
            this.beams.push({ x1: from.x, y1: from.y, x2: near.x, y2: near.y, life: 0.13, maxLife: 0.13 });
            hitByChain.add(near);
            this.damageEnemy(near, b.dmg * 0.55, angle);
            from = near;
            arcs -= 1;
          }
          if (b.pierce > 0) { b.pierce -= 1; } else { b.life = 0; }
          break;
        }
      }
    }
    this.bolts = this.bolts.filter((b) => b.life > 0 &&
      b.x > ARENA.x - 30 && b.x < ARENA.x + ARENA.w + 30 &&
      b.y > ARENA.y - 30 && b.y < ARENA.y + ARENA.h + 30);

    for (const hb of this.hostileBolts) {
      hb.x += hb.vx * dt;
      hb.y += hb.vy * dt;
      hb.life -= dt;
      if (!this.playerDead && p.iframes <= 0 &&
          dist2(hb.x, hb.y, p.x, p.y) < (hb.r + p.r - 3) * (hb.r + p.r - 3)) {
        hb.life = 0;
        this.damagePlayer(12, 'Felled by the Pyre Husk');
      }
    }
    this.hostileBolts = this.hostileBolts.filter((hb) => hb.life > 0 &&
      hb.x > ARENA.x - 40 && hb.x < ARENA.x + ARENA.w + 40 &&
      hb.y > ARENA.y - 40 && hb.y < ARENA.y + ARENA.h + 40);
  }

  updateShards(dt) {
    const p = this.player;
    const magnetR = PLAYER_BASE.magnet * p.stats.magnetMul;
    for (const s of this.shards) {
      const d2 = dist2(s.x, s.y, p.x, p.y);
      if (!this.playerDead && d2 < magnetR * magnetR) {
        const d = Math.sqrt(d2) || 1;
        const pull = 560 * (1 - d / (magnetR * 1.6));
        s.vx += ((p.x - s.x) / d) * pull * dt * 6;
        s.vy += ((p.y - s.y) / d) * pull * dt * 6;
        s.pulled = true;
      }
      const damp = Math.exp(-4 * dt);
      s.vx *= damp; s.vy *= damp;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (!this.playerDead && d2 < 24 * 24) {
        s.taken = true;
        this.pickupCombo += 1;
        this.comboTimer = 1.1;
        this.gainXp(s.value);
        sound.pickup(this.pickupCombo);
      }
    }
    this.shards = this.shards.filter((s) => !s.taken);
  }

  updateFx(dt) {
    for (const pt of this.particles) {
      pt.life -= dt;
      const damp = Math.exp(-pt.drag * dt);
      pt.vx *= damp; pt.vy *= damp;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= 34 * dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const bm of this.beams) bm.life -= dt;
    this.beams = this.beams.filter((bm) => bm.life > 0);
  }
}

// Deterministic pilot used by the menu attract scene and staged screenshots:
// chase shards, kite the swarm, dash out of a crowd.
export function autopilotControl(world) {
  const p = world.player;
  let tx = ARENA.x + ARENA.w / 2, ty = ARENA.y + ARENA.h / 2;
  let bestShard = null, bd = 340 * 340;
  for (const s of world.shards) {
    const d = dist2(p.x, p.y, s.x, s.y);
    if (d < bd) { bd = d; bestShard = s; }
  }
  if (bestShard) { tx = bestShard.x; ty = bestShard.y; }
  let fx = 0, fy = 0, crowd = 0;
  for (const e of world.enemies) {
    const d2 = dist2(p.x, p.y, e.x, e.y);
    if (d2 < 110 * 110) {
      const d = Math.sqrt(d2) || 1;
      fx += ((p.x - e.x) / d) * (1 - d / 110) * 2.2;
      fy += ((p.y - e.y) / d) * (1 - d / 110) * 2.2;
      crowd += 1;
    }
  }
  let mx = (tx - p.x) / 120 + fx;
  let my = (ty - p.y) / 120 + fy;
  const m = Math.hypot(mx, my);
  if (m > 1) { mx /= m; my /= m; }
  return { x: mx, y: my, dash: crowd >= 2 && p.dashCd <= 0 };
}
