// ═══════════════════════════════════════════════════════════════
// TwitchDancefloor - Visual Effects Renderer v8
// PERFORMANCE OPTIMIZED with PATH BATCHING:
// - Laser: 18 draw calls → 3 (all lines batched per layer!)
// - Lightning: 4N → 2 draw calls (all bolts batched)
// - Pulse rings: 2N → 2 (all rings batched)
// - NO shadowBlur anywhere (manual glow via layered strokes)
// - Half-res canvas (960x540) for 4x fewer pixels
// ═══════════════════════════════════════════════════════════════

const EffectsRenderer = (() => {
  const W = 1920, H = 1080;

  // ── Color utility with cache ──
  const rgbCache = {};
  function hexToRgb(hex) {
    if (rgbCache[hex]) return rgbCache[hex];
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    rgbCache[hex] = { r, g, b };
    return rgbCache[hex];
  }
  function rgba(hex, a) {
    const c = hexToRgb(hex);
    return `rgba(${c.r},${c.g},${c.b},${Math.max(0, Math.min(1, a))})`;
  }
  function hsl(h, s, l, a) { return `hsla(${h},${s}%,${l}%,${a})`; }

  // ── Particle pools with size limits ──
  const particlePool = [];
  const confettiPool = [];
  const pulseRings = [];

  // ═════════════════════ LASER (BATCHED!) ═════════════════════
  function renderLaser(ctx, effect, audio, t) {
    if (!effect.enabled) return;
    const intensity = effect.intensity;
    const speed = effect.speed;
    const color = effect.color;
    const bp = audio.beatPulse || 0;
    const count = Math.min(Math.floor(3 + audio.bass * 3 * intensity), 6);
    const sweepSpeed = 0.4 * speed + audio.mid * 1.0;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';

    // Pre-compute all laser line coordinates
    const lines = [];
    for (let i = 0; i < count; i++) {
      const phase = (i / count) * Math.PI * 2;
      const angle = Math.sin(t * sweepSpeed + phase) * 0.9;
      const originSide = i % 4;
      let ox, oy, dx, dy;

      if (originSide === 0) { ox = 0; oy = H; dx = Math.cos(angle - 0.3); dy = Math.sin(angle - 1.2); }
      else if (originSide === 1) { ox = W; oy = H; dx = Math.cos(angle + 0.3 + Math.PI); dy = Math.sin(angle - 1.2); }
      else if (originSide === 2) { ox = W * 0.15; oy = 0; dx = Math.cos(angle + 0.5); dy = Math.sin(angle + 0.8); }
      else { ox = W * 0.85; oy = 0; dx = Math.cos(angle - 0.5 + Math.PI); dy = Math.sin(angle + 0.8); }

      const len = 2500;
      lines.push({ ox, oy, ex: ox + dx * len, ey: oy + dy * len });
    }

    // LAYER 1: All glow lines in ONE path (was: N separate draw calls)
    ctx.beginPath();
    for (const l of lines) { ctx.moveTo(l.ox, l.oy); ctx.lineTo(l.ex, l.ey); }
    ctx.strokeStyle = rgba(color, (0.1 + bp * 0.06) * intensity);
    ctx.lineWidth = 20 + audio.bass * 8;
    ctx.stroke();

    // LAYER 2: All core lines in ONE path
    ctx.beginPath();
    for (const l of lines) { ctx.moveTo(l.ox, l.oy); ctx.lineTo(l.ex, l.ey); }
    ctx.strokeStyle = rgba(color, (0.4 + bp * 0.15) * intensity);
    ctx.lineWidth = 4 + audio.bass * 2;
    ctx.stroke();

    // LAYER 3: All white hot lines in ONE path
    ctx.beginPath();
    for (const l of lines) { ctx.moveTo(l.ox, l.oy); ctx.lineTo(l.ex, l.ey); }
    ctx.strokeStyle = rgba('#ffffff', (0.5 + bp * 0.3) * intensity);
    ctx.lineWidth = 1 + audio.bass * 0.5;
    ctx.stroke();

    ctx.restore();
  }

  // ═══════════════════ SPOTLIGHT ═══════════════════
  function renderSpotlight(ctx, effect, audio, t) {
    if (!effect.enabled) return;
    const intensity = effect.intensity;
    const speed = effect.speed;
    const color = effect.color;
    const bp = audio.beatPulse || 0;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (let i = 0; i < 4; i++) {
      const phase = (i / 4) * Math.PI * 2;
      const centerX = W * (0.2 + i * 0.2) + Math.sin(t * speed * 0.3 + phase) * 250;
      const topX = centerX + Math.sin(t * speed * 0.2 + phase * 1.5) * 120;
      const spread = (250 + audio.bass * 350 * intensity + bp * 100);
      const alpha = (0.12 + bp * 0.08) * intensity + audio.mid * 0.15 * intensity;

      const grad = ctx.createRadialGradient(topX, -30, 10, centerX, H, spread);
      grad.addColorStop(0, rgba(color, alpha * 1.2));
      grad.addColorStop(0.4, rgba(color, alpha * 0.6));
      grad.addColorStop(1, rgba(color, 0));

      ctx.beginPath();
      ctx.moveTo(topX, -30);
      ctx.lineTo(centerX - spread, H);
      ctx.lineTo(centerX + spread, H);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Floor pool
      const poolGrad = ctx.createRadialGradient(centerX, H - 20, 5, centerX, H - 20, spread * 0.7);
      poolGrad.addColorStop(0, rgba(color, alpha * 2));
      poolGrad.addColorStop(1, rgba(color, 0));
      ctx.beginPath();
      ctx.ellipse(centerX, H - 20, spread * 0.7, 60, 0, 0, Math.PI * 2);
      ctx.fillStyle = poolGrad;
      ctx.fill();
    }
    ctx.restore();
  }

  // ═══════════════════ FOG ═══════════════════
  function renderFog(ctx, effect, audio, t) {
    if (!effect.enabled) return;
    const intensity = effect.intensity;
    const speed = effect.speed;
    const color = effect.color;
    const bp = audio.beatPulse || 0;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (let i = 0; i < 8; i++) {
      const y = H * 0.35 + Math.sin(t * speed * 0.12 + i * 1.1) * H * 0.35;
      const x = ((t * speed * 30 + i * 280) % (W + 800)) - 400;
      const size = 400 + i * 80 + audio.volume * 250 * intensity + bp * 120;
      const alpha = (0.08 + audio.volume * 0.12 + bp * 0.06) * intensity;

      const grad = ctx.createRadialGradient(x, y, 0, x, y, size);
      grad.addColorStop(0, rgba(color, alpha * 2.5));
      grad.addColorStop(0.3, rgba(color, alpha * 1.2));
      grad.addColorStop(0.7, rgba(color, alpha * 0.4));
      grad.addColorStop(1, rgba(color, 0));

      ctx.beginPath();
      ctx.ellipse(x, y, size, size * 0.35, Math.sin(t * 0.05 + i) * 0.15, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();
  }

  // ═══════════════════ STROBE ═══════════════════
  function renderStrobe(ctx, effect, audio, t) {
    if (!effect.enabled) return;
    const intensity = effect.intensity;
    const speed = effect.speed;
    const color = effect.color;
    const bp = audio.beatPulse || 0;

    if (bp > 0.4) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = rgba(color, bp * 0.35 * intensity);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    const freq = speed * 2;
    const autoFlash = Math.sin(t * freq * Math.PI * 2) > 0.92;
    if (autoFlash && bp < 0.2) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = rgba(color, 0.2 * intensity);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // ═══════════════════ LIGHT BEAM ═══════════════════
  function renderLightbeam(ctx, effect, audio, t) {
    if (!effect.enabled) return;
    const intensity = effect.intensity;
    const speed = effect.speed;
    const color = effect.color;
    const bp = audio.beatPulse || 0;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (let i = 0; i < 5; i++) {
      const phase = i * Math.PI * 2 / 5;
      const topX = W * (0.1 + i * 0.2);
      const sway = Math.sin(t * speed * 0.35 + phase) * 180;
      const alpha = (0.1 + audio.bass * 0.15 + bp * 0.08) * intensity;
      const botW = 140 + audio.bass * 180 * intensity + bp * 50;

      ctx.beginPath();
      ctx.moveTo(topX + sway - 10, 0);
      ctx.lineTo(topX + sway + 10, 0);
      ctx.lineTo(topX + sway * 2 + botW, H);
      ctx.lineTo(topX + sway * 2 - botW, H);
      ctx.closePath();

      const grad = ctx.createLinearGradient(topX + sway, 0, topX + sway * 2, H);
      grad.addColorStop(0, rgba(color, alpha * 1.5));
      grad.addColorStop(0.3, rgba(color, alpha));
      grad.addColorStop(0.7, rgba(color, alpha * 0.4));
      grad.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();
  }

  // ═══════════════════ PARTICLES ═══════════════════
  function renderParticles(ctx, effect, audio, t) {
    if (!effect.enabled) return;
    const intensity = effect.intensity;
    const speed = effect.speed;
    const color = effect.color;
    const bp = audio.beatPulse || 0;
    const maxParticles = Math.floor(60 * intensity);

    const spawnRate = 2 + audio.volume * 4 * intensity;
    for (let i = 0; i < spawnRate && particlePool.length < maxParticles; i++) {
      particlePool.push({
        x: Math.random() * W, y: H + 10,
        vx: (Math.random() - 0.5) * 2 * speed,
        vy: -(1.5 + Math.random() * 3) * speed,
        size: 2 + Math.random() * 3, life: 1, decay: 0.005 + Math.random() * 0.006,
      });
    }

    if (audio.beat) {
      for (let i = 0; i < 12; i++) {
        if (particlePool.length < maxParticles + 20) {
          particlePool.push({
            x: W * 0.2 + Math.random() * W * 0.6, y: H * 0.3 + Math.random() * H * 0.5,
            vx: (Math.random() - 0.5) * 8, vy: -Math.random() * 5,
            size: 2 + Math.random() * 4, life: 1, decay: 0.01 + Math.random() * 0.01,
          });
        }
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Batch all glow circles together
    ctx.fillStyle = rgba(color, 0.15 * intensity);
    ctx.beginPath();
    for (let i = particlePool.length - 1; i >= 0; i--) {
      const p = particlePool[i];
      p.x += p.vx; p.y += p.vy;
      p.vy -= 0.015; p.life -= p.decay;
      if (p.life <= 0 || p.y < -30) { particlePool.splice(i, 1); continue; }
      const r = p.size * p.life * 2.5;
      ctx.moveTo(p.x + r, p.y);
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    }
    ctx.fill();

    // Batch all core circles together
    const coreAlpha = (0.6 + bp * 0.2) * intensity;
    ctx.fillStyle = rgba(color, coreAlpha);
    ctx.beginPath();
    for (const p of particlePool) {
      const r = p.size * p.life;
      ctx.moveTo(p.x + r, p.y);
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    }
    ctx.fill();

    ctx.restore();
  }

  // ═══════════════════ EQUALIZER ═══════════════════
  function renderEqualizer(ctx, effect, audio, t) {
    if (!effect.enabled) return;
    const intensity = effect.intensity;
    const color = effect.color;
    const barCount = 48;
    const totalBarW = W / barCount;
    const barW = totalBarW * 0.72;
    const gap = totalBarW * 0.28;
    const maxH = 280 * intensity;
    const bp = audio.beatPulse || 0;

    const bands = audio.eqBands;
    if (!bands || bands.length === 0) return;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (let i = 0; i < barCount; i++) {
      const bandIdx = Math.floor(i * bands.length / barCount);
      const raw = bands[bandIdx] || 0;
      const barH = Math.max(raw * maxH + 4 + bp * 15, 4);
      const x = i * totalBarW + gap / 2;
      const y = H - barH;

      const grad = ctx.createLinearGradient(x, H, x, y);
      grad.addColorStop(0, rgba(color, 0.9 * intensity));
      grad.addColorStop(0.5, rgba(color, 0.5 * intensity));
      grad.addColorStop(1, rgba(color, 0.1 * intensity));

      ctx.fillStyle = grad;
      ctx.fillRect(x, y, barW, barH);

      // Top cap
      ctx.fillStyle = rgba('#ffffff', (0.25 + bp * 0.2) * intensity);
      ctx.fillRect(x, y, barW, Math.min(2, barH));
    }
    ctx.restore();
  }

  // ═══════════════════ COLOR WASH ═══════════════════
  function renderColorwash(ctx, effect, audio, t) {
    if (!effect.enabled) return;
    const intensity = effect.intensity;
    const speed = effect.speed;
    const bp = audio.beatPulse || 0;
    const hue = (t * speed * 30) % 360;

    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, hsl(hue, 85, 50, (0.1 + bp * 0.08) * intensity));
    grad.addColorStop(0.5, hsl((hue + 120) % 360, 85, 50, (0.08 + audio.mid * 0.1) * intensity));
    grad.addColorStop(1, hsl((hue + 240) % 360, 85, 50, (0.1 + bp * 0.08) * intensity));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // ═══════════════════ MIRROR BALL ═══════════════════
  function renderMirrorball(ctx, effect, audio, t) {
    if (!effect.enabled) return;
    const intensity = effect.intensity;
    const speed = effect.speed;
    const color = effect.color;
    const bp = audio.beatPulse || 0;
    const cx = W / 2, cy = 60;
    const rgb = hexToRgb(color);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Ball
    const ballGrad = ctx.createRadialGradient(cx, cy, 3, cx, cy, 45);
    ballGrad.addColorStop(0, rgba('#ffffff', 0.7 * intensity));
    ballGrad.addColorStop(0.5, rgba('#cccccc', 0.3 * intensity));
    ballGrad.addColorStop(1, rgba('#444444', 0.05 * intensity));
    ctx.beginPath();
    ctx.arc(cx, cy, 40, 0, Math.PI * 2);
    ctx.fillStyle = ballGrad;
    ctx.fill();

    // Wire
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, cy - 40);
    ctx.strokeStyle = rgba('#888888', 0.5 * intensity);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Light dots - batch glow and core separately
    const rotSpeed = t * speed * 0.6;
    const dots = [];
    for (let ring = 0; ring < 4; ring++) {
      const dotsInRing = 5 + ring * 3;
      for (let i = 0; i < dotsInRing; i++) {
        const angle = (i / dotsInRing) * Math.PI * 2 + rotSpeed * (1 + ring * 0.15);
        const dist = 180 + ring * 220 + (audio.bass + bp * 0.3) * 220 * intensity;
        const dotX = cx + Math.cos(angle) * dist;
        const dotY = cy + Math.abs(Math.sin(angle)) * dist * 0.65 + 80 + ring * 35;
        if (dotY > H + 50 || dotX < -100 || dotX > W + 100) continue;
        const dotSize = 3 + audio.volume * 6 * intensity + bp * 3;
        const alpha = (0.3 + audio.volume * 0.4 + bp * 0.2) * intensity;
        dots.push({ x: dotX, y: dotY, size: dotSize, alpha });
      }
    }

    // Batch glow circles
    ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`;
    ctx.beginPath();
    for (const d of dots) {
      ctx.moveTo(d.x + d.size * 2.5, d.y);
      ctx.arc(d.x, d.y, d.size * 2.5, 0, Math.PI * 2);
    }
    ctx.fill();

    // Batch core circles
    ctx.beginPath();
    for (const d of dots) {
      ctx.moveTo(d.x + d.size, d.y);
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
    }
    ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${dots.length > 0 ? dots[0].alpha.toFixed(2) : '0.3'})`;
    ctx.fill();

    ctx.restore();
  }

  // ═══════════════════ PULSE RING (BATCHED!) ═══════════════════
  function renderPulsering(ctx, effect, audio, t) {
    if (!effect.enabled) return;
    const intensity = effect.intensity;
    const color = effect.color;
    const bp = audio.beatPulse || 0;

    if (audio.beat) {
      pulseRings.push({ r: 30, maxR: 900, alpha: 0.8 * intensity, speed: 4 + effect.speed * 4 });
    }

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Update rings
    for (let i = pulseRings.length - 1; i >= 0; i--) {
      const ring = pulseRings[i];
      ring.r += ring.speed * (1 + audio.mid * 0.3);
      ring.alpha *= 0.94;
      if (ring.alpha < 0.01 || ring.r > ring.maxR) { pulseRings.splice(i, 1); continue; }
    }

    // BATCH: All glow rings in ONE path
    ctx.beginPath();
    for (const ring of pulseRings) {
      ctx.moveTo(W / 2 + ring.r, H / 2);
      ctx.arc(W / 2, H / 2, ring.r, 0, Math.PI * 2);
    }
    ctx.strokeStyle = rgba(color, 0.3);
    ctx.lineWidth = 8 * intensity;
    ctx.stroke();

    // BATCH: All core rings in ONE path
    ctx.beginPath();
    for (const ring of pulseRings) {
      ctx.moveTo(W / 2 + ring.r, H / 2);
      ctx.arc(W / 2, H / 2, ring.r, 0, Math.PI * 2);
    }
    ctx.strokeStyle = rgba(color, 0.8);
    ctx.lineWidth = 2 * intensity;
    ctx.stroke();

    ctx.restore();
  }

  // ═══════════════════ CONFETTI ═══════════════════
  function renderConfetti(ctx, effect, audio, t) {
    if (!effect.enabled) return;
    const intensity = effect.intensity;
    const speed = effect.speed;
    const maxConfetti = Math.floor(60 * intensity);

    const spawnCount = audio.beat ? 5 : (Math.random() < 0.3 + audio.volume * 0.4 ? 1 : 0);
    for (let i = 0; i < spawnCount && confettiPool.length < maxConfetti; i++) {
      confettiPool.push({
        x: Math.random() * W, y: -10,
        vx: (Math.random() - 0.5) * 3, vy: 1.5 + Math.random() * 2 * speed,
        rot: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.2,
        w: 5 + Math.random() * 8, h: 4 + Math.random() * 5,
        color: hsl(Math.random() * 360, 90, 60, 1), life: 1
      });
    }

    ctx.save();
    for (let i = confettiPool.length - 1; i >= 0; i--) {
      const c = confettiPool[i];
      c.x += c.vx; c.y += c.vy; c.rot += c.rotSpeed;
      c.vx += (Math.random() - 0.5) * 0.1;
      if (c.y > H + 20) { confettiPool.splice(i, 1); continue; }

      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.globalAlpha = 0.8 * intensity;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    }
    ctx.restore();
  }

  // ═══════════════════ LIGHTNING (BATCHED!) ═══════════════════
  let lightningBolts = [];
  function renderLightning(ctx, effect, audio, t) {
    if (!effect.enabled) return;
    const intensity = effect.intensity;
    const color = effect.color;

    if (audio.beat) {
      const startX = W * (0.1 + Math.random() * 0.8);
      const bolt = { points: [{ x: startX, y: 0 }], alpha: 1.0, life: 6 };
      let bx = startX, by = 0;
      while (by < H) {
        bx += (Math.random() - 0.5) * 120;
        by += 30 + Math.random() * 50;
        bolt.points.push({ x: bx, y: Math.min(by, H), branch: false });
        if (Math.random() < 0.25) {
          let bbx = bx, bby = by;
          for (let b = 0; b < 3; b++) {
            bbx += (Math.random() - 0.5) * 80;
            bby += 20 + Math.random() * 30;
            bolt.points.push({ x: bbx, y: Math.min(bby, H), branch: true });
          }
          bolt.points.push({ x: bx, y: Math.min(by, H), branch: false });
        }
      }
      lightningBolts.push(bolt);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Update bolts
    for (let i = lightningBolts.length - 1; i >= 0; i--) {
      lightningBolts[i].life--;
      lightningBolts[i].alpha *= 0.6;
      if (lightningBolts[i].life <= 0) { lightningBolts.splice(i, 1); }
    }

    // BATCH: All glow bolts in ONE path
    ctx.beginPath();
    for (const bolt of lightningBolts) {
      let started = false;
      for (const pt of bolt.points) {
        if (pt.branch) { ctx.moveTo(pt.x, pt.y); started = true; }
        else if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
        else ctx.lineTo(pt.x, pt.y);
      }
    }
    ctx.strokeStyle = rgba(color, 0.3 * intensity);
    ctx.lineWidth = 18;
    ctx.stroke();

    // BATCH: All core bolts in ONE path
    ctx.beginPath();
    for (const bolt of lightningBolts) {
      let started = false;
      for (const pt of bolt.points) {
        if (pt.branch) { ctx.moveTo(pt.x, pt.y); started = true; }
        else if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
        else ctx.lineTo(pt.x, pt.y);
      }
    }
    ctx.strokeStyle = rgba('#ffffff', intensity);
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
  }

  // ═══════════════════ SMOKE ═══════════════════
  function renderSmoke(ctx, effect, audio, t) {
    if (!effect.enabled) return;
    const intensity = effect.intensity;
    const speed = effect.speed;
    const color = effect.color;
    const bp = audio.beatPulse || 0;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (let i = 0; i < 7; i++) {
      const phase = i * 1.6;
      const x = ((Math.sin(t * speed * 0.07 + phase) + 1) / 2) * W;
      const y = H - 50 - Math.sin(t * speed * 0.1 + phase) * 300 - i * 40;
      const size = 320 + i * 90 + audio.volume * 200 * intensity + bp * 80;
      const alpha = (0.08 + audio.bass * 0.06 + bp * 0.03) * intensity;

      const grad = ctx.createRadialGradient(x, y, 0, x, y, size);
      grad.addColorStop(0, rgba(color, alpha * 2.5));
      grad.addColorStop(0.3, rgba(color, alpha * 1.2));
      grad.addColorStop(0.7, rgba(color, alpha * 0.4));
      grad.addColorStop(1, rgba(color, 0));

      ctx.beginPath();
      ctx.ellipse(x, y, size, size * 0.45, Math.sin(t * 0.08 + i) * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();
  }

  // ═══════════════════ MAIN RENDER ═══════════════════
  function render(ctx, effects, audio, t) {
    const effectMap = {
      colorwash: renderColorwash, fog: renderFog, smoke: renderSmoke,
      lightbeam: renderLightbeam, spotlight: renderSpotlight,
      mirrorball: renderMirrorball, laser: renderLaser,
      particles: renderParticles, pulsering: renderPulsering,
      equalizer: renderEqualizer, confetti: renderConfetti,
      lightning: renderLightning, strobe: renderStrobe,
    };
    const renderOrder = ['colorwash', 'fog', 'smoke', 'lightbeam', 'spotlight',
      'mirrorball', 'laser', 'particles', 'pulsering', 'equalizer',
      'confetti', 'lightning', 'strobe'];

    for (const id of renderOrder) {
      const effect = effects.find(e => e.id === id);
      if (effect && effectMap[id]) effectMap[id](ctx, effect, audio, t);
    }
  }

  return { render };
})();
