// ═══════════════════════════════════════════════════════════════
// TwitchDancefloor v0.0.9 - Standalone Server
// OBS Music Reactive Light Show Overlay
// Audio data flows: Admin -> Server -> Overlay
// Scenes: Full CRUD + Chat Commands
// ═══════════════════════════════════════════════════════════════

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const WebSocket = require('ws');

const PORT = 3131;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SCENES_FILE = path.join(__dirname, '..', 'data', 'scenes.json');

// ═══════════════════════ DEFAULT EFFECTS ═══════════════════════
const defaultEffects = [
  { id: 'laser', name: 'Laser', category: 'light', enabled: false, intensity: 0.7, speed: 1.0, color: '#00ff88' },
  { id: 'spotlight', name: 'Scheinwerfer', category: 'light', enabled: false, intensity: 0.6, speed: 0.8, color: '#ffffff' },
  { id: 'fog', name: 'Nebel', category: 'atmosphere', enabled: false, intensity: 0.5, speed: 0.5, color: '#88ccff' },
  { id: 'strobe', name: 'Stroboskop', category: 'light', enabled: false, intensity: 0.8, speed: 2.0, color: '#ffffff' },
  { id: 'lightbeam', name: 'Lichtkegel', category: 'light', enabled: false, intensity: 0.6, speed: 0.7, color: '#ffaa00' },
  { id: 'particles', name: 'Partikel', category: 'atmosphere', enabled: false, intensity: 0.5, speed: 1.0, color: '#ff00ff' },
  { id: 'equalizer', name: 'Equalizer', category: 'visual', enabled: false, intensity: 0.7, speed: 1.0, color: '#00ffff' },
  { id: 'dancers', name: 'Taenzer', category: 'visual', enabled: false, intensity: 0.6, speed: 1.0, color: '#ff4488' },
  { id: 'colorwash', name: 'Farbflut', category: 'atmosphere', enabled: false, intensity: 0.4, speed: 0.5, color: '#ff0066' },
  { id: 'mirrorball', name: 'Spiegelkugel', category: 'light', enabled: false, intensity: 0.6, speed: 1.0, color: '#ffffff' },
  { id: 'pulsering', name: 'Puls-Ring', category: 'visual', enabled: false, intensity: 0.7, speed: 1.0, color: '#00ff00' },
  { id: 'confetti', name: 'Konfetti', category: 'visual', enabled: false, intensity: 0.5, speed: 1.0, color: '#ffff00' },
  { id: 'lightning', name: 'Blitze', category: 'light', enabled: false, intensity: 0.8, speed: 1.5, color: '#aaccff' },
  { id: 'smoke', name: 'Rauch', category: 'atmosphere', enabled: false, intensity: 0.4, speed: 0.3, color: '#666666' },
];

