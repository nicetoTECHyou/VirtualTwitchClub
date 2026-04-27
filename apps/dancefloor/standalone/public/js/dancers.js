// ═══════════════════════════════════════════════════════════════
// TwitchDancefloor - CSS/GPU Dancer Renderer v8
// REVOLUTIONARY: Zero Canvas 2D draw calls!
// Each dancer = absolutely positioned div elements
// CSS transforms are GPU-composited by the browser
// box-shadow glow is GPU-rendered (NOT CPU shadowBlur!)
// Result: Dancers that DON'T freeze everything!
// ═══════════════════════════════════════════════════════════════

const DancersRenderer = (() => {
  const W = 1920, H = 1080;

  // Positions: LEFT side and RIGHT side only
  const LEFT_X  = [140, 340];
  const RIGHT_X = [1580, 1780];

  // ── Dance Style Definitions ──
  const STYLES = {
    hiphop: {
      name: 'Hip Hop', speed: 2.0,
      getPose(t, bass, bp) {
        const groove = Math.sin(t * 1.75);
        return {
          bounce: Math.abs(Math.sin(t * 3.5)) * (15 + bp * 28),
          sway: groove * (14 + bp * 14),
          lean: groove * (0.07 + bp * 0.07),
          headBob: Math.sin(t * 7) * (0.12 + bp * 0.12),
          lArm: Math.max(0, Math.sin(t * 3.5)) * (0.9 + bp * 0.5),
          lElbow: 0.7 + Math.sin(t * 3.5 + 1.0) * 0.5 + bp * 0.15,
          rArm: Math.max(0, Math.sin(t * 3.5 + Math.PI * 0.55)) * (0.9 + bp * 0.5),
          rElbow: 0.7 + Math.sin(t * 3.5 + Math.PI * 0.55 + 1.0) * 0.5 + bp * 0.15,
          lLeg: Math.sin(t * 3.5) * (0.14 + bp * 0.1),
          lKnee: Math.max(0, Math.sin(t * 3.5)) * (0.28 + bp * 0.14),
          rLeg: Math.sin(t * 3.5 + Math.PI) * (0.14 + bp * 0.1),
          rKnee: Math.max(0, Math.sin(t * 3.5 + Math.PI)) * (0.28 + bp * 0.14),
        };
      }
    },
    techno: {
      name: 'Techno', speed: 3.0,
      getPose(t, bass, bp) {
        const pump = Math.sin(t * 3);
        return {
          bounce: Math.abs(Math.sin(t * 6)) * (10 + bp * 22),
          sway: Math.sin(t * 2) * (6 + bp * 10),
          lean: Math.sin(t * 2) * (0.04 + bp * 0.03),
          headBob: Math.sin(t * 6) * (0.18 + bp * 0.14),
          lArm: 0.4 + Math.max(0, pump) * (1.1 + bp * 0.6),
          lElbow: 0.2 + Math.max(0, pump) * 0.3 + bp * 0.1,
          rArm: 0.4 + Math.max(0, -pump) * (1.1 + bp * 0.6),
          rElbow: 0.2 + Math.max(0, -pump) * 0.3 + bp * 0.1,
          lLeg: Math.sin(t * 3) * (0.08 + bp * 0.06),
          lKnee: Math.max(0, Math.sin(t * 3)) * 0.15 + bp * 0.08,
          rLeg: Math.sin(t * 3 + Math.PI) * (0.08 + bp * 0.06),
          rKnee: Math.max(0, Math.sin(t * 3 + Math.PI)) * 0.15 + bp * 0.08,
        };
      }
    },
    pop: {
      name: 'Pop', speed: 1.6,
      getPose(t, bass, bp) {
        const flow = Math.sin(t * 1.25);
        return {
          bounce: Math.abs(Math.sin(t * 2.5)) * (10 + bp * 20),
          sway: flow * (16 + bp * 12),
          lean: flow * (0.1 + bp * 0.05),
          headBob: Math.sin(t * 2.5) * (0.08 + bp * 0.08),
          lArm: 0.3 + Math.sin(t * 1.25) * (0.8 + bp * 0.3),
          lElbow: 0.5 + Math.sin(t * 2.5 + 0.5) * 0.35 + bp * 0.1,
          rArm: 0.3 + Math.sin(t * 1.25 + Math.PI * 0.6) * (0.8 + bp * 0.3),
          rElbow: 0.5 + Math.sin(t * 2.5 + Math.PI * 0.6 + 0.5) * 0.35 + bp * 0.1,
          lLeg: Math.sin(t * 2.5) * (0.1 + bp * 0.06),
          lKnee: Math.max(0, Math.sin(t * 2.5)) * (0.22 + bp * 0.1),
          rLeg: Math.sin(t * 2.5 + Math.PI) * (0.1 + bp * 0.06),
          rKnee: Math.max(0, Math.sin(t * 2.5 + Math.PI)) * (0.22 + bp * 0.1),
        };
      }
    },
    club: {
      name: 'Club', speed: 2.2,
      getPose(t, bass, bp) {
        const groove = Math.sin(t * 1.5);
        return {
          bounce: Math.abs(Math.sin(t * 3)) * (12 + bp * 24),
          sway: groove * (13 + bp * 11),
          lean: groove * (0.08 + bp * 0.06),
          headBob: Math.sin(t * 3) * (0.1 + bp * 0.1),
          lArm: 0.2 + Math.max(0, groove) * (0.6 + bp * 0.3),
          lElbow: 0.6 + Math.sin(t * 3 + 0.7) * 0.35 + bp * 0.1,
          rArm: 0.2 + Math.max(0, -groove) * (0.6 + bp * 0.3),
          rElbow: 0.6 + Math.sin(t * 3 + Math.PI + 0.7) * 0.35 + bp * 0.1,
          lLeg: Math.sin(t * 3) * (0.11 + bp * 0.07),
          lKnee: Math.max(0, Math.sin(t * 3)) * (0.22 + bp * 0.1),
          rLeg: Math.sin(t * 3 + Math.PI) * (0.11 + bp * 0.07),
          rKnee: Math.max(0, Math.sin(t * 3 + Math.PI)) * (0.22 + bp * 0.1),
        };
      }
    },
  };

  // ── 4 Dancers (2 left, 2 right) ──
  const dancers = [
    { name: 'Hip Hop',  style: 'hiphop', side: 'left',  slot: 0, scale: 2.2, phase: 0,   color: '#00ff88' },
    { name: 'Pop',      style: 'pop',    side: 'left',  slot: 1, scale: 1.9, phase: 2.5, color: '#ffcc00' },
    { name: 'Techno',   style: 'techno', side: 'right', slot: 0, scale: 2.1, phase: 0.8, color: '#00aaff' },
    { name: 'Club',     style: 'club',   side: 'right', slot: 1, scale: 2.0, phase: 1.8, color: '#ff4488' },
  ];

  // ── Skeleton Dimensions ──
  const BONE = {
    torso: 55, neck: 18, headR: 13,
    upperArm: 28, forearm: 25, handR: 5,
    thigh: 35, shin: 32,
    shoulderW: 18, hipW: 14,
  };

  // ── DOM Elements for each dancer ──
  const dancerDOM = [];
  let initialized = false;

  // ── Parse hex color to RGB ──
  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  // ── Create DOM elements for one dancer ──
  function createDancerDOM(dancer) {
    const container = document.getElementById('dancers-container');
    if (!container) return null;

    const rgb = hexToRgb(dancer.color);
    const glowColor = `rgba(${rgb.r},${rgb.g},${rgb.b},0.6)`;
    const glowColor2 = `rgba(${rgb.r},${rgb.g},${rgb.b},0.25)`;
    const glowColor3 = `rgba(${rgb.r},${rgb.g},${rgb.b},0.1)`;

    // Wrapper for entire dancer
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;will-change:opacity,transform;transform:translateZ(0);';

    const bones = {};
    const boneConfigs = [
      { name: 'torso',       thick: 20 },
      { name: 'neck',        thick: 9 },
      { name: 'lUpperArm',   thick: 11 },
      { name: 'lForearm',    thick: 10 },
      { name: 'rUpperArm',   thick: 11 },
      { name: 'rForearm',    thick: 10 },
      { name: 'lThigh',      thick: 13 },
      { name: 'lShin',       thick: 12 },
      { name: 'rThigh',      thick: 13 },
      { name: 'rShin',       thick: 12 },
    ];

    // Create bone divs (rectangles)
    for (const cfg of boneConfigs) {
      const el = document.createElement('div');
      el.className = 'dancer-bone';
      const br = cfg.thick / 2;
      el.style.cssText = `
        position:absolute;pointer-events:none;
        will-change:transform;transform:translateZ(0);
        -webkit-backface-visibility:hidden;backface-visibility:hidden;
        border-radius:${br}px;
        background:rgba(8,8,18,0.85);
        box-shadow:0 0 10px ${glowColor},0 0 25px ${glowColor2},0 0 50px ${glowColor3};
      `;
      wrapper.appendChild(el);
      bones[cfg.name] = el;
    }

    // Head (circle)
    const head = document.createElement('div');
    head.className = 'dancer-bone';
    head.style.cssText = `
      position:absolute;pointer-events:none;
      will-change:transform;transform:translateZ(0);
      -webkit-backface-visibility:hidden;backface-visibility:hidden;
      border-radius:50%;
      background:rgba(8,8,18,0.85);
      box-shadow:0 0 12px ${glowColor},0 0 30px ${glowColor2},0 0 55px ${glowColor3};
    `;
    wrapper.appendChild(head);
    bones.head = head;

    // Hands (circles)
    for (const handName of ['lHand', 'rHand']) {
      const el = document.createElement('div');
      el.className = 'dancer-bone';
      el.style.cssText = `
        position:absolute;pointer-events:none;
        will-change:transform;transform:translateZ(0);
        -webkit-backface-visibility:hidden;backface-visibility:hidden;
        border-radius:50%;
        background:rgba(8,8,18,0.85);
        box-shadow:0 0 8px ${glowColor},0 0 20px ${glowColor2};
      `;
      wrapper.appendChild(el);
      bones[handName] = el;
    }

    // Feet glow (ellipse at base)
    const feetGlow = document.createElement('div');
    feetGlow.className = 'dancer-bone';
    feetGlow.style.cssText = `
      position:absolute;pointer-events:none;
      will-change:transform,opacity;transform:translateZ(0);
      -webkit-backface-visibility:hidden;backface-visibility:hidden;
      border-radius:50%;
      background:${dancer.color};
      opacity:0;
    `;
    wrapper.appendChild(feetGlow);
    bones.feetGlow = feetGlow;

    container.appendChild(wrapper);
    return { wrapper, bones, dancer };
  }

  // ── Initialize all dancer DOM elements ──
  function init() {
    if (initialized) return;
    for (const dancer of dancers) {
      const dom = createDancerDOM(dancer);
      if (dom) dancerDOM.push(dom);
    }
    initialized = true;
  }

  // ── Update a bone div connecting two joints ──
  function updateBone(el, x1, y1, x2, y2, thickness, scale) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.5) { el.style.display = 'none'; return; }
    const angle = Math.atan2(dy, dx);
    const t = thickness * scale;
    el.style.display = '';
    el.style.width = len + 'px';
    el.style.height = t + 'px';
    el.style.transformOrigin = '0 50%';
    el.style.transform = `translate(${x1}px,${y1 - t / 2}px) rotate(${angle}rad)`;
  }

  // ── Update a circular element (head/hand) ──
  function updateCircle(el, x, y, radius, scale) {
    const r = radius * scale;
    el.style.width = r * 2 + 'px';
    el.style.height = r * 2 + 'px';
    el.style.transform = `translate(${x - r}px,${y - r}px)`;
  }

  // ── Forward Kinematics ──
  function calculateJoints(hipX, hipY, pose, scale, flip) {
    const s = scale;
    const torsoAngle = -Math.PI / 2 + pose.lean;
    const neckX = hipX + Math.cos(torsoAngle) * BONE.torso * s;
    const neckY = hipY + Math.sin(torsoAngle) * BONE.torso * s;

    const headAngle = torsoAngle + pose.headBob;
    const headX = neckX + Math.cos(headAngle) * BONE.neck * s;
    const headY = neckY + Math.sin(headAngle) * BONE.neck * s;

    const perpAngle = torsoAngle + Math.PI / 2;
    const lShoulderX = neckX + Math.cos(perpAngle) * BONE.shoulderW * s * (flip ? -1 : 1);
    const lShoulderY = neckY + Math.sin(perpAngle) * BONE.shoulderW * s * (flip ? -1 : 1);
    const rShoulderX = neckX - Math.cos(perpAngle) * BONE.shoulderW * s * (flip ? -1 : 1);
    const rShoulderY = neckY - Math.sin(perpAngle) * BONE.shoulderW * s * (flip ? -1 : 1);

    const lArmDir = flip ? -1 : 1;
    const lUpperArmAngle = Math.PI / 2 - pose.lArm * lArmDir;
    const lElbowX = lShoulderX + Math.cos(lUpperArmAngle) * BONE.upperArm * s;
    const lElbowY = lShoulderY + Math.sin(lUpperArmAngle) * BONE.upperArm * s;
    const lForearmAngle = lUpperArmAngle - pose.lElbow * lArmDir;
    const lHandX = lElbowX + Math.cos(lForearmAngle) * BONE.forearm * s;
    const lHandY = lElbowY + Math.sin(lForearmAngle) * BONE.forearm * s;

    const rArmDir = flip ? 1 : -1;
    const rUpperArmAngle = Math.PI / 2 - pose.rArm * rArmDir;
    const rElbowX = rShoulderX + Math.cos(rUpperArmAngle) * BONE.upperArm * s;
    const rElbowY = rShoulderY + Math.sin(rUpperArmAngle) * BONE.upperArm * s;
    const rForearmAngle = rUpperArmAngle - pose.rElbow * rArmDir;
    const rHandX = rElbowX + Math.cos(rForearmAngle) * BONE.forearm * s;
    const rHandY = rElbowY + Math.sin(rForearmAngle) * BONE.forearm * s;

    const lHipX = hipX + Math.cos(perpAngle) * BONE.hipW * s * (flip ? -1 : 1);
    const lHipY = hipY + Math.sin(perpAngle) * BONE.hipW * s * (flip ? -1 : 1);
    const rHipX = hipX - Math.cos(perpAngle) * BONE.hipW * s * (flip ? -1 : 1);
    const rHipY = hipY - Math.sin(perpAngle) * BONE.hipW * s * (flip ? -1 : 1);

    const lLegDir = flip ? -1 : 1;
    const lThighAngle = Math.PI / 2 + pose.lLeg * lLegDir;
    const lKneeX = lHipX + Math.cos(lThighAngle) * BONE.thigh * s;
    const lKneeY = lHipY + Math.sin(lThighAngle) * BONE.thigh * s;
    const lShinAngle = lThighAngle + pose.lKnee;
    const lFootX = lKneeX + Math.cos(lShinAngle) * BONE.shin * s;
    const lFootY = lKneeY + Math.sin(lShinAngle) * BONE.shin * s;

    const rLegDir = flip ? 1 : -1;
    const rThighAngle = Math.PI / 2 + pose.rLeg * rLegDir;
    const rKneeX = rHipX + Math.cos(rThighAngle) * BONE.thigh * s;
    const rKneeY = rHipY + Math.sin(rThighAngle) * BONE.thigh * s;
    const rShinAngle = rThighAngle + pose.rKnee;
    const rFootX = rKneeX + Math.cos(rShinAngle) * BONE.shin * s;
    const rFootY = rKneeY + Math.sin(rShinAngle) * BONE.shin * s;

    return {
      hip: { x: hipX, y: hipY }, neck: { x: neckX, y: neckY },
      head: { x: headX, y: headY },
      lShoulder: { x: lShoulderX, y: lShoulderY },
      rShoulder: { x: rShoulderX, y: rShoulderY },
      lElbow: { x: lElbowX, y: lElbowY }, lHand: { x: lHandX, y: lHandY },
      rElbow: { x: rElbowX, y: rElbowY }, rHand: { x: rHandX, y: rHandY },
      lHip: { x: lHipX, y: lHipY }, rHip: { x: rHipX, y: rHipY },
      lKnee: { x: lKneeX, y: lKneeY }, lFoot: { x: lFootX, y: lFootY },
      rKnee: { x: rKneeX, y: rKneeY }, rFoot: { x: rFootX, y: rFootY },
    };
  }

  // ── Main Render - CSS transform updates only, ZERO canvas calls ──
  function render(effect, audio, t) {
    // Initialize DOM elements on first call
    if (!initialized) init();

    const intensity = effect.intensity;
    const bass = audio.bass || 0;
    const bp = audio.beatPulse || 0;

    for (const dom of dancerDOM) {
      const d = dom.dancer;
      const style = STYLES[d.style];
      if (!style) continue;

      if (!effect.enabled) {
        dom.wrapper.style.display = 'none';
        continue;
      }

      dom.wrapper.style.display = '';
      // Modulate opacity based on beat pulse - GPU-composited!
      dom.wrapper.style.opacity = (0.55 + intensity * 0.35 + bp * 0.1).toFixed(2);

      const dt = t * style.speed + d.phase;
      const pose = style.getPose(dt, bass, bp);

      const xPositions = d.side === 'left' ? LEFT_X : RIGHT_X;
      const baseX = xPositions[d.slot] || xPositions[0];
      const baseY = H - 20;

      const hipX = baseX + pose.sway;
      const hipY = baseY - pose.bounce - 30;

      const flip = d.side === 'right';
      const j = calculateJoints(hipX, hipY, pose, d.scale, flip);
      const s = d.scale;

      // Update all bone positions via CSS transforms
      updateBone(dom.bones.torso, j.hip.x, j.hip.y, j.neck.x, j.neck.y, 20, s);
      updateBone(dom.bones.neck, j.neck.x, j.neck.y, j.head.x, j.head.y, 9, s);
      updateCircle(dom.bones.head, j.head.x, j.head.y, BONE.headR, s);

      updateBone(dom.bones.lUpperArm, j.lShoulder.x, j.lShoulder.y, j.lElbow.x, j.lElbow.y, 11, s);
      updateBone(dom.bones.lForearm, j.lElbow.x, j.lElbow.y, j.lHand.x, j.lHand.y, 10, s);
      updateCircle(dom.bones.lHand, j.lHand.x, j.lHand.y, BONE.handR, s);

      updateBone(dom.bones.rUpperArm, j.rShoulder.x, j.rShoulder.y, j.rElbow.x, j.rElbow.y, 11, s);
      updateBone(dom.bones.rForearm, j.rElbow.x, j.rElbow.y, j.rHand.x, j.rHand.y, 10, s);
      updateCircle(dom.bones.rHand, j.rHand.x, j.rHand.y, BONE.handR, s);

      updateBone(dom.bones.lThigh, j.lHip.x, j.lHip.y, j.lKnee.x, j.lKnee.y, 13, s);
      updateBone(dom.bones.lShin, j.lKnee.x, j.lKnee.y, j.lFoot.x, j.lFoot.y, 12, s);

      updateBone(dom.bones.rThigh, j.rHip.x, j.rHip.y, j.rKnee.x, j.rKnee.y, 13, s);
      updateBone(dom.bones.rShin, j.rKnee.x, j.rKnee.y, j.rFoot.x, j.rFoot.y, 12, s);

      // Beat flash at feet - opacity modulation (GPU-composited)
      if (bp > 0.3) {
        const feetGlow = dom.bones.feetGlow;
        feetGlow.style.display = '';
        feetGlow.style.width = (100 * s) + 'px';
        feetGlow.style.height = (20 * s) + 'px';
        feetGlow.style.transform = `translate(${hipX - 50 * s}px,${hipY}px)`;
        feetGlow.style.opacity = (bp * 0.4 * intensity).toFixed(2);
      } else {
        dom.bones.feetGlow.style.display = 'none';
      }
    }
  }

  return { render };
})();
