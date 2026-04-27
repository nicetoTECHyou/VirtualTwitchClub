// ═══════════════════════════════════════════════════════════════
// TwitchDancefloor - Admin Panel Logic v9
// FIXED: getData() is now a pure read (no side effects)
// AudioAnalyzer runs its own analysis loop at 30fps internally
// Admin just reads cached data for broadcast + local meters
// NEW: Full Scene CRUD (Create, Read, Update, Delete)
// ═══════════════════════════════════════════════════════════════
(function () {
  let effects = [];
  let commands = [];
  let scenes = [];
  let channelConfig = { channelName: '', connected: false };
  let chatMessages = [];
  let audioConnected = false;
  let audioSendInterval = null;

  // Scene editor state
  let editingSceneId = null; // null = new scene, string = editing existing

  // ── Connect WebSocket ──
  OverlaySocket.connect();

  OverlaySocket.on('connected', (state) => {
    const el = document.getElementById('ws-status');
    if (el) {
      el.querySelector('.status-dot').classList.toggle('connected', state);
      el.querySelector('.status-text').textContent = state ? 'Verbunden' : 'Getrennt';
    }
  });

  OverlaySocket.on('effects-state', (data) => { effects = data; renderEffects(); });
  OverlaySocket.on('effect-update', (data) => {
    const idx = effects.findIndex(e => e.id === data.id);
    if (idx !== -1) effects[idx] = data; else effects.push(data);
    renderEffects();
  });

  OverlaySocket.on('commands-state', (data) => { commands = data; renderCommands(); populateEffectDropdown(); });

  OverlaySocket.on('scenes-state', (data) => { scenes = data; renderScenes(); });

  OverlaySocket.on('scene-applied', (data) => {
    // Show feedback in chat log
    chatMessages.push({ username: 'System', content: `${data.username} aktivierte Scene: ${data.sceneName}`, timestamp: Date.now(), isSystem: true });
    if (chatMessages.length > 100) chatMessages.shift();
    renderChatLog();
    // Highlight the applied scene briefly
    highlightScene(data.sceneId);
  });

  OverlaySocket.on('channel-status', (data) => {
    channelConfig = data;
    updateChannelUI();
  });

  OverlaySocket.on('chat-message', (msg) => {
    chatMessages.push(msg);
    if (chatMessages.length > 100) chatMessages.shift();
    renderChatLog();
  });

  OverlaySocket.on('chat-trigger', (data) => {
    chatMessages.push({ username: 'System', content: `${data.username} triggered ${data.command} \u2192 ${data.effectName}`, timestamp: Date.now(), isSystem: true });
    if (chatMessages.length > 100) chatMessages.shift();
    renderChatLog();
  });

  // ── Navigation ──
  document.querySelectorAll('.nav-btn[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-' + btn.dataset.panel).classList.add('active');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // AUDIO SOURCE - Device Enumeration & Connection
  // ═══════════════════════════════════════════════════════════

  const deviceSelect = document.getElementById('audio-device-select');
  const btnRefresh = document.getElementById('btn-refresh-devices');
  const btnConnectDevice = document.getElementById('btn-connect-device');
  const btnDesktop = document.getElementById('btn-audio-desktop');
  const btnFile = document.getElementById('btn-audio-file');
  const fileInput = document.getElementById('audio-file-input');
  const audioDot = document.getElementById('audio-dot');
  const audioStatusText = document.getElementById('audio-status-text');
  const btnDisconnectAudio = document.getElementById('btn-disconnect-audio');
  const sensSlider = document.getElementById('admin-sensitivity');
  const sensValue = document.getElementById('sens-value');
  const waveformCanvas = document.getElementById('waveform-canvas');

  // ── Enumerate audio devices ──
  async function refreshDeviceList() {
    const devices = await AudioAnalyzer.getDeviceList();
    const currentVal = deviceSelect.value;
    deviceSelect.innerHTML = '<option value="">-- Ger&auml;t w&auml;hlen --</option>';
    for (const dev of devices) {
      const opt = document.createElement('option');
      opt.value = dev.id;
      opt.textContent = dev.name;
      deviceSelect.appendChild(opt);
    }
    if (currentVal) {
      const found = devices.find(d => d.id === currentVal);
      if (found) deviceSelect.value = currentVal;
    }
  }

  btnRefresh.addEventListener('click', refreshDeviceList);

  // ── Connect to selected device ──
  btnConnectDevice.addEventListener('click', async () => {
    const deviceId = deviceSelect.value;
    if (!deviceId) { alert('Bitte w\u00e4hle ein Audio-Ger\u00e4t aus dem Dropdown.'); return; }
    const deviceName = deviceSelect.options[deviceSelect.selectedIndex]?.textContent || 'Audio-Ger\u00e4t';
    const success = await AudioAnalyzer.connectDevice(deviceId, deviceName);
    if (success) {
      updateAudioStatus(true, deviceName);
      startAudioBroadcast();
    } else {
      updateAudioStatus(false, 'Verbindung fehlgeschlagen');
    }
  });

  deviceSelect.addEventListener('dblclick', () => btnConnectDevice.click());

  // ── Desktop Audio ──
  btnDesktop.addEventListener('click', async () => {
    const success = await AudioAnalyzer.connectDesktop();
    if (success) {
      updateAudioStatus(true, 'Desktop Audio');
      startAudioBroadcast();
    } else {
      updateAudioStatus(false, 'Desktop Audio nicht verf\u00fcgbar');
    }
  });

  // ── Audio File ──
  btnFile.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      const success = AudioAnalyzer.connectFile(e.target.files[0]);
      if (success) {
        updateAudioStatus(true, 'Datei: ' + e.target.files[0].name);
        startAudioBroadcast();
      }
    }
  });

  // ── Disconnect audio ──
  btnDisconnectAudio.addEventListener('click', () => {
    AudioAnalyzer.disconnect();
    updateAudioStatus(false, 'Getrennt');
    stopAudioBroadcast();
  });

  // ── Sensitivity ──
  sensSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    sensValue.textContent = val.toFixed(1);
    AudioAnalyzer.setSensitivity(val);
  });

  // ── Audio status UI ──
  function updateAudioStatus(connected, sourceName) {
    audioConnected = connected;
    audioDot.classList.toggle('connected', connected);
    audioStatusText.textContent = connected ? `Verbunden: ${sourceName}` : sourceName || 'Keine Audio-Quelle verbunden';
    btnDisconnectAudio.style.display = connected ? 'inline-block' : 'none';
  }

  // ═══════════════════════════════════════════════════════════
  // AUDIO BROADCAST
  // ═══════════════════════════════════════════════════════════

  function startAudioBroadcast() {
    if (audioSendInterval) clearInterval(audioSendInterval);
    audioSendInterval = setInterval(() => {
      if (!AudioAnalyzer.isConnected()) return;
      const data = AudioAnalyzer.getData();
      OverlaySocket.emit('audio-data', data);
    }, 40);
  }

  function stopAudioBroadcast() {
    if (audioSendInterval) {
      clearInterval(audioSendInterval);
      audioSendInterval = null;
    }
    OverlaySocket.emit('audio-data', {
      bass: 0, mid: 0, high: 0, volume: 0,
      beat: false, beatPulse: 0, bpm: 120,
      eqBands: new Array(64).fill(0),
      sourceName: 'Keine'
    });
  }

  // ═══════════════════════════════════════════════════════════
  // LOCAL LEVEL METERS + WAVEFORM
  // ═══════════════════════════════════════════════════════════

  const wfCtx = waveformCanvas ? waveformCanvas.getContext('2d') : null;
  const WF_W = 500, WF_H = 80;

  function updateLocalMeters() {
    if (!AudioAnalyzer.isConnected()) {
      requestAnimationFrame(updateLocalMeters);
      return;
    }

    const data = AudioAnalyzer.getData();

    const bars = { bass: data.bass, mid: data.mid, high: data.high, vol: data.volume };
    for (const [key, val] of Object.entries(bars)) {
      const fill = document.getElementById('level-' + key);
      const valEl = document.getElementById('val-' + key);
      if (fill) fill.style.width = Math.round(val * 100) + '%';
      if (valEl) valEl.textContent = Math.round(val * 100) + '%';
    }

    const meters = { 'meter-bass': data.bass, 'meter-mid': data.mid, 'meter-high': data.high, 'meter-vol': data.volume };
    for (const [id, val] of Object.entries(meters)) {
      const bar = document.getElementById(id);
      if (bar) {
        const h = Math.max(4, val * 28);
        bar.style.height = h + 'px';
        bar.classList.toggle('active', val > 0.3);
      }
    }

    const beatDot = document.getElementById('admin-beat-dot');
    if (beatDot) beatDot.classList.toggle('active', data.beat);

    const bpm = data.bpm || 0;
    const bpmEl = document.getElementById('admin-bpm');
    const headerBpm = document.getElementById('bpm-display');
    const bpmText = bpm > 0 ? bpm + ' BPM' : '-- BPM';
    if (bpmEl) bpmEl.textContent = bpmText;
    if (headerBpm) headerBpm.textContent = bpmText;

    if (wfCtx) {
      wfCtx.clearRect(0, 0, WF_W, WF_H);
      const bands = data.eqBands;
      if (bands && bands.length > 0) {
        const barW = WF_W / bands.length;
        wfCtx.strokeStyle = '#1a1a2e';
        wfCtx.lineWidth = 0.5;
        for (let y = 0; y < WF_H; y += 20) {
          wfCtx.beginPath(); wfCtx.moveTo(0, y); wfCtx.lineTo(WF_W, y); wfCtx.stroke();
        }
        for (let i = 0; i < bands.length; i++) {
          const val = bands[i] || 0;
          const h = Math.max(2, val * WF_H * 0.9);
          const x = i * barW;
          const y = WF_H - h;
          const grad = wfCtx.createLinearGradient(x, WF_H, x, y);
          if (i < 16) { grad.addColorStop(0, '#ff0066'); grad.addColorStop(1, '#ff4488'); }
          else if (i < 40) { grad.addColorStop(0, '#ffaa00'); grad.addColorStop(1, '#ffcc44'); }
          else { grad.addColorStop(0, '#00aaff'); grad.addColorStop(1, '#44ccff'); }
          wfCtx.fillStyle = grad;
          wfCtx.fillRect(x + 1, y, barW - 2, h);
        }
        if (data.beat) {
          wfCtx.fillStyle = 'rgba(255, 0, 100, 0.15)';
          wfCtx.fillRect(0, 0, WF_W, WF_H);
        }
      } else {
        wfCtx.strokeStyle = '#333'; wfCtx.lineWidth = 1;
        wfCtx.beginPath(); wfCtx.moveTo(0, WF_H / 2); wfCtx.lineTo(WF_W, WF_H / 2); wfCtx.stroke();
      }
    }

    requestAnimationFrame(updateLocalMeters);
  }

  requestAnimationFrame(updateLocalMeters);
  refreshDeviceList();

  // ═══════════════════════════════════════════════════════════
  // EFFECTS
  // ═══════════════════════════════════════════════════════════

  function renderEffects() {
    const categories = { light: 'grid-light', atmosphere: 'grid-atmosphere', visual: 'grid-visual' };
    for (const [cat, gridId] of Object.entries(categories)) {
      const grid = document.getElementById(gridId);
      if (!grid) continue;
      const catEffects = effects.filter(e => e.category === cat);
      grid.innerHTML = catEffects.map(e => effectCardHTML(e)).join('');
      catEffects.forEach(e => bindEffectEvents(e.id, grid));
    }
  }

  function effectCardHTML(e) {
    return `
      <div class="effect-card ${e.enabled ? 'active' : ''}" data-effect-id="${e.id}">
        <div class="effect-header">
          <span class="effect-name">${e.name}</span>
          <label class="toggle">
            <input type="checkbox" ${e.enabled ? 'checked' : ''} data-toggle="${e.id}">
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="effect-controls">
          <div class="control-row">
            <span class="control-label">Intensit&auml;t</span>
            <input type="range" min="0" max="1" step="0.05" value="${e.intensity}" data-slider="${e.id}-intensity">
            <span class="control-value" data-value="${e.id}-intensity">${e.intensity.toFixed(2)}</span>
          </div>
          <div class="control-row">
            <span class="control-label">Geschw.</span>
            <input type="range" min="0.1" max="3" step="0.1" value="${e.speed}" data-slider="${e.id}-speed">
            <span class="control-value" data-value="${e.id}-speed">${e.speed.toFixed(1)}</span>
          </div>
          <div class="control-row">
            <span class="control-label">Farbe</span>
            <input type="color" value="${e.color}" data-color="${e.id}">
          </div>
          <button class="btn-flash" data-flash="${e.id}">&#x26A1; Flash (2s)</button>
        </div>
      </div>`;
  }

  function bindEffectEvents(id, container) {
    const toggle = container.querySelector(`[data-toggle="${id}"]`);
    if (toggle) toggle.addEventListener('change', (e) => {
      OverlaySocket.emit('toggle-effect', { id, enabled: e.target.checked });
      container.querySelector(`[data-effect-id="${id}"]`).classList.toggle('active', e.target.checked);
    });
    const intSlider = container.querySelector(`[data-slider="${id}-intensity"]`);
    if (intSlider) intSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      container.querySelector(`[data-value="${id}-intensity"]`).textContent = val.toFixed(2);
      OverlaySocket.emit('update-effect', { id, intensity: val });
    });
    const spdSlider = container.querySelector(`[data-slider="${id}-speed"]`);
    if (spdSlider) spdSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      container.querySelector(`[data-value="${id}-speed"]`).textContent = val.toFixed(1);
      OverlaySocket.emit('update-effect', { id, speed: val });
    });
    const colorPicker = container.querySelector(`[data-color="${id}"]`);
    if (colorPicker) colorPicker.addEventListener('input', (e) => {
      OverlaySocket.emit('update-effect', { id, color: e.target.value });
    });
    const flashBtn = container.querySelector(`[data-flash="${id}"]`);
    if (flashBtn) flashBtn.addEventListener('click', () => {
      OverlaySocket.emit('trigger-effect', { effectId: id, action: 'on' });
      setTimeout(() => OverlaySocket.emit('trigger-effect', { effectId: id, action: 'off' }), 2000);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // SCENES - Full CRUD + Dynamic Rendering
  // ═══════════════════════════════════════════════════════════

  const sceneGrid = document.getElementById('scene-grid');
  const modalOverlay = document.getElementById('scene-modal-overlay');
  const modalTitle = document.getElementById('scene-modal-title');
  const modalClose = document.getElementById('scene-modal-close');
  const modalCancel = document.getElementById('scene-modal-cancel');
  const modalSave = document.getElementById('scene-modal-save');
  const btnAddScene = document.getElementById('btn-add-scene');
  const editName = document.getElementById('scene-edit-name');
  const editIcon = document.getElementById('scene-edit-icon');
  const editCommand = document.getElementById('scene-edit-command');
  const editDesc = document.getElementById('scene-edit-desc');
  const sceneEffectGrid = document.getElementById('scene-effect-grid');

  // ── Render all scene cards ──
  function renderScenes() {
    if (!sceneGrid) return;
    if (scenes.length === 0) {
      sceneGrid.innerHTML = '<p class="empty-msg">Keine Szenen vorhanden. Klicke "+ Neue Scene" um eine zu erstellen.</p>';
      return;
    }

    sceneGrid.innerHTML = scenes.map(scene => {
      const enabledCount = scene.effects.filter(e => e.enabled).length;
      const totalCount = scene.effects.length;
      const cmdBadge = scene.command ? `<span class="scene-cmd-badge">${scene.command}</span>` : '';
      return `
        <div class="scene-card" data-scene-id="${scene.id}">
          <div class="scene-card-top" data-apply-scene="${scene.id}">
            <span class="scene-icon">${scene.icon || '\u{1F3AC}'}</span>
            <span class="scene-name">${scene.name}</span>
            <span class="scene-desc">${scene.description || ''}</span>
            <div class="scene-meta">
              <span class="scene-effect-count">${enabledCount}/${totalCount} Effekte</span>
              ${cmdBadge}
            </div>
          </div>
          <div class="scene-card-actions">
            <button class="scene-action-btn scene-apply-btn" data-apply-scene="${scene.id}" title="Scene aktivieren">&#x25B6; Start</button>
            <button class="scene-action-btn scene-edit-btn" data-edit-scene="${scene.id}" title="Scene bearbeiten">&#x270E; Edit</button>
            <button class="scene-action-btn scene-delete-btn" data-delete-scene="${scene.id}" title="Scene l&ouml;schen">&#x2715; Del</button>
          </div>
        </div>`;
    }).join('');

    // Bind events
    sceneGrid.querySelectorAll('[data-apply-scene]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Don't apply if clicking action buttons
        if (e.target.closest('.scene-card-actions')) return;
        const sceneId = btn.dataset.applyScene;
        OverlaySocket.emit('apply-scene', sceneId);
      });
    });

    sceneGrid.querySelectorAll('.scene-apply-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sceneId = btn.dataset.applyScene;
        OverlaySocket.emit('apply-scene', sceneId);
      });
    });

    sceneGrid.querySelectorAll('.scene-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sceneId = btn.dataset.editScene;
        openSceneEditor(sceneId);
      });
    });

    sceneGrid.querySelectorAll('.scene-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const sceneId = btn.dataset.deleteScene;
        const scene = scenes.find(s => s.id === sceneId);
        if (confirm(`Scene "${scene?.name || sceneId}" wirklich l\u00f6schen?`)) {
          OverlaySocket.emit('delete-scene', sceneId);
        }
      });
    });
  }

  // ── Highlight a scene briefly (feedback when applied via chat) ──
  function highlightScene(sceneId) {
    const card = sceneGrid?.querySelector(`[data-scene-id="${sceneId}"]`);
    if (card) {
      card.classList.add('scene-highlight');
      setTimeout(() => card.classList.remove('scene-highlight'), 1500);
    }
  }

  // ── Scene Editor Modal ──

  function openSceneEditor(sceneId) {
    editingSceneId = sceneId || null;

    if (editingSceneId) {
      // Editing existing scene
      const scene = scenes.find(s => s.id === sceneId);
      if (!scene) return;
      modalTitle.textContent = 'Scene bearbeiten: ' + scene.name;
      editName.value = scene.name || '';
      editIcon.value = scene.icon || '';
      editCommand.value = scene.command || '';
      editDesc.value = scene.description || '';
      renderSceneEffectEditor(scene.effects);
    } else {
      // Creating new scene
      modalTitle.textContent = 'Neue Scene erstellen';
      editName.value = '';
      editIcon.value = '\u{1F3AC}';
      editCommand.value = '';
      editDesc.value = '';
      // Default: all effects disabled
      renderSceneEffectEditor(effects.map(e => ({ id: e.id, enabled: false, intensity: e.intensity })));
    }

    modalOverlay.classList.add('active');
  }

  function closeSceneEditor() {
    modalOverlay.classList.remove('active');
    editingSceneId = null;
  }

  function renderSceneEffectEditor(sceneEffects) {
    // Build editor rows for each effect
    sceneEffectGrid.innerHTML = effects.map(eff => {
      const sceneEff = sceneEffects.find(se => se.id === eff.id);
      const enabled = sceneEff ? sceneEff.enabled : false;
      const intensity = sceneEff ? (sceneEff.intensity ?? eff.intensity) : eff.intensity;
      const categoryLabel = { light: '\u{1F4A1} Licht', atmosphere: '\u{1F32B}\uFE0F Atmosph\u00e4re', visual: '\u{1F3A8} Visuell' };

      return `
        <div class="scene-effect-row ${enabled ? 'active' : ''}" data-se-id="${eff.id}">
          <div class="scene-effect-toggle">
            <label class="toggle mini-toggle">
              <input type="checkbox" ${enabled ? 'checked' : ''} data-se-toggle="${eff.id}">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <div class="scene-effect-info">
            <span class="scene-effect-name">${eff.name}</span>
            <span class="scene-effect-cat">${categoryLabel[eff.category] || eff.category}</span>
          </div>
          <div class="scene-effect-intensity">
            <input type="range" min="0" max="1" step="0.05" value="${intensity}" data-se-intensity="${eff.id}" ${!enabled ? 'disabled' : ''}>
            <span class="scene-effect-val" data-se-val="${eff.id}">${intensity.toFixed(2)}</span>
          </div>
        </div>`;
    }).join('');

    // Bind toggle events
    sceneEffectGrid.querySelectorAll('[data-se-toggle]').forEach(toggle => {
      toggle.addEventListener('change', (e) => {
        const id = e.target.dataset.seToggle;
        const row = sceneEffectGrid.querySelector(`[data-se-id="${id}"]`);
        const intensityInput = row?.querySelector(`[data-se-intensity="${id}"]`);
        row.classList.toggle('active', e.target.checked);
        if (intensityInput) intensityInput.disabled = !e.target.checked;
      });
    });

    // Bind intensity slider events
    sceneEffectGrid.querySelectorAll('[data-se-intensity]').forEach(slider => {
      slider.addEventListener('input', (e) => {
        const id = e.target.dataset.seIntensity;
        const valEl = sceneEffectGrid.querySelector(`[data-se-val="${id}"]`);
        if (valEl) valEl.textContent = parseFloat(e.target.value).toFixed(2);
      });
    });
  }

  function getSceneEditorData() {
    const name = editName.value.trim();
    if (!name) {
      alert('Bitte gib einen Scene-Namen ein.');
      return null;
    }

    const command = editCommand.value.trim();
    // Validate command format if provided
    if (command && !command.startsWith('!')) {
      alert('Chat-Command muss mit ! beginnen (z.B. !club)');
      return null;
    }

    // Check for duplicate command
    if (command) {
      const existing = scenes.find(s => s.command === command && s.id !== editingSceneId);
      if (existing) {
        alert(`Command "${command}" wird bereits von Scene "${existing.name}" verwendet.`);
        return null;
      }
    }

    // Build effects array from editor
    const sceneEffects = effects.map(eff => {
      const toggle = sceneEffectGrid.querySelector(`[data-se-toggle="${eff.id}"]`);
      const intensitySlider = sceneEffectGrid.querySelector(`[data-se-intensity="${eff.id}"]`);
      return {
        id: eff.id,
        enabled: toggle ? toggle.checked : false,
        intensity: intensitySlider ? parseFloat(intensitySlider.value) : eff.intensity,
      };
    });

    return {
      name,
      icon: editIcon.value.trim() || '\u{1F3AC}',
      command: command || '',
      description: editDesc.value.trim() || '',
      effects: sceneEffects,
    };
  }

  // ── Scene editor button events ──
  btnAddScene.addEventListener('click', () => openSceneEditor(null));
  modalClose.addEventListener('click', closeSceneEditor);
  modalCancel.addEventListener('click', closeSceneEditor);

  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeSceneEditor();
  });

  // Keyboard shortcut: Escape to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
      closeSceneEditor();
    }
  });

  modalSave.addEventListener('click', () => {
    const data = getSceneEditorData();
    if (!data) return;

    if (editingSceneId) {
      // Update existing scene
      OverlaySocket.emit('update-scene', { id: editingSceneId, ...data });
    } else {
      // Add new scene
      OverlaySocket.emit('add-scene', { id: 'scene_' + Date.now(), ...data });
    }
    closeSceneEditor();
  });

  // ═══════════════════════════════════════════════════════════
  // COMMANDS
  // ═══════════════════════════════════════════════════════════

  function populateEffectDropdown() {
    const sel = document.getElementById('cmd-effect');
    sel.innerHTML = '<option value="">Effekt w&auml;hlen...</option>' +
      effects.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  }

  document.getElementById('btn-add-command').addEventListener('click', () => {
    const effectId = document.getElementById('cmd-effect').value;
    const command = document.getElementById('cmd-command').value.trim();
    const action = document.getElementById('cmd-action').value;
    const cooldown = parseInt(document.getElementById('cmd-cooldown').value) || 5;
    if (!effectId || !command) return;
    if (!command.startsWith('!')) return;
    const cmd = {
      id: 'cmd_' + Date.now(), command: command.toLowerCase(), effectId, action, cooldown,
      description: `${command} \u2192 ${effects.find(e => e.id === effectId)?.name || effectId} (${action})`
    };
    OverlaySocket.emit('add-command', cmd);
    document.getElementById('cmd-command').value = '';
  });

  function renderCommands() {
    const list = document.getElementById('command-list');
    if (commands.length === 0) { list.innerHTML = '<p class="empty-msg">Noch keine Commands definiert</p>'; return; }
    list.innerHTML = commands.map(cmd => {
      const eff = effects.find(e => e.id === cmd.effectId);
      return `<div class="command-item" data-cmd-id="${cmd.id}">
        <span class="cmd-name">${cmd.command}</span>
        <span class="cmd-effect">\u2192 ${eff?.name || cmd.effectId}</span>
        <span class="cmd-action">${cmd.action}</span>
        <span class="cmd-cooldown">${cmd.cooldown}s</span>
        <button class="btn-remove" data-remove-cmd="${cmd.id}">\u2715</button>
      </div>`;
    }).join('');
    list.querySelectorAll('[data-remove-cmd]').forEach(btn => {
      btn.addEventListener('click', () => OverlaySocket.emit('remove-command', btn.dataset.removeCmd));
    });
  }

  // ═══════════════════════════════════════════════════════════
  // CHANNEL
  // ═══════════════════════════════════════════════════════════

  document.getElementById('btn-connect-channel').addEventListener('click', () => {
    const name = document.getElementById('channel-name').value.trim();
    if (!name) return;
    OverlaySocket.emit('connect-channel', { channelName: name, platform: 'twitch' });
  });

  document.getElementById('btn-disconnect-channel').addEventListener('click', () => {
    OverlaySocket.emit('disconnect-channel', {});
  });

  function updateChannelUI() {
    const dot = document.querySelector('.ch-dot');
    const statusText = document.querySelector('.channel-status span:last-child');
    const btnConnect = document.getElementById('btn-connect-channel');
    const btnDisconnect = document.getElementById('btn-disconnect-channel');
    dot.classList.toggle('connected', channelConfig.connected);
    statusText.textContent = channelConfig.connected ? `Verbunden mit #${channelConfig.channelName}` : 'Nicht verbunden';
    btnConnect.disabled = channelConfig.connected;
    btnDisconnect.disabled = !channelConfig.connected;
  }

  // ═══════════════════════════════════════════════════════════
  // CHAT LOG
  // ═══════════════════════════════════════════════════════════

  function renderChatLog() {
    const log = document.getElementById('chat-log');
    log.innerHTML = chatMessages.map(msg => {
      if (msg.isSystem) return `<div class="chat-msg system">${msg.content}</div>`;
      return `<div class="chat-msg"><span class="username">${msg.username}:</span> <span class="content">${msg.content}</span></div>`;
    }).join('');
    log.scrollTop = log.scrollHeight;
  }
})();