// ═══════════════════════ DEFAULT SCENES ═══════════════════════
const defaultScenes = [
  {
    id: 'scene_club',
    name: 'Club Mode',
    icon: '\u{1F3B5}',
    description: 'Laser + Spotlights + Spiegelkugel + Nebel + EQ',
    command: '!club',
    effects: [
      { id: 'laser', enabled: true, intensity: 0.7 },
      { id: 'spotlight', enabled: true, intensity: 0.6 },
      { id: 'mirrorball', enabled: true, intensity: 0.6 },
      { id: 'fog', enabled: true, intensity: 0.5 },
      { id: 'equalizer', enabled: true, intensity: 0.7 },
      { id: 'colorwash', enabled: true, intensity: 0.3 },
      { id: 'dancers', enabled: true, intensity: 0.6 },
    ]
  },
  {
    id: 'scene_rave',
    name: 'Rave Mode',
    icon: '\u26A1',
    description: 'Strobe + Laser + Partikel + Farbflut + Konfetti + Blitze',
    command: '!rave',
    effects: [
      { id: 'strobe', enabled: true, intensity: 0.6 },
      { id: 'laser', enabled: true, intensity: 0.8 },
      { id: 'particles', enabled: true, intensity: 0.6 },
      { id: 'colorwash', enabled: true, intensity: 0.5 },
      { id: 'confetti', enabled: true, intensity: 0.5 },
      { id: 'lightning', enabled: true, intensity: 0.6 },
      { id: 'dancers', enabled: true, intensity: 0.6 },
    ]
  },
  {
    id: 'scene_chill',
    name: 'Chill Mode',
    icon: '\u{1F30A}',
    description: 'Farbflut + Nebel + Lichtkegel + Rauch',
    command: '!chill',
    effects: [
      { id: 'colorwash', enabled: true, intensity: 0.3 },
      { id: 'fog', enabled: true, intensity: 0.4 },
      { id: 'lightbeam', enabled: true, intensity: 0.4 },
      { id: 'smoke', enabled: true, intensity: 0.4 },
      { id: 'mirrorball', enabled: true, intensity: 0.3 },
    ]
  },
  {
    id: 'scene_party',
    name: 'Party Mode',
    icon: '\u{1F389}',
    description: 'Alles aktiv - moderate Intensit\u00e4t',
    command: '!party',
    effects: defaultEffects.map(e => ({ id: e.id, enabled: true, intensity: 0.5 }))
  },
  {
    id: 'scene_blackout',
    name: 'Blackout',
    icon: '\u2B1B',
    description: 'Alle Effekte aus',
    command: '!blackout',
    effects: defaultEffects.map(e => ({ id: e.id, enabled: false }))
  },
];

// ═══════════════════════ STATE ═══════════════════════
let effects = JSON.parse(JSON.stringify(defaultEffects));
let commands = [];
let scenes = loadScenes();
let channelConfig = { channelName: '', platform: 'twitch', connected: false };
let audioData = { bass: 0, mid: 0, high: 0, volume: 0, beat: false, beatPulse: 0, bpm: 120, eqBands: [] };
const commandCooldowns = new Map();
const sceneCooldowns = new Map();
let twitchWs = null;

// ═══════════════════════ SCENE PERSISTENCE ═══════════════════════
function loadScenes() {
  try {
    if (fs.existsSync(SCENES_FILE)) {
      const data = JSON.parse(fs.readFileSync(SCENES_FILE, 'utf8'));
      if (Array.isArray(data) && data.length > 0) {
        console.log('[Scenes] Loaded', data.length, 'scenes from file');
        return data;
      }
    }
  } catch (e) {
    console.error('[Scenes] Load error:', e.message);
  }
  return JSON.parse(JSON.stringify(defaultScenes));
}

function saveScenes() {
  try {
    const dir = path.dirname(SCENES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SCENES_FILE, JSON.stringify(scenes, null, 2), 'utf8');
  } catch (e) {
    console.error('[Scenes] Save error:', e.message);
  }
}

// ═══════════════════════ STATIC FILE SERVER ═══════════════════════
const MIME_TYPES = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
};

function serveStatic(req, res) {
  let filePath = path.join(PUBLIC_DIR, req.url === '/' ? 'admin.html' : req.url);
  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404 - Not Found</h1>');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
    res.end(data);
  });
}

// ═══════════════════════ TWITCH IRC ═══════════════════════
function connectTwitch(channelName) {
  disconnectTwitch();
  try {
    const nick = 'justinfan' + Math.floor(Math.random() * 90000 + 10000);
    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

    ws.on('open', () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send('PASS SCHMOOPIIE');
      ws.send('NICK ' + nick);
      ws.send('JOIN #' + channelName.toLowerCase());
      channelConfig = { channelName, platform: 'twitch', connected: true };
      io.emit('channel-status', channelConfig);
      console.log('[Twitch] Connected to #' + channelName);
    });

    ws.on('message', (data) => {
      const lines = data.toString().split('\r\n');
      for (const line of lines) {
        if (!line) continue;
        if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); continue; }
        const match = line.match(/:([^!]+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
        if (match) {
          const [, username, content] = match;
          io.emit('chat-message', { username, content: content.trim(), timestamp: Date.now() });
          processChatCommand(username, content.trim());
        }
      }
    });

    ws.on('close', () => {
      channelConfig.connected = false;
      io.emit('channel-status', channelConfig);
      console.log('[Twitch] Disconnected');
    });

    ws.on('error', (err) => {
      console.error('[Twitch] Error:', err.message);
      channelConfig.connected = false;
      io.emit('channel-status', channelConfig);
    });

    twitchWs = ws;
  } catch (err) {
    console.error('[Twitch] Failed:', err.message);
  }
}

