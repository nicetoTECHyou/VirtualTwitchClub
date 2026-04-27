// ═══════════════════════════════════════════════════════════════
// TwitchDancefloor - Audio Analyzer v8
// REVOLUTIONARY: Autocorrelation-based BPM detection!
// Industry-standard algorithm used by DJ software
// + Onset-based beat detection (not raw bass threshold)
// + Octave correction (prefer 100-180 BPM range)
// ═══════════════════════════════════════════════════════════════

const AudioAnalyzer = (() => {
  let audioCtx = null;
  let analyser = null;
  let source = null;
  let currentStream = null;
  let dataArray = null;
  let sensitivity = 1.0;
  let currentSourceName = 'Keine';

  // ── Analysis loop (internal, fixed 30fps) ──
  let analysisTimer = null;
  const ANALYSIS_FPS = 30;
  const ANALYSIS_INTERVAL = Math.round(1000 / ANALYSIS_FPS);

  // Cached result - getData() just returns this, NO side effects
  let cachedData = {
    bass: 0, mid: 0, high: 0, volume: 0,
    beat: false, beatPulse: 0, bpm: 120,
    eqBands: new Array(64).fill(0),
    sourceName: 'Keine'
  };

  // ── Smoothed frequency values ──
  let smoothBass = 0, smoothMid = 0, smoothHigh = 0, smoothVol = 0;
  let prevBass = 0;

  // ── Onset-based beat detection ──
  // Instead of raw bass threshold, detect sudden INCREASES in bass
  const ONSET_HISTORY_SIZE = 60; // 2 seconds at 30fps
  let onsetHistory = new Float32Array(ONSET_HISTORY_SIZE);
  let onsetIdx = 0;
  let onsetHistoryFilled = false;
  let lastBeatTime = 0;
  let beatDecay = 0;

  // ── Autocorrelation BPM estimation ──
  // Buffer of onset strengths for autocorrelation analysis
  const AC_BUFFER_SIZE = 180; // 6 seconds at 30fps - enough for tempo analysis
  let acBuffer = new Float32Array(AC_BUFFER_SIZE);
  let acIdx = 0;
  let acBufferFilled = false;
  let estimatedBPM = 120;
  let bpmConfidence = 0; // 0-1, how confident we are in the BPM
  let lastBPMEstimateTime = 0;

  // 64-band equalizer
  const EQ_BANDS = 64;
  const eqSmooth = new Float32Array(EQ_BANDS);
  const eqBands = new Float32Array(EQ_BANDS);

  // ── Initialization ──
  function init() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.7;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
  }

  // ── Start internal analysis loop ──
  function startAnalysis() {
    if (analysisTimer) return;
    console.log('[Audio] Starting analysis at', ANALYSIS_FPS, 'fps');
    analysisTimer = setInterval(analyze, ANALYSIS_INTERVAL);
  }

  // ── Stop internal analysis loop ──
  function stopAnalysis() {
    if (analysisTimer) {
      clearInterval(analysisTimer);
      analysisTimer = null;
    }
    beatDecay = 0;
    prevBass = 0;
    smoothBass = 0; smoothMid = 0; smoothHigh = 0; smoothVol = 0;
    onsetHistory = new Float32Array(ONSET_HISTORY_SIZE);
    onsetIdx = 0;
    onsetHistoryFilled = false;
    acBuffer = new Float32Array(AC_BUFFER_SIZE);
    acIdx = 0;
    acBufferFilled = false;
    lastBeatTime = 0;
    beatTimes = [];
    estimatedBPM = 120;
    bpmConfidence = 0;
    eqSmooth.fill(0);
    eqBands.fill(0);
    cachedData = {
      bass: 0, mid: 0, high: 0, volume: 0,
      beat: false, beatPulse: 0, bpm: 120,
      eqBands: new Array(64).fill(0),
      sourceName: currentSourceName
    };
    console.log('[Audio] Analysis stopped');
  }

  // ── Source management ──
  function disconnectSource() {
    if (source) {
      try { source.disconnect(); } catch (e) {}
      source = null;
    }
    if (currentStream) {
      currentStream.getTracks().forEach(t => t.stop());
      currentStream = null;
    }
  }

  // ── Enumerate all audio input devices ──
  async function getDeviceList() {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      tempStream.getTracks().forEach(t => t.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({
          id: d.deviceId,
          name: d.label || `Audio-Gerät (${d.deviceId.slice(0, 8)}...)`,
          kind: d.kind
        }));
      console.log('[Audio] Found', audioInputs.length, 'audio input devices');
      return audioInputs;
    } catch (e) {
      console.error('[Audio] Enumerate error:', e.message);
      return [];
    }
  }

  // ── Connect to specific device by ID ──
  async function connectDevice(deviceId, deviceName) {
    try {
      init();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const constraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
          channelCount: 2
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      disconnectSource();
      stopAnalysis();
      currentStream = stream;
      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      currentSourceName = deviceName || 'Audio-Gerät';
      startAnalysis();
      console.log('[Audio] Device connected:', currentSourceName);
      return true;
    } catch (e) {
      console.error('[Audio] Device connect error:', e.message);
      return false;
    }
  }

  // ── Connect microphone (default) ──
  async function connectMic() {
    try {
      init();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      disconnectSource();
      stopAnalysis();
      currentStream = stream;
      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      currentSourceName = 'Mikrofon';
      startAnalysis();
      console.log('[Audio] Microphone connected');
      return true;
    } catch (e) { console.error('[Audio] Mic error:', e.message); return false; }
  }

  // ── Connect desktop audio (screen share) ──
  async function connectDesktop() {
    try {
      init();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1, height: 1, frameRate: 1 },
        audio: true
      });
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getVideoTracks().forEach(t => t.stop());
        console.warn('[Audio] No audio in desktop capture - did you check "Share audio"?');
        currentSourceName = 'Fehler: Kein Desktop-Audio';
        return false;
      }
      stream.getVideoTracks().forEach(t => t.stop());
      disconnectSource();
      stopAnalysis();
      currentStream = stream;
      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      currentSourceName = 'Desktop Audio';
      startAnalysis();
      console.log('[Audio] Desktop audio connected:', audioTracks[0].label);
      return true;
    } catch (e) {
      console.error('[Audio] Desktop error:', e.message);
      currentSourceName = 'Fehler: ' + e.message;
      return false;
    }
  }

  // ── Connect audio file ──
  function connectFile(file) {
    try {
      init();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const url = URL.createObjectURL(file);
      const audio = new Audio(url);
      audio.crossOrigin = 'anonymous';
      audio.loop = true;
      audio.volume = 1.0;
      const sourceNode = audioCtx.createMediaElementSource(audio);
      disconnectSource();
      stopAnalysis();
      source = sourceNode;
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      audio.play();
      currentSourceName = 'Datei: ' + file.name;
      startAnalysis();
      console.log('[Audio] File playback started:', file.name);
      return true;
    } catch (e) { console.error('[Audio] File error:', e.message); return false; }
  }

  // ── Disconnect everything ──
  function disconnect() {
    stopAnalysis();
    disconnectSource();
    currentSourceName = 'Keine';
    console.log('[Audio] Disconnected');
  }

  // ── Get current source name ──
  function getSourceName() { return currentSourceName; }

  // ═══════════════════════════════════════════════════════════════
  // AUTOCORRELATION BPM DETECTION
  // The industry-standard algorithm used by DJ software (Traktor, etc.)
  //
  // How it works:
  // 1. Collect "onset envelope" - the rate of change in bass energy
  // 2. Compute autocorrelation - compare the signal with delayed versions
  // 3. The delay (lag) with highest correlation = beat period = BPM
  // 4. Apply octave correction (prefer 100-180 BPM range)
  //
  // Why this is better than simple threshold:
  // - Doesn't depend on absolute volume levels
  // - Works even if beats are soft or irregular
  // - No feedback loop (old bug: wrong BPM → wrong interval → wrong beats)
  // ═══════════════════════════════════════════════════════════════

  function estimateBPMAutocorrelation() {
    // Need at least 3 seconds of data for reliable estimation
    const filledLen = acBufferFilled ? AC_BUFFER_SIZE : acIdx;
    if (filledLen < 90) return; // Need at least 3 seconds

    // BPM range to search: 70-200 BPM
    // At 30fps: 70 BPM = lag of 25.7 frames, 200 BPM = lag of 9 frames
    const minLag = Math.floor(ANALYSIS_FPS * 60 / 200); // 9 frames = 200 BPM
    const maxLag = Math.floor(ANALYSIS_FPS * 60 / 70);  // 25 frames = 70 BPM

    // Compute autocorrelation for each candidate lag
    let bestLag = minLag;
    let bestCorr = -Infinity;
    let secondBestCorr = -Infinity;

    const correlations = [];

    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      let count = 0;

      // Compare signal with itself shifted by 'lag' frames
      for (let i = 0; i < filledLen - lag; i++) {
        const idx1 = (acIdx - filledLen + i + AC_BUFFER_SIZE) % AC_BUFFER_SIZE;
        const idx2 = (acIdx - filledLen + i + lag + AC_BUFFER_SIZE) % AC_BUFFER_SIZE;
        sum += acBuffer[idx1] * acBuffer[idx2];
        count++;
      }

      const corr = count > 0 ? sum / count : 0;
      correlations.push({ lag, corr });

      if (corr > bestCorr) {
        secondBestCorr = bestCorr;
        bestCorr = corr;
        bestLag = lag;
      } else if (corr > secondBestCorr) {
        secondBestCorr = corr;
      }
    }

    if (bestCorr <= 0) return;

    // Convert best lag to BPM
    let rawBPM = (ANALYSIS_FPS * 60) / bestLag;

    // ── Octave Correction ──
    // Autocorrelation often detects half-tempo or double-tempo.
    // For electronic music (our main use case), prefer 100-180 BPM.
    // If BPM is below 100, it's likely a half-tempo detection → multiply by 2
    // If BPM is above 200, it's likely double-tempo → divide by 2
    if (rawBPM < 80) {
      rawBPM *= 2; // Half-tempo detected, correct upward
    } else if (rawBPM > 80 && rawBPM < 100) {
      // Check if double-tempo makes more sense
      // If the correlation at half the lag is strong, double it
      const halfLag = Math.round(bestLag / 2);
      if (halfLag >= minLag) {
        const halfCorr = correlations.find(c => c.lag === halfLag);
        if (halfCorr && halfCorr.corr > bestCorr * 0.6) {
          rawBPM *= 2; // Strong correlation at double-tempo
        }
      }
    } else if (rawBPM > 200) {
      rawBPM /= 2; // Double-tempo detected, correct downward
    }

    // Clamp to reasonable range
    rawBPM = Math.max(60, Math.min(220, rawBPM));

    // Confidence: ratio of best to second-best correlation
    bpmConfidence = secondBestCorr > 0 ? Math.min(1, bestCorr / secondBestCorr) : 1;

    // Smooth BPM changes - don't jump wildly
    // Only update if confidence is reasonable
    if (bpmConfidence > 0.7) {
      const blendFactor = 0.25; // Slow convergence
      estimatedBPM = estimatedBPM * (1 - blendFactor) + rawBPM * blendFactor;
    } else if (bpmConfidence > 0.5) {
      // Low confidence - even slower convergence
      estimatedBPM = estimatedBPM * 0.95 + rawBPM * 0.05;
    }
    // Very low confidence: don't update at all

    // Round to nearest integer for display
    estimatedBPM = Math.round(estimatedBPM);
  }

  // ═══════════════════════════════════════════════════════════════
  // INTERNAL ANALYSIS - Runs at exactly 30fps, updates cachedData
  // ═══════════════════════════════════════════════════════════════
  function analyze() {
    if (!analyser || !dataArray) return;

    analyser.getByteFrequencyData(dataArray);

    const len = dataArray.length;
    const sampleRate = audioCtx.sampleRate;
    const binHz = sampleRate / analyser.fftSize;

    // ── Frequency bands ──
    // Bass: 40-200 Hz (kick drum territory)
    const bassStart = Math.floor(40 / binHz);
    const bassEnd = Math.min(Math.floor(200 / binHz), len);
    const midEnd = Math.min(Math.floor(3000 / binHz), len);
    const highEnd = Math.min(Math.floor(12000 / binHz), len);

    let bassSum = 0, midSum = 0, highSum = 0, totalSum = 0;
    for (let i = 0; i < len; i++) {
      const val = dataArray[i] / 255;
      totalSum += val;
      if (i >= bassStart && i < bassEnd) bassSum += val;
      else if (i < midEnd) midSum += val;
      else if (i < highEnd) highSum += val;
    }

    // Weighted frequency bands
    const rawBass = (bassSum / Math.max(bassEnd - bassStart, 1)) * sensitivity * 1.2;
    const rawMid = (midSum / Math.max(midEnd - bassEnd, 1)) * sensitivity * 0.8;
    const rawHigh = (highSum / Math.max(highEnd - midEnd, 1)) * sensitivity * 0.7;
    const rawVol = (totalSum / len) * sensitivity * 0.8;

    // Smoothing - tuned for 30fps analysis rate
    smoothBass = smoothBass * 0.55 + rawBass * 0.45;
    smoothMid = smoothMid * 0.6 + rawMid * 0.4;
    smoothHigh = smoothHigh * 0.6 + rawHigh * 0.4;
    smoothVol = smoothVol * 0.6 + rawVol * 0.4;

    // ── 64-band Equalizer ──
    for (let i = 0; i < EQ_BANDS; i++) {
      const t = i / EQ_BANDS;
      const freq = 40 * Math.pow(400, t);
      const freqIdx = Math.min(Math.floor(freq / binHz), len - 1);
      const raw = (dataArray[freqIdx] || 0) / 255;
      eqSmooth[i] += (raw - eqSmooth[i]) * 0.35;
      eqBands[i] = eqSmooth[i];
    }

    // ═══════════════════════════════════════════════════════════════
    // ONSET-BASED BEAT DETECTION
    // Detect sudden INCREASES in bass energy (onsets), not absolute levels
    // This is far more accurate than simple threshold detection
    // ═══════════════════════════════════════════════════════════════

    // Onset strength = positive change in bass (only increases matter)
    const onsetStrength = Math.max(0, smoothBass - prevBass) * 3.0;

    // Store in onset history for threshold calculation
    onsetHistory[onsetIdx] = onsetStrength;
    onsetIdx = (onsetIdx + 1) % onsetHistory.length;
    if (onsetIdx === 0) onsetHistoryFilled = true;

    // Also store in autocorrelation buffer
    acBuffer[acIdx] = onsetStrength;
    acIdx = (acIdx + 1) % AC_BUFFER_SIZE;
    if (acIdx === 0) acBufferFilled = true;

    // Calculate average onset strength from history
    const historyLen = onsetHistoryFilled ? onsetHistory.length : onsetIdx;
    let onsetAvg = 0;
    for (let i = 0; i < historyLen; i++) onsetAvg += onsetHistory[i];
    onsetAvg /= Math.max(historyLen, 1);

    const now = performance.now();

    // Beat detection conditions - IMPROVED:
    // 1. Onset strength must exceed average by factor (adaptive threshold)
    // 2. Must exceed minimum threshold (avoid triggering on silence)
    // 3. Must have minimum interval between beats (based on BPM range)
    // 4. NO FEEDBACK LOOP: minInterval is based on BPM range, not estimatedBPM

    // Fixed minimum beat interval: 270ms corresponds to ~222 BPM max
    // This prevents double-triggering without creating a feedback loop
    const minBeatInterval = 270; // Fixed! Not based on estimatedBPM
    const isAboveThreshold = onsetStrength > Math.max(onsetAvg * 1.5, 0.08);
    const hasCooldownElapsed = (now - lastBeatTime) > minBeatInterval;

    // Also check that bass is actually present (avoid false triggers in silence)
    const bassIsPresent = smoothBass > 0.15;

    const isBeat = isAboveThreshold && hasCooldownElapsed && bassIsPresent;

    if (isBeat) {
      lastBeatTime = now;
      beatDecay = 1.0;
    }

    // ── BPM Estimation via Autocorrelation ──
    // Run every 500ms (not every frame - it's computationally heavier)
    if (now - lastBPMEstimateTime > 500) {
      estimateBPMAutocorrelation();
      lastBPMEstimateTime = now;
    }

    // Beat pulse decay - tuned for 30fps
    beatDecay *= 0.82;
    prevBass = smoothBass;

    // Update cached data
    cachedData = {
      bass: Math.min(smoothBass, 1),
      mid: Math.min(smoothMid, 1),
      high: Math.min(smoothHigh, 1),
      volume: Math.min(smoothVol, 1),
      beat: isBeat,
      beatPulse: beatDecay,
      bpm: estimatedBPM,
      eqBands: Array.from(eqBands),
      sourceName: currentSourceName
    };
  }

  // ── PUBLIC: Get data - PURE READ, no side effects! ──
  function getData() { return cachedData; }

  function isConnected() { return analyser !== null && source !== null; }

  return {
    connectMic, connectDesktop, connectFile, connectDevice,
    disconnect, getDeviceList, getData, getSourceName,
    setSensitivity: (s) => { sensitivity = s; },
    isConnected, startAnalysis, stopAnalysis,
    EQ_BANDS
  };
})();
