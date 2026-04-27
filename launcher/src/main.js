/**
 * Virtual Twitch Club - Launcher (Electron Main Process)
 * v1.0.3 - Simplified: iframes in renderer, no WebContentsView
 */

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, clipboard } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const http = require('http');
const https = require('https');

// ── Paths ──────────────────────────────────────────────────────────────────
const isDev = !app.isPackaged;
const LAUNCHER_DIR = path.resolve(__dirname, '..');
const APPS_DIR = isDev
  ? path.resolve(__dirname, '..', '..', 'apps')
  : path.join(process.resourcesPath, 'apps');
const CONFIG_DIR = path.join(os.homedir(), '.virtualtwitchclub');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

console.log('='.repeat(60));
console.log('[Launcher] Virtual Twitch Club v1.0.7');
console.log('[Launcher] isDev:', isDev);
console.log('[Launcher] LAUNCHER_DIR:', LAUNCHER_DIR);
console.log('[Launcher] APPS_DIR:', APPS_DIR);
console.log('[Launcher] __dirname:', __dirname);
console.log('[Launcher] process.execPath:', process.execPath);
console.log('[Launcher] process.resourcesPath:', process.resourcesPath || 'N/A');
console.log('='.repeat(60));

// ── Services ───────────────────────────────────────────────────────────────
const services = {
  dancers: {
    name: 'VirtualClubDancers',
    port: 3333,
    adminUrl: 'http://localhost:3333/admin',
    overlayUrl: 'http://localhost:3333',
    process: null,
    status: 'stopped',
    log: '',
    scriptPath: path.join(APPS_DIR, 'dancers', 'server.js'),
    overlayLabel: 'Club Dancers Overlay',
    overlayWidth: 1920,
    overlayHeight: 1080
  },
  soundboard: {
    name: 'TwitchSoundBoard',
    port: 3000,
    adminUrl: 'http://localhost:3000/admin',
    overlayUrl: 'http://localhost:3000/overlay',
    process: null,
    status: 'stopped',
    log: '',
    scriptPath: path.join(APPS_DIR, 'soundboard', 'server.js'),
    overlayLabel: 'SoundBoard Overlay',
    overlayWidth: 1920,
    overlayHeight: 1080
  },
  dancefloor: {
    name: 'TwitchDancefloor',
    port: 3131,
    adminUrl: 'http://localhost:3131/admin.html',
    overlayUrl: 'http://localhost:3131/overlay.html',
    process: null,
    status: 'stopped',
    log: '',
    scriptPath: path.join(APPS_DIR, 'dancefloor', 'standalone', 'server.js'),
    overlayLabel: 'Dancefloor Overlay',
    overlayWidth: 1920,
    overlayHeight: 1080
  }
};

// Verify paths
for (const [key, svc] of Object.entries(services)) {
  const scriptExists = fs.existsSync(svc.scriptPath);
  const nmDir = path.join(path.dirname(svc.scriptPath), 'node_modules');
  const nmExists = fs.existsSync(nmDir);
  console.log(`[PathCheck] ${key}:`);
  console.log(`  script: ${svc.scriptPath} -> ${scriptExists ? 'OK' : 'MISSING!'}`);
  console.log(`  node_modules: ${nmDir} -> ${nmExists ? 'OK' : 'MISSING!'}`);
  if (!scriptExists) svc.log = `ERROR: Script not found at ${svc.scriptPath}`;
}

// ── State ──────────────────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let activeTab = 'dancers';
let isQuitting = false;

// ── Config ─────────────────────────────────────────────────────────────────
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch (e) { console.error('[Launcher] Config load error:', e.message); }
  return null;
}

function saveConfig(config) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) { console.error('[Launcher] Config save error:', e.message); }
}

