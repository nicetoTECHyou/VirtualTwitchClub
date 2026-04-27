// ═══════════════════════════════════════════════════════════════
// TwitchDancefloor - Overlay Main Loop v8
// HALF-RESOLUTION canvas: 960x540 internal, CSS scaled to 1920x1080
// Dancers now use CSS/GPU (ZERO canvas draw calls!)
// Frame rate capped at 30fps (OBS doesn't need more)
// TRANSPARENT background for OBS Browser Source
// ═══════════════════════════════════════════════════════════════
(function () {
  const canvas = document.getElementById('overlay');
  const ctx = canvas.getContext('2d');

  // ═══ HALF-RESOLUTION RENDERING ═══
  const W = 1920, H = 1080;
  ctx.scale(0.5, 0.5);
  ctx.imageSmoothingEnabled = true;

  let effects = [];
  let startTime = performance.now();
  let connected = false;

  // Frame rate limiter - 30fps max
  const TARGET_FPS = 30;
  const FRAME_INTERVAL = 1000 / TARGET_FPS;
  let lastFrameTime = 0;

  // Default audio data
  let currentAudio = {
    bass: 0, mid: 0, high: 0, volume: 0,
    beat: false, beatPulse: 0, bpm: 120,
    eqBands: new Array(64).fill(0)
  };

  // ── Connect WebSocket ──
  OverlaySocket.connect();

  OverlaySocket.on('connected', (state) => {
    connected = state;
    const dot = document.getElementById('status-dot');
    if (dot) dot.classList.toggle('connected', state);
  });

  OverlaySocket.on('effects-state', (data) => { effects = data; });
  OverlaySocket.on('effect-update', (data) => {
    const idx = effects.findIndex(e => e.id === data.id);
    if (idx !== -1) effects[idx] = data;
    else effects.push(data);
  });

  OverlaySocket.on('audio-data', (data) => {
    currentAudio = data;
    if (!currentAudio.eqBands) currentAudio.eqBands = new Array(64).fill(0);
  });

  // ── Main Render Loop with FPS cap ──
  function render(timestamp) {
    requestAnimationFrame(render);

    const elapsed = timestamp - lastFrameTime;
    if (elapsed < FRAME_INTERVAL) return;
    lastFrameTime = timestamp - (elapsed % FRAME_INTERVAL);

    const t = (performance.now() - startTime) / 1000;

    // Local beatPulse decay between server updates
    if (!currentAudio.beat) {
      currentAudio.beatPulse *= 0.85;
    }

    // Clear canvas - fully transparent for OBS
    ctx.clearRect(0, 0, W, H);

    // Render all effects on canvas (batched for performance)
    EffectsRenderer.render(ctx, effects, currentAudio, t);

    // Render dancers via CSS/GPU (NO canvas draw calls!)
    const dancerEffect = effects.find(e => e.id === 'dancers');
    if (dancerEffect) {
      DancersRenderer.render(dancerEffect, currentAudio, t);
    }
  }

  requestAnimationFrame(render);
})();