function disconnectTwitch() {
  if (twitchWs) { twitchWs.close(); twitchWs = null; }
  channelConfig.connected = false;
  io.emit('channel-status', channelConfig);
}

// ═══════════════════════ CHAT COMMAND PROCESSING ═══════════════════════
function processChatCommand(username, content) {
  const now = Date.now();
  const contentLower = content.toLowerCase().trim();

  // ── Scene Commands ──
  // Check !scene <name> or direct scene commands like !club, !rave
  let sceneMatch = null;

  // Format: !scene <name>
  if (contentLower.startsWith('!scene ')) {
    const sceneName = contentLower.slice(7).trim();
    sceneMatch = scenes.find(s => s.name.toLowerCase() === sceneName || s.id.toLowerCase() === sceneName);
  }

  // Format: direct command like !club, !rave
  if (!sceneMatch) {
    sceneMatch = scenes.find(s => s.command && s.command.toLowerCase() === contentLower);
  }

  if (sceneMatch) {
    const lastUsed = sceneCooldowns.get(sceneMatch.id) || 0;
    if (now - lastUsed < 5000) return; // 5s cooldown for scene commands
    sceneCooldowns.set(sceneMatch.id, now);

    applyScene(sceneMatch);
    io.emit('scene-applied', { sceneId: sceneMatch.id, sceneName: sceneMatch.name, username });
    io.emit('chat-trigger', { username, command: contentLower, effectId: '__scene__', action: 'scene', effectName: 'Scene: ' + sceneMatch.name });
    console.log(`[CMD] ${username}: ${contentLower} -> Scene: ${sceneMatch.name}`);
    return;
  }

  // ── Effect Commands (existing logic) ──
  for (const cmd of commands) {
    if (contentLower === cmd.command.toLowerCase()) {
      const lastUsed = commandCooldowns.get(cmd.command) || 0;
      if (now - lastUsed < cmd.cooldown * 1000) continue;
      commandCooldowns.set(cmd.command, now);

      const effect = effects.find(e => e.id === cmd.effectId);
      if (!effect) continue;

      if (cmd.action === 'toggle') effect.enabled = !effect.enabled;
      else if (cmd.action === 'on') effect.enabled = true;
      else if (cmd.action === 'off') effect.enabled = false;

      io.emit('effect-update', effect);
      io.emit('chat-trigger', { username, command: cmd.command, effectId: cmd.effectId, action: cmd.action, effectName: effect.name });
      console.log(`[CMD] ${username}: ${cmd.command} -> ${effect.name} (${cmd.action})`);
    }
  }
}

// ═══════════════════════ APPLY SCENE ═══════════════════════
function applyScene(scene) {
  if (!scene || !scene.effects) return;

  // First turn all effects off
  for (const eff of effects) {
    eff.enabled = false;
  }

  // Then apply scene settings
  for (const upd of scene.effects) {
    const eff = effects.find(e => e.id === upd.id);
    if (eff) {
      eff.enabled = upd.enabled;
      if (upd.intensity !== undefined) eff.intensity = upd.intensity;
    }
  }

  io.emit('effects-state', effects);
  console.log('[Scene] Applied:', scene.name);
}

// ═══════════════════════ HTTP SERVER ═══════════════════════
const httpServer = http.createServer(serveStatic);

// ═══════════════════════ SOCKET.IO ═══════════════════════
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000, pingInterval: 25000,
});