// ── Credential Propagation ────────────────────────────────────────────────
function propagateCredentials(config) {
  // Dancers config
  const dancersConfigDir = path.join(CONFIG_DIR, 'dancers');
  if (!fs.existsSync(dancersConfigDir)) fs.mkdirSync(dancersConfigDir, { recursive: true });
  const dancersConfig = {
    twitch: {
      channel: config.channel || '',
      oauthToken: config.oauthToken || '',
      botUsername: config.botUsername || config.channel || ''
    },
    scene: {
      moveZoneYMin: 0.55, moveZoneYMax: 0.90, maxAvatars: 50,
      inactivityTimeout: 120000, avatarScale: 4.0,
      personalSpaceRadius: 0.12, pushStrength: 0.55
    },
    admin: { autoOpen: false }
  };
  fs.writeFileSync(path.join(dancersConfigDir, 'config.json'), JSON.stringify(dancersConfig, null, 2), 'utf-8');

  // SoundBoard encrypted credentials
  const crypto = require('crypto');
  let ENC_KEY;
  try { ENC_KEY = crypto.scryptSync('TwitchSoundBoard_v1', 'local_salt', 32); }
  catch (e) { ENC_KEY = crypto.createHash('sha256').update('TwitchSoundBoard_fallback_key').digest(); }

  function encrypt(text) {
    try {
      const iv = crypto.randomBytes(16);
      const c = crypto.createCipheriv('aes-256-cbc', ENC_KEY, iv);
      let e = c.update(text, 'utf8', 'hex');
      e += c.final('hex');
      return iv.toString('hex') + ':' + e;
    } catch (e) { return text; }
  }

  const soundboardCreds = {
    twitch_channel: config.channel || '',
    twitch_bot_token: config.oauthToken || '',
    twitch_bot_username: config.botUsername || config.channel || ''
  };
  const encData = {};
  for (const k in soundboardCreds) {
    encData[k] = soundboardCreds[k] ? 'enc:' + encrypt(String(soundboardCreds[k])) : '';
  }
  const sbCredPath = path.join(APPS_DIR, 'soundboard', 'credentials.enc');
  try { fs.writeFileSync(sbCredPath, JSON.stringify(encData, null, 2), 'utf-8'); }
  catch (e) { console.warn('[Launcher] Could not write SoundBoard credentials:', e.message); }

  console.log('[Launcher] Credentials propagated');
}

// ── Service Manager ────────────────────────────────────────────────────────
function startService(serviceKey) {
  const service = services[serviceKey];
  if (service.process && !service.process.killed) {
    console.log(`[Launcher] ${service.name} already running`);
    return;
  }

  if (!fs.existsSync(service.scriptPath)) {
    console.error(`[Launcher] SCRIPT NOT FOUND: ${service.scriptPath}`);
    service.status = 'error';
    service.log = `Script nicht gefunden: ${service.scriptPath}`;
    sendStatusToRenderer();
    return;
  }

  // Use Electron binary as Node.js with ELECTRON_RUN_AS_NODE=1
  const nodeExe = process.execPath;
  const scriptDir = path.dirname(service.scriptPath);

  console.log(`[Launcher] Starting ${service.name}...`);
  console.log(`  exe: ${nodeExe}`);
  console.log(`  script: ${service.scriptPath}`);
  console.log(`  cwd: ${scriptDir}`);

  try {
    const env = { ...process.env };
    env.ELECTRON_RUN_AS_NODE = '1';

    service.process = spawn(nodeExe, [service.scriptPath], {
      cwd: scriptDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: env,
      windowsHide: true
    });

    service.status = 'starting';
    service.log = 'Startvorgang...';
    sendStatusToRenderer();

    let allOutput = '';

    service.process.stdout.on('data', (data) => {
      const msg = data.toString();
      allOutput += msg;
      const lastLine = msg.trim().split('\n').pop();
      if (lastLine) {
        console.log(`[${service.name}] ${lastLine}`);
        service.log = lastLine;
      }
      // Detect server ready
      if (msg.includes('Server running') || msg.includes('Server laeuft') ||
          msg.includes('lauft - oeffne') || msg.includes('TwitchDancefloor') ||
          msg.includes('Ready!') || msg.includes('http://localhost:' + service.port)) {
        service.status = 'running';
        service.log = `Server laeuft auf http://localhost:${service.port}`;
        console.log(`[Launcher] ${service.name} is READY`);
        sendStatusToRenderer();
        // Tell renderer to reload iframe
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('service-ready', serviceKey);
        }
      }
    });

    service.process.stderr.on('data', (data) => {
      const msg = data.toString();
      allOutput += msg;
      const lastLine = msg.trim().split('\n').pop();
      if (lastLine) {
        console.error(`[${service.name} ERR] ${lastLine}`);
        service.log = `ERR: ${lastLine}`;
      }
    });

    service.process.on('close', (code) => {
      console.log(`[Launcher] ${service.name} exited with code ${code}`);
      if (service.status === 'starting') {
        service.status = 'error';
        service.log = `Prozess beendet (Code ${code}). Letzte Ausgabe:\n${allOutput.slice(-500)}`;
      } else {
        service.status = 'stopped';
      }
      service.process = null;
      sendStatusToRenderer();
    });

    service.process.on('error', (err) => {
      console.error(`[Launcher] ${service.name} SPAWN ERROR:`, err.message);
      service.status = 'error';
      service.log = `Fehler beim Starten: ${err.message}`;
      sendStatusToRenderer();
    });

  } catch (e) {
    console.error(`[Launcher] Failed to start ${service.name}:`, e.message);
    service.status = 'error';
    service.log = `Start fehlgeschlagen: ${e.message}`;
    sendStatusToRenderer();
  }
}

