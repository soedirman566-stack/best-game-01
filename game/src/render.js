// EMBERFALL — the renderer. Draws the world and every screen onto the canvas:
// arena, wisps and husks, bolts, shards, particles, HUD, and the menu /
// level-up / pause / game-over overlays. Glow comes from pre-rendered radial
// sprites so the frame stays cheap.

import { ARENA, PALETTE, VIEW_WIDTH, VIEW_HEIGHT } from './config.js';

const TAU = Math.PI * 2;

function makeGlowSprite(colour) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, colour);
  grad.addColorStop(0.35, colour + 'aa');
  grad.addColorStop(1, colour + '00');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

function polygon(ctx, x, y, r, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i * TAU) / sides;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sprites = new Map();
    this.floor = this.makeFloor();
  }

  glow(colour) {
    if (!this.sprites.has(colour)) this.sprites.set(colour, makeGlowSprite(colour));
    return this.sprites.get(colour);
  }

  drawGlow(x, y, size, colour, alpha = 1) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.glow(colour), x - size / 2, y - size / 2, size, size);
    ctx.restore();
  }

  makeFloor() {
    const c = document.createElement('canvas');
    c.width = ARENA.w; c.height = ARENA.h;
    const g = c.getContext('2d');
    g.fillStyle = '#171008';
    g.fillRect(0, 0, ARENA.w, ARENA.h);
    // Scorched stone: faint blotches and a cracked grid.
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * ARENA.w, y = Math.random() * ARENA.h;
      g.fillStyle = `rgba(${30 + Math.random() * 30}, ${20 + Math.random() * 14}, 10, 0.25)`;
      g.beginPath();
      g.ellipse(x, y, 8 + Math.random() * 42, 6 + Math.random() * 26, Math.random() * 3, 0, TAU);
      g.fill();
    }
    g.strokeStyle = 'rgba(255, 122, 38, 0.05)';
    g.lineWidth = 1;
    for (let x = 0; x <= ARENA.w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, ARENA.h); g.stroke(); }
    for (let y = 0; y <= ARENA.h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(ARENA.w, y); g.stroke(); }
    // A worn ember ring at the centre.
    g.strokeStyle = 'rgba(255, 179, 71, 0.10)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(ARENA.w / 2, ARENA.h / 2, 120, 0, TAU); g.stroke();
    g.beginPath(); g.arc(ARENA.w / 2, ARENA.h / 2, 96, 0, TAU); g.stroke();
    return c;
  }

  draw(world, ui) {
    const ctx = this.ctx;
    ctx.fillStyle = PALETTE.void;
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.save();
    if (world.shake > 0.2) {
      ctx.translate((Math.random() - 0.5) * world.shake, (Math.random() - 0.5) * world.shake);
    }
    this.drawArena(world);
    this.drawShards(world);
    this.drawEnemies(world);
    this.drawPlayer(world);
    this.drawBolts(world);
    this.drawBeams(world);
    this.drawParticles(world);
    this.drawTexts(world);
    ctx.restore();

    if (world.player.hp < world.player.maxHp * 0.3 && ui.state === 'playing') {
      const pulse = 0.16 + 0.1 * Math.sin(world.time * 6);
      const grad = ctx.createRadialGradient(640, 360, 260, 640, 360, 720);
      grad.addColorStop(0, 'rgba(229,72,77,0)');
      grad.addColorStop(1, `rgba(229,72,77,${pulse})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    }

    this.drawHud(world);
    if (world.bannerTimer > 0 && ui.state === 'playing') this.drawBanner(world);
    if (ui.state === 'menu') this.drawMenu(ui);
    else if (ui.state === 'levelup') this.drawLevelUp(world, ui);
    else if (ui.state === 'paused') this.drawPause();
    else if (ui.state === 'gameover') this.drawGameOver(world, ui);
  }

  drawArena(world) {
    const ctx = this.ctx;
    ctx.drawImage(this.floor, ARENA.x, ARENA.y);
    for (const em of world.embers) {
      this.drawGlow(em.x, em.y, 7 * em.s, PALETTE.ember, 0.35);
    }
    ctx.strokeStyle = 'rgba(255, 122, 38, 0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(ARENA.x, ARENA.y, ARENA.w, ARENA.h);
    ctx.strokeStyle = 'rgba(255, 179, 71, 0.16)';
    ctx.lineWidth = 6;
    ctx.strokeRect(ARENA.x - 3, ARENA.y - 3, ARENA.w + 6, ARENA.h + 6);
  }

  drawShards(world) {
    const ctx = this.ctx;
    for (const s of world.shards) {
      const bob = Math.sin(world.time * 5 + s.x) * 2;
      this.drawGlow(s.x, s.y + bob, 26, PALETTE.shard, 0.7);
      ctx.save();
      ctx.translate(s.x, s.y + bob);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = PALETTE.shard;
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
  }

  drawEnemies(world) {
    const ctx = this.ctx;
    for (const e of world.enemies) {
      this.drawGlow(e.x, e.y, e.r * 3.4, e.colour, 0.4);
      ctx.save();
      ctx.translate(e.x, e.y);
      const rot = e.kind === 'splitter' || e.kind === 'boss'
        ? world.time * 0.9 + e.wobble
        : Math.atan2(e.vy, e.vx) + Math.PI / 2;
      ctx.rotate(rot);
      const sides = { drifter: 3, darter: 4, splitter: 4, spark: 4, bulwark: 6, boss: 6 }[e.kind];
      polygon(ctx, 0, 0, e.r, sides, 0);
      ctx.fillStyle = '#1d130c';
      ctx.fill();
      ctx.strokeStyle = e.colour;
      ctx.lineWidth = e.kind === 'boss' ? 4 : 2.4;
      ctx.stroke();
      polygon(ctx, 0, 0, e.r * 0.55, sides, 0.4);
      ctx.strokeStyle = e.colour + '88';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      if (e.flash > 0) {
        polygon(ctx, 0, 0, e.r, sides, 0);
        ctx.fillStyle = `rgba(255,255,255,${(e.flash / 0.09) * 0.75})`;
        ctx.fill();
      }
      ctx.restore();
      if (e.kind === 'boss') {
        // Rotating shield shards around the Pyre Husk.
        for (let i = 0; i < 5; i++) {
          const a = world.time * 0.7 + (i * TAU) / 5;
          const sx = e.x + Math.cos(a) * (e.r + 20), sy = e.y + Math.sin(a) * (e.r + 20);
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(a + Math.PI / 4);
          ctx.fillStyle = PALETTE.emberDeep;
          ctx.fillRect(-7, -7, 14, 14);
          ctx.strokeStyle = PALETTE.emberHot;
          ctx.strokeRect(-7, -7, 14, 14);
          ctx.restore();
        }
        this.drawGlow(e.x, e.y, 60, PALETTE.emberHot, 0.8 + 0.2 * Math.sin(world.time * 7));
      } else if (e.hp < e.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2, 4);
        ctx.fillStyle = e.colour;
        ctx.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2 * (e.hp / e.maxHp), 4);
      }
    }
  }

  drawPlayer(world) {
    const ctx = this.ctx;
    const p = world.player;
    if (world.playerDead) return;
    // Orbit blades.
    if (p.stats.blades > 0) {
      for (let i = 0; i < p.stats.blades; i++) {
        const a = world.bladeAngle + (i * TAU) / p.stats.blades;
        const bx = p.x + Math.cos(a) * 62, by = p.y + Math.sin(a) * 62;
        this.drawGlow(bx, by, 34, PALETTE.teal, 0.65);
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(a + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -11); ctx.lineTo(5, 7); ctx.lineTo(-5, 7);
        ctx.closePath();
        ctx.fillStyle = PALETTE.teal;
        ctx.fill();
        ctx.restore();
      }
    }
    const blink = p.iframes > 0 && p.dashTimer <= 0 && Math.sin(world.time * 34) > 0;
    ctx.save();
    ctx.globalAlpha = blink ? 0.35 : 1;
    this.drawGlow(p.x, p.y, 76, PALETTE.ember, 0.85);
    // The wisp: a flame teardrop aimed along its aim, flickering.
    const flick = 1 + Math.sin(world.time * 21) * 0.07;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aim + Math.PI / 2);
    ctx.scale(flick, flick);
    const grad = ctx.createRadialGradient(0, 2, 2, 0, 0, p.r + 3);
    grad.addColorStop(0, '#fff3d6');
    grad.addColorStop(0.45, PALETTE.emberHot);
    grad.addColorStop(1, PALETTE.emberDeep);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, -p.r - 5);
    ctx.bezierCurveTo(p.r, -2, p.r * 0.72, p.r * 0.8, 0, p.r);
    ctx.bezierCurveTo(-p.r * 0.72, p.r * 0.8, -p.r, -2, 0, -p.r - 5);
    ctx.fill();
    ctx.restore();
    if (p.hurtFlash > 0) this.drawGlow(p.x, p.y, 70, PALETTE.rust, p.hurtFlash * 2.2);
  }

  drawBolts(world) {
    for (const b of world.bolts) {
      this.drawGlow(b.x, b.y, 26, PALETTE.emberHot, 0.9);
      this.ctx.fillStyle = '#ffe9c4';
      this.ctx.beginPath();
      this.ctx.arc(b.x, b.y, 3.2, 0, TAU);
      this.ctx.fill();
    }
    for (const hb of world.hostileBolts) {
      this.drawGlow(hb.x, hb.y, 30, PALETTE.rust, 0.85);
      this.ctx.fillStyle = '#ffb3ab';
      this.ctx.beginPath();
      this.ctx.arc(hb.x, hb.y, hb.r - 1, 0, TAU);
      this.ctx.fill();
    }
  }

  drawBeams(world) {
    const ctx = this.ctx;
    for (const bm of world.beams) {
      const alpha = bm.life / bm.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = PALETTE.teal;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const segs = 5;
      ctx.moveTo(bm.x1, bm.y1);
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        const mx = bm.x1 + (bm.x2 - bm.x1) * t + (Math.random() - 0.5) * 16;
        const my = bm.y1 + (bm.y2 - bm.y1) * t + (Math.random() - 0.5) * 16;
        ctx.lineTo(mx, my);
      }
      ctx.lineTo(bm.x2, bm.y2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawParticles(world) {
    const ctx = this.ctx;
    for (const pt of world.particles) {
      const a = Math.max(0, pt.life / pt.maxLife);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.colour;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * (0.5 + a * 0.5), 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  drawTexts(world) {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    for (const t of world.texts) {
      const a = Math.max(0, t.life / t.maxLife);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `700 ${t.size}px system-ui, sans-serif`;
      ctx.fillStyle = t.colour;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }

  // ---- HUD & screens ----------------------------------------------------

  drawHud(world) {
    const ctx = this.ctx;
    const p = world.player;
    ctx.textAlign = 'left';
    // Health.
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.ash;
    ctx.fillText('VITAL FLAME', 30, 30);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(30, 36, 240, 13);
    const hpFrac = Math.max(0, p.hp / p.maxHp);
    ctx.fillStyle = hpFrac > 0.3 ? PALETTE.ember : PALETTE.rust;
    ctx.fillRect(30, 36, 240 * hpFrac, 13);
    ctx.fillStyle = PALETTE.bone;
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, 278, 47);
    // Level badge (right of the health numbers, clear of three-digit values).
    ctx.fillStyle = PALETTE.tealDeep;
    ctx.beginPath(); ctx.arc(356, 42, 13, 0, TAU); ctx.fill();
    ctx.fillStyle = '#eafffb';
    ctx.textAlign = 'center';
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.fillText(String(p.level), 356, 47);
    ctx.textAlign = 'left';
    // Wave + foes left.
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.bone;
    ctx.font = '800 19px system-ui, sans-serif';
    ctx.fillText(`WAVE ${Math.max(1, world.wave)}`, 640, 34);
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.ash;
    const foes = world.enemies.length + (world.phase === 'combat' ? world.spawnLeft : 0);
    ctx.fillText(world.phase === 'combat' ? `${foes} husks remain` : 'the arena breathes…', 640, 52);
    // Score + time.
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = '800 19px system-ui, sans-serif';
    ctx.fillText(String(world.score), 1250, 34);
    ctx.fillStyle = PALETTE.ash;
    ctx.font = '600 12px system-ui, sans-serif';
    const t = Math.floor(world.time);
    ctx.fillText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, 1250, 52);
    ctx.textAlign = 'left';
    // Dash cooldown.
    ctx.fillStyle = PALETTE.ash;
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.fillText('DASH', 30, 694);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(72, 685, 90, 9);
    const dashFrac = p.dashCd <= 0 ? 1 : 1 - p.dashCd / (2.3 * p.stats.dashMul);
    ctx.fillStyle = PALETTE.teal;
    ctx.fillRect(72, 685, 90 * Math.max(0, Math.min(1, dashFrac)), 9);
    // XP bar along the bottom.
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 714, VIEW_WIDTH, 6);
    ctx.fillStyle = PALETTE.shard;
    ctx.fillRect(0, 714, VIEW_WIDTH * Math.min(1, p.xp / p.xpNext), 6);
    // Boss bar.
    if (world.boss) {
      const b = world.boss;
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.emberHot;
      ctx.font = '800 13px system-ui, sans-serif';
      ctx.fillText('☠ THE PYRE HUSK', 640, 82);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(440, 88, 400, 9);
      ctx.fillStyle = PALETTE.emberDeep;
      ctx.fillRect(440, 88, 400 * Math.max(0, b.hp / b.maxHp), 9);
      ctx.textAlign = 'left';
    }
  }

  drawBanner(world) {
    const ctx = this.ctx;
    const a = Math.min(1, world.bannerTimer / 0.5, (2.2 - world.bannerTimer) / 0.4 + 0.2);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.textAlign = 'center';
    ctx.font = '800 40px Georgia, serif';
    ctx.fillStyle = PALETTE.gold;
    ctx.shadowColor = PALETTE.ember;
    ctx.shadowBlur = 26;
    ctx.fillText(world.bannerText, 640, 200);
    ctx.restore();
  }

  panel(x, y, w, h) {
    const ctx = this.ctx;
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255, 122, 38, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, y, w, h);
  }

  drawMenu(ui) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(5, 3, 2, 0.45)';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.textAlign = 'center';
    ctx.save();
    ctx.shadowColor = PALETTE.ember;
    ctx.shadowBlur = 44;
    ctx.font = '900 96px Georgia, serif';
    const grad = ctx.createLinearGradient(0, 180, 0, 290);
    grad.addColorStop(0, '#ffe9c4');
    grad.addColorStop(0.55, PALETTE.emberHot);
    grad.addColorStop(1, PALETTE.emberDeep);
    ctx.fillStyle = grad;
    ctx.fillText('EMBERFALL', 640, 268);
    ctx.restore();
    ctx.font = '600 19px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.teal;
    ctx.fillText('Outlast the husk swarm. Feed the flame. Rise brighter.', 640, 308);
    ctx.font = '500 16px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.bone;
    ctx.fillText('WASD / Arrows — move        SHIFT or SPACE — dash through danger', 640, 386);
    ctx.fillText('Your wisp fires on its own — gather ember shards, level up, choose your boons', 640, 414);
    ctx.fillText('Every 5th wave, the Pyre Husk comes for you', 640, 442);
    if (ui.highScore > 0) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = '700 17px system-ui, sans-serif';
      ctx.fillText(`BEST SCORE  ${ui.highScore}`, 640, 492);
    }
    const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 300);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.font = '800 24px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.emberHot;
    ctx.fillText('CLICK OR PRESS ENTER TO PLAY', 640, 566);
    ctx.restore();
    ctx.font = '500 13px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.ash;
    ctx.fillText('M — mute · P — pause', 640, 606);
  }

  drawLevelUp(world, ui) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(5, 3, 2, 0.62)';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.textAlign = 'center';
    ctx.font = '800 34px Georgia, serif';
    ctx.fillStyle = PALETTE.gold;
    ctx.fillText('THE FLAME GROWS', 640, 148);
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.bone;
    ctx.fillText(`Level ${world.player.level} — choose a boon (keys 1 · 2 · 3 or click)`, 640, 178);
    const cw = 292, ch = 330, gap = 28;
    const total = cw * 3 + gap * 2;
    const x0 = (VIEW_WIDTH - total) / 2, y0 = 216;
    ui.choices.forEach((u, i) => {
      const x = x0 + i * (cw + gap);
      const hover = ui.hover === i;
      this.panel(x, y0, cw, ch);
      if (hover) {
        ctx.strokeStyle = PALETTE.gold;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y0, cw, ch);
      }
      ctx.fillStyle = hover ? PALETTE.emberHot : PALETTE.ember;
      ctx.font = '64px system-ui, sans-serif';
      ctx.fillText(u.glyph, x + cw / 2, y0 + 96);
      ctx.fillStyle = PALETTE.bone;
      ctx.font = '800 23px system-ui, sans-serif';
      ctx.fillText(u.name, x + cw / 2, y0 + 148);
      ctx.fillStyle = PALETTE.ash;
      ctx.font = '500 15px system-ui, sans-serif';
      ctx.fillText(u.blurb, x + cw / 2, y0 + 182);
      const stacks = world.player.stacks[u.id] || 0;
      ctx.fillStyle = PALETTE.teal;
      ctx.font = '700 14px system-ui, sans-serif';
      ctx.fillText(stacks > 0 ? `owned × ${stacks}  →  × ${stacks + 1}` : 'new boon', x + cw / 2, y0 + 226);
      ctx.fillStyle = PALETTE.gold;
      ctx.font = '800 17px system-ui, sans-serif';
      ctx.fillText(`[ ${i + 1} ]`, x + cw / 2, y0 + ch - 26);
    });
  }

  drawPause() {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(5, 3, 2, 0.55)';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.textAlign = 'center';
    ctx.font = '800 44px Georgia, serif';
    ctx.fillStyle = PALETTE.bone;
    ctx.fillText('PAUSED', 640, 340);
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.ash;
    ctx.fillText('Press P or Esc to resume', 640, 380);
  }

  drawGameOver(world, ui) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(5, 3, 2, 0.66)';
    ctx.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);
    ctx.textAlign = 'center';
    ctx.font = '900 62px Georgia, serif';
    ctx.fillStyle = PALETTE.rust;
    ctx.fillText('THE EMBER FADES', 640, 190);
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.bone;
    ctx.fillText(world.deathCause || 'Felled in the arena', 640, 228);
    const rows = [
      ['SCORE', String(world.score)],
      ['BEST', String(ui.highScore)],
      ['WAVE REACHED', String(world.wave)],
      ['TIME SURVIVED', ui.timeText],
      ['HUSKS FELLED', String(world.kills)],
      ['LEVEL', String(world.player.level)],
    ];
    rows.forEach(([k, v], i) => {
      const y = 292 + i * 40;
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillStyle = PALETTE.ash;
      ctx.textAlign = 'right';
      ctx.fillText(k, 612, y);
      ctx.font = '800 19px system-ui, sans-serif';
      ctx.fillStyle = PALETTE.gold;
      ctx.textAlign = 'left';
      ctx.fillText(v, 668, y);
    });
    ctx.textAlign = 'center';
    const pulse = 0.65 + 0.35 * Math.sin(performance.now() / 300);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.fillStyle = PALETTE.emberHot;
    ctx.fillText('PRESS R OR CLICK TO RISE AGAIN', 640, 292 + rows.length * 40 + 44);
    ctx.restore();
  }
}