io.on('connection', (socket) => {
  console.log('[WS] Client connected:', socket.id);
  socket.emit('effects-state', effects);
  socket.emit('commands-state', commands);
  socket.emit('scenes-state', scenes);
  socket.emit('channel-status', channelConfig);
  socket.emit('audio-data', audioData);

  // Effects
  socket.on('update-effect', (data) => {
    const idx = effects.findIndex(e => e.id === data.id);
    if (idx !== -1) { effects[idx] = { ...effects[idx], ...data }; io.emit('effect-update', effects[idx]); }
  });
  socket.on('toggle-effect', (data) => {
    const eff = effects.find(e => e.id === data.id);
    if (eff) { eff.enabled = data.enabled; io.emit('effect-update', eff); }
  });
  socket.on('set-effects', (data) => { effects = data; io.emit('effects-state', effects); });

  // Commands
  socket.on('add-command', (cmd) => { commands.push(cmd); io.emit('commands-state', commands); });
  socket.on('remove-command', (id) => { commands = commands.filter(c => c.id !== id); io.emit('commands-state', commands); });
  socket.on('update-command', (data) => {
    const idx = commands.findIndex(c => c.id === data.id);
    if (idx !== -1) { commands[idx] = { ...commands[idx], ...data }; io.emit('commands-state', commands); }
  });

  // Scenes - Full CRUD
  socket.on('add-scene', (scene) => {
    // Ensure unique ID
    if (!scene.id) scene.id = 'scene_' + Date.now();
    // Check for duplicate ID
    if (scenes.find(s => s.id === scene.id)) {
      scene.id = 'scene_' + Date.now();
    }
    scenes.push(scene);
    saveScenes();
    io.emit('scenes-state', scenes);
    console.log('[Scene] Added:', scene.name);
  });

  socket.on('update-scene', (data) => {
    const idx = scenes.findIndex(s => s.id === data.id);
    if (idx !== -1) {
      scenes[idx] = { ...scenes[idx], ...data };
      saveScenes();
      io.emit('scenes-state', scenes);
      console.log('[Scene] Updated:', data.name || data.id);
    }
  });

  socket.on('delete-scene', (sceneId) => {
    scenes = scenes.filter(s => s.id !== sceneId);
    saveScenes();
    io.emit('scenes-state', scenes);
    console.log('[Scene] Deleted:', sceneId);
  });

  socket.on('apply-scene', (sceneId) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (scene) applyScene(scene);
  });

  // Legacy support: apply-scene with effects array
  socket.on('apply-scene-effects', (sceneEffects) => {
    for (const upd of sceneEffects) {
      const eff = effects.find(e => e.id === upd.id);
      if (eff) { eff.enabled = upd.enabled; eff.intensity = upd.intensity ?? eff.intensity; }
    }
    io.emit('effects-state', effects);
  });

  // Channel
  socket.on('connect-channel', (data) => connectTwitch(data.channelName));
  socket.on('disconnect-channel', () => disconnectTwitch());

  // Audio data - relay from admin to all other clients (overlay)
  socket.on('audio-data', (data) => {
    audioData = data;
    socket.broadcast.emit('audio-data', data);
  });

  // Manual trigger
  socket.on('trigger-effect', (data) => {
    const eff = effects.find(e => e.id === data.effectId);
    if (eff) {
      if (data.action === 'toggle') eff.enabled = !eff.enabled;
      else if (data.action === 'on') eff.enabled = true;
      else if (data.action === 'off') eff.enabled = false;
      io.emit('effect-update', eff);
    }
  });

  socket.on('disconnect', () => console.log('[WS] Client disconnected:', socket.id));
});

// ═══════════════════════ START ═══════════════════════
httpServer.listen(PORT, () => {
  console.log('');
  console.log('  TwitchDancefloor v0.0.9 - Music Reactive Light Show Overlay');
  console.log('');
  console.log('  Overlay:  http://localhost:' + PORT + '/overlay.html');
  console.log('  Admin:    http://localhost:' + PORT + '/admin.html');
  console.log('');
  console.log('  Scenes:   ' + scenes.length + ' scenes loaded');
  console.log('  TIP: Open admin.html first, select an audio source,');
  console.log('       then add overlay.html as OBS Browser Source.');
  console.log('');
});