function stopService(serviceKey) {
  const service = services[serviceKey];
  if (service.process) {
    console.log(`[Launcher] Stopping ${service.name}...`);
    try { service.process.kill('SIGTERM'); } catch (e) {
      try { service.process.kill('SIGKILL'); } catch (e2) { /* ignore */ }
    }
    service.process = null;
    service.status = 'stopped';
    sendStatusToRenderer();
  }
}

function startAllServices() {
  for (const key of Object.keys(services)) startService(key);
}

function stopAllServices() {
  for (const key of Object.keys(services)) stopService(key);
}

// ── Media Permissions ─────────────────────────────────────────────────────
// Allow iframes (localhost) to access getUserMedia, enumerateDevices, etc.
// This is needed for Dancefloor (audio source selection) and SoundBoard
function setupMediaPermissions() {
  const { session } = require('electron');

  // Grant all media permissions for localhost origins
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL() || '';
    console.log(`[Permission] Request: ${permission} from ${url}`);
    // Auto-approve all media & device permissions for localhost (also iframe content)
    if (permission === 'media' || permission === 'audio' || permission === 'video' ||
        permission === 'microphone' || permission === 'camera' ||
        permission === 'mediaKeySystem' || permission === 'fullscreen' ||
        permission === 'clipboard-read' || permission === 'clipboard-sanitized-write' ||
        permission === 'desktopCapturer' || permission === 'display-capture') {
      console.log(`[Permission] GRANTED: ${permission} from ${url}`);
      callback(true);
      return;
    }
    callback(false);
  });

  // Also handle permission checks (e.g. has permission already?)
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    const url = webContents.getURL() || '';
    if (permission === 'media' || permission === 'audio' || permission === 'video' ||
        permission === 'microphone' || permission === 'camera' ||
        permission === 'mediaKeySystem' || permission === 'fullscreen' ||
        permission === 'desktopCapturer' || permission === 'display-capture') {
      return true;
    }
    return false;
  });

  // Handle device selection requests (Electron 28+ uses this)
  session.defaultSession.setDevicePermissionHandler((details) => {
    if (details.deviceType === 'audio' || details.deviceType === 'video') {
      console.log(`[DevicePermission] Allowing ${details.deviceType} for ${details.origin}`);
      return true;
    }
    return false;
  });

  // Handle child WebContents created by iframes - ensure they also get permissions
  app.on('web-contents-created', (event, contents) => {
    if (contents.getType() === 'iframe') {
      console.log(`[Iframe] Created for: ${contents.getURL()}`);
      // Iframes inherit session permissions, but setPermissionRequestHandler
      // on the session should already cover them. The allow= attribute on the
      // iframe tag is the critical piece for Feature Policy.
    }
  });

  console.log('[Launcher] Media permissions configured');
}

// ── Status Broadcasting ────────────────────────────────────────────────────
function sendStatusToRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const status = {};
  for (const [key, s] of Object.entries(services)) {
    status[key] = {
      name: s.name, port: s.port, status: s.status,
      adminUrl: s.adminUrl, overlayUrl: s.overlayUrl,
      overlayLabel: s.overlayLabel, log: s.log || ''
    };
  }
  mainWindow.webContents.send('services-status', status);
}

// ── Health Check (simple HTTP ping) ───────────────────────────────────────
function httpPing(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/`, { timeout: 2000 }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

setInterval(async () => {
  for (const key of Object.keys(services)) {
    const s = services[key];
    if (s.status === 'starting') {
      const up = await httpPing(s.port);
      if (up) {
        s.status = 'running';
        s.log = `Server laeuft auf http://localhost:${s.port}`;
        console.log(`[HealthCheck] ${s.name} is now running`);
        sendStatusToRenderer();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('service-ready', key);
        }
      }
    } else if (s.status === 'running') {
      const up = await httpPing(s.port);
      if (!up) {
        s.status = 'error';
        s.log = 'Server nicht mehr erreichbar';
        sendStatusToRenderer();
      }
    }
  }
}, 3000);

// ── Tray ──────────────────────────────────────────────────────────────────
function createTray() {
  let trayIcon;
  try {
    const iconPath = path.join(LAUNCHER_DIR, 'assets', 'tray-icon.png');
    if (fs.existsSync(iconPath)) trayIcon = nativeImage.createFromPath(iconPath);
  } catch (e) { /* ignore */ }

  if (!trayIcon || trayIcon.isEmpty()) {
    const size = 16;
    const buf = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      buf[i * 4] = 0x91; buf[i * 4 + 1] = 0x46; buf[i * 4 + 2] = 0xFF; buf[i * 4 + 3] = 0xFF;
    }
    trayIcon = nativeImage.createFromBuffer(buf, { width: size, height: size });
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Virtual Twitch Club');
  tray.on('double-click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show(); mainWindow.focus();
    }
  });

  const updateMenu = () => {
    const lines = Object.entries(services).map(([k, s]) => {
      const icon = s.status === 'running' ? 'ON' : s.status === 'starting' ? '..' : 'OFF';
      return `${icon} ${s.name} (:${s.port})`;
    });
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Virtual Twitch Club', enabled: false },
      { type: 'separator' },
      { label: lines.join('\n'), enabled: false },
      { type: 'separator' },
      { label: 'Fenster anzeigen', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
      { label: 'OBS URLs kopieren', click: () => {
        clipboard.writeText(Object.values(services).map(s => `${s.overlayLabel}: ${s.overlayUrl}`).join('\n'));
      }},
      { type: 'separator' },
      { label: 'Alles starten', click: () => startAllServices() },
      { label: 'Alles stoppen', click: () => stopAllServices() },
      { type: 'separator' },
      { label: 'Beenden', click: () => { isQuitting = true; app.quit(); } }
    ]));
  };
  updateMenu();
  // Refresh tray menu periodically
  setInterval(updateMenu, 5000);
}

// ── Main Window ────────────────────────────────────────────────────────────
function createMainWindow() {
  const preloadPath = path.join(LAUNCHER_DIR, 'preload.js');
  const iconPath = path.join(LAUNCHER_DIR, 'assets', 'icon.ico');
  const htmlPath = path.join(LAUNCHER_DIR, 'renderer', 'index.html');

  console.log('[Launcher] preload:', preloadPath, '->', fs.existsSync(preloadPath));
  console.log('[Launcher] html:', htmlPath, '->', fs.existsSync(htmlPath));

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Virtual Twitch Club',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: fs.existsSync(preloadPath) ? preloadPath : undefined,
      // IMPORTANT: Allow iframe to load localhost content
      webSecurity: false
    },
    autoHideMenuBar: true,
    backgroundColor: '#1a1a2e'
  });

  mainWindow.loadFile(htmlPath).catch((err) => {
    console.error('[Launcher] Failed to load HTML:', err.message);
    mainWindow.loadURL('data:text/html,<body style="background:%231a1a2e;color:%23fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif"><h2>Error: ' + err.message + '</h2></body>');
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) { event.preventDefault(); mainWindow.hide(); }
  });

  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[Renderer] ${message}`);
  });
}

// ── IPC ────────────────────────────────────────────────────────────────────
function setupIPC() {
  ipcMain.handle('get-config', () => loadConfig());

  ipcMain.handle('save-config', (event, config) => {
    saveConfig(config);
    propagateCredentials(config);
    return { ok: true };
  });

  ipcMain.handle('get-status', () => {
    const status = {};
    for (const [key, s] of Object.entries(services)) {
      status[key] = {
        name: s.name, port: s.port, status: s.status,
        adminUrl: s.adminUrl, overlayUrl: s.overlayUrl,
        overlayLabel: s.overlayLabel, log: s.log || ''
      };
    }
    return status;
  });

  ipcMain.handle('get-debug-info', () => {
    const info = {
      isPackaged: app.isPackaged,
      isDev: isDev,
      execPath: process.execPath,
      resourcesPath: process.resourcesPath || 'N/A',
      launcherDir: LAUNCHER_DIR,
      appsDir: APPS_DIR,
      configDir: CONFIG_DIR,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      platform: process.platform,
      arch: process.arch,
      pathExists: {}
    };
    // Check all critical paths
    for (const [key, s] of Object.entries(services)) {
      info.pathExists[key + '_script'] = fs.existsSync(s.scriptPath);
      info.pathExists[key + '_node_modules'] = fs.existsSync(path.join(path.dirname(s.scriptPath), 'node_modules'));
      info.pathExists[key + '_package_json'] = fs.existsSync(path.join(path.dirname(s.scriptPath), 'package.json'));
    }
    info.pathExists.apps_dir = fs.existsSync(APPS_DIR);
    if (fs.existsSync(APPS_DIR)) {
      info.pathExists.apps_contents = fs.readdirSync(APPS_DIR);
    }
    return info;
  });

  ipcMain.on('start-all', () => startAllServices());
  ipcMain.on('stop-all', () => stopAllServices());
  ipcMain.on('start-service', (e, k) => startService(k));
  ipcMain.on('stop-service', (e, k) => stopService(k));

  ipcMain.on('restart-service', (e, k) => {
    stopService(k);
    setTimeout(() => startService(k), 1000);
  });

  ipcMain.on('open-external', (e, url) => shell.openExternal(url));

  ipcMain.handle('copy-to-clipboard', (e, text) => {
    clipboard.writeText(text);
    return { ok: true };
  });

  ipcMain.handle('get-app-info', () => ({
    launcherDir: LAUNCHER_DIR, appsDir: APPS_DIR,
    configDir: CONFIG_DIR, isPackaged: app.isPackaged,
    platform: process.platform, arch: process.arch,
    nodeVersion: process.version, electronVersion: process.versions.electron
  }));

  ipcMain.handle('check-node', async () => {
    return new Promise((resolve) => {
      const child = spawn(process.platform === 'win32' ? 'cmd' : 'sh',
        process.platform === 'win32' ? ['/c', 'node', '--version'] : ['-c', 'node --version'],
        { shell: true, timeout: 5000, windowsHide: true }
      );
      let output = '';
      child.stdout.on('data', (d) => { output += d.toString(); });
      child.stderr.on('data', (d) => { output += d.toString(); });
      child.on('close', (code) => {
        resolve(code === 0 && output.trim() ? { found: true, version: output.trim() } : { found: false });
      });
      child.on('error', () => resolve({ found: false }));
    });
  });

  ipcMain.handle('download-node', async () => {
    return new Promise((resolve) => {
      const url = 'https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi';
      const filePath = path.join(os.tmpdir(), 'node-installer.msi');
      const file = fs.createWriteStream(filePath);
      https.get(url, (response) => {
        const stream = response.statusCode >= 300 && response.statusCode < 400
          ? https.get(response.headers.location, (r) => { r.pipe(file); file.on('finish', () => { file.close(); resolve({ ok: true, path: filePath }); }); })
          : response;
        stream.pipe(file);
        file.on('finish', () => { file.close(); resolve({ ok: true, path: filePath }); });
      }).on('error', (e) => resolve({ ok: false, error: e.message }));
    });
  });

  ipcMain.on('run-installer', (event, installerPath) => {
    const child = spawn('msiexec', ['/i', installerPath, '/passive'], { windowsHide: false });
    child.on('close', (code) => { event.sender.send('installer-complete', { code }); });
  });

  ipcMain.handle('get-obs-urls', () => ({
    dancers: { url: 'http://localhost:3333', label: 'Club Dancers', width: 1920, height: 1080 },
    soundboard: { url: 'http://localhost:3000/overlay', label: 'SoundBoard', width: 1920, height: 1080 },
    dancefloor: { url: 'http://localhost:3131/overlay.html', label: 'Dancefloor Lichtshow', width: 1920, height: 1080 }
  }));

  // ── Backup & Restore ─────────────────────────────────────────────────────
  // Full export of ALL settings across all 3 apps + launcher
  ipcMain.handle('export-backup', () => {
    try {
      const backup = {
        _meta: {
          app: 'VirtualTwitchClub',
          version: '1.0.7',
          exportDate: new Date().toISOString(),
          type: 'full-backup'
        },
        launcher: null,
        soundboard: { config: null, credentials: null, mediaFiles: [] },
        dancers: null,
        dancefloor: { scenes: null }
      };

      // 1) Launcher config
      try {
        if (fs.existsSync(CONFIG_FILE)) {
          backup.launcher = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        }
      } catch (e) { console.error('[Backup] Launcher config error:', e.message); }

      // 2) SoundBoard config.json (chat_commands, links, settings, file_settings)
      try {
        const sbConfigPath = path.join(APPS_DIR, 'soundboard', 'config.json');
        if (fs.existsSync(sbConfigPath)) {
          backup.soundboard.config = JSON.parse(fs.readFileSync(sbConfigPath, 'utf-8'));
        }
      } catch (e) { console.error('[Backup] SoundBoard config error:', e.message); }

      // 3) SoundBoard credentials.enc (raw encrypted content)
      try {
        const sbCredPath = path.join(APPS_DIR, 'soundboard', 'credentials.enc');
        if (fs.existsSync(sbCredPath)) {
          backup.soundboard.credentials = fs.readFileSync(sbCredPath, 'utf-8');
        }
      } catch (e) { console.error('[Backup] SoundBoard credentials error:', e.message); }

      // 4) SoundBoard media file lists (names only, not actual files)
      try {
        const soundsDir = path.join(APPS_DIR, 'soundboard', 'sounds');
        const videosDir = path.join(APPS_DIR, 'soundboard', 'videos');
        if (fs.existsSync(soundsDir)) {
          backup.soundboard.mediaFiles.push({
            type: 'sounds',
            files: fs.readdirSync(soundsDir).filter(f => /^(mp3|wav|ogg|m4a|webm)$/i.test(path.extname(f)))
          });
        }
        if (fs.existsSync(videosDir)) {
          backup.soundboard.mediaFiles.push({
            type: 'videos',
            files: fs.readdirSync(videosDir).filter(f => /^(mp4|webm|avi|mov)$/i.test(path.extname(f)))
          });
        }
      } catch (e) { console.error('[Backup] SoundBoard media list error:', e.message); }

      // 5) Dancers config
      try {
        const dancersConfigFile = path.join(CONFIG_DIR, 'dancers', 'config.json');
        if (fs.existsSync(dancersConfigFile)) {
          backup.dancers = JSON.parse(fs.readFileSync(dancersConfigFile, 'utf-8'));
        }
      } catch (e) { console.error('[Backup] Dancers config error:', e.message); }

      // 6) Dancefloor scenes
      try {
        const scenesFile = path.join(APPS_DIR, 'dancefloor', 'data', 'scenes.json');
        if (fs.existsSync(scenesFile)) {
          backup.dancefloor.scenes = JSON.parse(fs.readFileSync(scenesFile, 'utf-8'));
        }
      } catch (e) { console.error('[Backup] Dancefloor scenes error:', e.message); }

      console.log('[Backup] Export complete');
      return { ok: true, data: backup };
    } catch (e) {
      console.error('[Backup] Export failed:', e.message);
      return { ok: false, error: e.message };
    }
  });

  // Full import/restore of ALL settings
  ipcMain.handle('import-backup', (event, backupData) => {
    try {
      if (!backupData || !backupData._meta || backupData._meta.type !== 'full-backup') {
        return { ok: false, error: 'Ungueltige Backup-Datei' };
      }

      let restored = { launcher: false, soundboard: { config: false, credentials: false }, dancers: false, dancefloor: false };

      // 1) Launcher config
      try {
        if (backupData.launcher && typeof backupData.launcher === 'object') {
          if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
          fs.writeFileSync(CONFIG_FILE, JSON.stringify(backupData.launcher, null, 2), 'utf-8');
          // Re-propagate credentials to all apps
          propagateCredentials(backupData.launcher);
          restored.launcher = true;
        }
      } catch (e) { console.error('[Restore] Launcher error:', e.message); }

      // 2) SoundBoard config.json
      try {
        if (backupData.soundboard && backupData.soundboard.config) {
          const sbConfigPath = path.join(APPS_DIR, 'soundboard', 'config.json');
          const sbDir = path.dirname(sbConfigPath);
          if (!fs.existsSync(sbDir)) fs.mkdirSync(sbDir, { recursive: true });
          fs.writeFileSync(sbConfigPath, JSON.stringify(backupData.soundboard.config, null, 2), 'utf-8');
          restored.soundboard.config = true;
        }
      } catch (e) { console.error('[Restore] SoundBoard config error:', e.message); }

      // 3) SoundBoard credentials.enc
      try {
        if (backupData.soundboard && backupData.soundboard.credentials) {
          const sbCredPath = path.join(APPS_DIR, 'soundboard', 'credentials.enc');
          fs.writeFileSync(sbCredPath, backupData.soundboard.credentials, 'utf-8');
          restored.soundboard.credentials = true;
        }
      } catch (e) { console.error('[Restore] SoundBoard credentials error:', e.message); }

      // 4) Dancers config
      try {
        if (backupData.dancers && typeof backupData.dancers === 'object') {
          const dancersDir = path.join(CONFIG_DIR, 'dancers');
          if (!fs.existsSync(dancersDir)) fs.mkdirSync(dancersDir, { recursive: true });
          fs.writeFileSync(path.join(dancersDir, 'config.json'), JSON.stringify(backupData.dancers, null, 2), 'utf-8');
          restored.dancers = true;
        }
      } catch (e) { console.error('[Restore] Dancers config error:', e.message); }

      // 5) Dancefloor scenes
      try {
        if (backupData.dancefloor && backupData.dancefloor.scenes) {
          const scenesDir = path.join(APPS_DIR, 'dancefloor', 'data');
          if (!fs.existsSync(scenesDir)) fs.mkdirSync(scenesDir, { recursive: true });
          fs.writeFileSync(path.join(scenesDir, 'scenes.json'), JSON.stringify(backupData.dancefloor.scenes, null, 2), 'utf-8');
          restored.dancefloor = true;
        }
      } catch (e) { console.error('[Restore] Dancefloor scenes error:', e.message); }

      console.log('[Restore] Import complete:', JSON.stringify(restored));
      return { ok: true, restored: restored };
    } catch (e) {
      console.error('[Restore] Import failed:', e.message);
      return { ok: false, error: e.message };
    }
  });

  // ── Get Backup Summary (what would be exported) ──────────────────────────
  ipcMain.handle('get-backup-summary', () => {
    try {
      const summary = { launcher: false, soundboard: { config: false, credentials: false, sounds: 0, videos: 0, links: 0, commands: 0, blacklist: 0, whitelist: 0 }, dancers: false, dancefloor: { scenes: 0 } };

      // Launcher
      summary.launcher = fs.existsSync(CONFIG_FILE);

      // SoundBoard
      try {
        const sbConfigPath = path.join(APPS_DIR, 'soundboard', 'config.json');
        if (fs.existsSync(sbConfigPath)) {
          const cfg = JSON.parse(fs.readFileSync(sbConfigPath, 'utf-8'));
          summary.soundboard.config = true;
          summary.soundboard.links = Object.keys(cfg.links || {}).length;
          summary.soundboard.commands = Object.keys(cfg.chat_commands || {}).length;
          const bl = (cfg.settings || {}).blacklist_artists || [];
          const wl = (cfg.settings || {}).whitelist_artists || [];
          summary.soundboard.blacklist = bl.length;
          summary.soundboard.whitelist = wl.length;
        }
      } catch (e) {}
      try { summary.soundboard.credentials = fs.existsSync(path.join(APPS_DIR, 'soundboard', 'credentials.enc')); } catch (e) {}
      try {
        const sd = path.join(APPS_DIR, 'soundboard', 'sounds');
        if (fs.existsSync(sd)) summary.soundboard.sounds = fs.readdirSync(sd).filter(f => /^(mp3|wav|ogg|m4a|webm)$/i.test(path.extname(f))).length;
      } catch (e) {}
      try {
        const vd = path.join(APPS_DIR, 'soundboard', 'videos');
        if (fs.existsSync(vd)) summary.soundboard.videos = fs.readdirSync(vd).filter(f => /^(mp4|webm|avi|mov)$/i.test(path.extname(f))).length;
      } catch (e) {}

      // Dancers
      try { summary.dancers = fs.existsSync(path.join(CONFIG_DIR, 'dancers', 'config.json')); } catch (e) {}

      // Dancefloor
      try {
        const sf = path.join(APPS_DIR, 'dancefloor', 'data', 'scenes.json');
        if (fs.existsSync(sf)) summary.dancefloor.scenes = JSON.parse(fs.readFileSync(sf, 'utf-8')).length;
      } catch (e) {}

      return { ok: true, summary: summary };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.on('show-setup', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('show-setup-wizard');
    }
  });
}

// ── App Lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

  // Set up media permissions BEFORE creating window
  setupMediaPermissions();

  setupIPC();
  createMainWindow();
  createTray();

  const config = loadConfig();
  const isFirstRun = !config || !config.channel;

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Launcher] Main window loaded');
    if (isFirstRun) {
      mainWindow.webContents.send('show-setup-wizard');
    } else {
      // Existing user - start services and show content
      startAllServices();
      sendStatusToRenderer();
    }
  });
});

app.on('window-all-closed', () => { /* tray keeps app alive */ });
app.on('before-quit', () => { isQuitting = true; stopAllServices(); });
app.on('activate', () => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show(); });

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT]', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});
