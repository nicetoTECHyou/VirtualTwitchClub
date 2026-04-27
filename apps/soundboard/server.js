// =============================================
// TwitchSoundBoard – Server v0.6.1
// YouTube Embed (kein Download!)
// =============================================

const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

try { require('dotenv').config(); } catch (e) {}

const SOUNDS_DIR = path.join(__dirname, 'sounds');
const VIDEOS_DIR = path.join(__dirname, 'videos');
const CONFIG_PATH = path.join(__dirname, 'config.json');
const CRED_PATH = path.join(__dirname, 'credentials.enc');

[SOUNDS_DIR, VIDEOS_DIR].forEach(d => {
  try { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); } catch (e) {}
});

function log(lvl, msg) {
  console.log('[' + new Date().toISOString() + '] [' + lvl + '] ' + msg);
}

// ---- Config ----
let config = {};
function loadConfig() {
  try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); }
  catch (e) {
    config = {
      chat_commands: {},
      links: {},
      settings: { allow_overlap: false, max_queue_size: 10, sound_volume: 0.8, video_volume: 0.5, command_prefix: '!', video_duration_override_ms: 5000, chat_now_playing: false, chat_queue_enabled: false, voting_enabled: false, voting_threshold: 5 }
    };
    saveConfig();
  }
}
function saveConfig() {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch (e) { log('ERROR', 'Config speichern: ' + e.message); }
}
loadConfig();

// ---- Verschluesselung (AES-256-CBC) ----
let ENC_KEY = null;
try { ENC_KEY = crypto.scryptSync('TwitchSoundBoard_v1', 'local_salt', 32); }
catch (e) { ENC_KEY = crypto.createHash('sha256').update('TwitchSoundBoard_fallback_key').digest(); }

function encrypt(text) {
  try { const iv = crypto.randomBytes(16); const c = crypto.createCipheriv('aes-256-cbc', ENC_KEY, iv); let e = c.update(text, 'utf8', 'hex'); e += c.final('hex'); return iv.toString('hex') + ':' + e; }
  catch (e) { return text; }
}
function decrypt(raw) {
  try { const p = raw.split(':'); if (p.length < 2) return raw; const iv = Buffer.from(p[0], 'hex'); const d = crypto.createDecipheriv('aes-256-cbc', ENC_KEY, iv); let r = d.update(p.slice(1).join(':'), 'hex', 'utf-8'); r += d.final('utf-8'); return r; }
  catch (e) { return raw; }
}
function loadCredentials() {
  try { const raw = fs.readFileSync(CRED_PATH, 'utf-8'); const data = JSON.parse(raw); const out = {}; for (const k in data) { try { out[k] = (data[k] && typeof data[k] === 'string' && data[k].startsWith('enc:')) ? decrypt(data[k].slice(4)) : data[k]; } catch (e) { out[k] = data[k]; } } return out; }
  catch (e) { return {}; }
}
function saveCredentials(creds) {
  try { const data = {}; for (const k in creds) { data[k] = creds[k] ? 'enc:' + encrypt(String(creds[k])) : ''; } fs.writeFileSync(CRED_PATH, JSON.stringify(data, null, 2)); }
  catch (e) { log('ERROR', 'Credentials speichern: ' + e.message); }
}

// ---- Multer ----
let upload = null;
try {
  const multer = require('multer');
  const storage = multer.diskStorage({
    destination: function(req, file, cb) { var isVid = /\.(mp4|webm|avi|mov)$/i.test(file.originalname); cb(null, isVid ? VIDEOS_DIR : SOUNDS_DIR); },
    filename: function(req, file, cb) { cb(null, Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9._\- ]/g, '_')); }
  });
  upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 }, fileFilter: function(req, file, cb) { /\.(mp3|wav|ogg|m4a|mp4|webm|avi|mov)$/i.test(file.originalname) ? cb(null, true) : cb(new Error('Erlaubt: mp3, wav, ogg, m4a, mp4, webm')); } });
} catch (e) { log('ERROR', 'Multer nicht geladen: ' + e.message); }

// =============================================
// YouTube EMBED Import (kein Download!)
// =============================================

function isYtUrl(url) { return /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)[a-zA-Z0-9_-]{6,}/i.test(url); }
function extractYtVideoId(url) { var m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/i); return m ? m[1] : null; }

// YouTube Titel via noembed.com (keine API-Key noetig)
function getYtTitle(videoId) {
  return new Promise(function(resolve, reject) {
    var url = 'https://noembed.com/embed?url=https://www.youtube.com/watch?v=' + videoId;
    https.get(url, { headers: { 'User-Agent': 'TwitchSoundBoard/0.5.0' } }, function(resp) {
      var data = '';
      resp.on('data', function(chunk) { data += chunk; });
      resp.on('end', function() {
        try { var json = JSON.parse(data); resolve(json.title || 'YouTube Video'); }
        catch (e) { reject(e); }
      });
    }).on('error', reject).setTimeout(8000, function() { reject(new Error('Timeout')); });
  });
}

// ---- Blacklist Pruefung ----
function isBlacklisted(title, artist) {
  var bl = (config.settings || {}).blacklist_artists || [];
  if (bl.length === 0) return null;
  var titleLower = (title || '').toLowerCase();
  var artistLower = (artist || '').toLowerCase();
  var combined = (artist ? artist + ' - ' + title : title).toLowerCase();
  for (var i = 0; i < bl.length; i++) {
    var entry = bl[i].trim().toLowerCase();
    if (!entry) continue;
    if (artistLower.indexOf(entry) !== -1) return { match: bl[i].trim, field: 'artist' };
    if (titleLower.indexOf(entry) !== -1) return { match: bl[i].trim, field: 'title' };
    if (combined.indexOf(entry) !== -1) return { match: bl[i].trim, field: 'combined' };
  }
  return null;
}

// YouTube Embed Import (Video als Embed, kein Download!)
async function importYouTubeEmbed(url, skipBlacklist) {
  var videoId = extractYtVideoId(url);
  if (!videoId) throw new Error('Ungueltige YouTube URL');

  // Titel holen
  var title = 'YouTube Video';
  try { title = await getYtTitle(videoId); } catch (e) { log('WARN', 'YT Titel konnte nicht geholt werden: ' + e.message); }

  // Blacklist Pruefung (bei Chat-Links)
  if (!skipBlacklist) {
    var blocked = isBlacklisted(title, '');
    if (blocked) {
      throw new Error('BLACKLIST: "' + title + '" - blockiert durch Blacklist-Eintrag: ' + blocked.match);
    }
  }

  var linkId = 'yt_' + videoId;

  if (!config.links) config.links = {};
  config.links[linkId] = {
    link_type: 'yt_embed',
    video_id: videoId,
    title: title,
    artist: '',
    original_url: url,
    duration_ms: 0
  };
  saveConfig();

  log('INFO', 'YT Embed importiert: "' + title + '" (ID: ' + videoId + ')');
  return { link_id: linkId, title: title, video_id: videoId, embed_type: 'yt_video' };
}

// ---- Port ----
var PORT = 3000, WS_PORT = 3001;
try { PORT = parseInt(process.env.PORT) || 3000; WS_PORT = parseInt(process.env.WS_PORT) || 3001; } catch (e) {}

// =============================================
// Express Server
// =============================================
const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '10mb' }));
app.use('/media/sounds', express.static(SOUNDS_DIR));
app.use('/media/videos', express.static(VIDEOS_DIR));

// =============================================
// API – Media (Dateien)
// =============================================
app.get('/api/sounds', function(req, res) {
  try {
    var fs_cfg = config.file_settings || {};
    var files = fs.readdirSync(SOUNDS_DIR).filter(function(f) { return /\.(mp3|wav|ogg|m4a|webm)$/i.test(f); })
      .map(function(f) { var st = fs_cfg[f] || {}; return { name: f, path: '/media/sounds/' + f, size: fs.statSync(path.join(SOUNDS_DIR, f)).size, duration_ms: st.duration_ms || null, display_name: st.display_name || null }; });
    res.json(files);
  } catch (e) { res.json([]); }
});

app.get('/api/videos', function(req, res) {
  try {
    var fs_cfg = config.file_settings || {};
    var files = fs.readdirSync(VIDEOS_DIR).filter(function(f) { return /\.(mp4|webm|avi|mov)$/i.test(f); })
      .map(function(f) { var st = fs_cfg[f] || {}; return { name: f, path: '/media/videos/' + f, size: fs.statSync(path.join(VIDEOS_DIR, f)).size, duration_ms: st.duration_ms || null, display_name: st.display_name || null }; });
    res.json(files);
  } catch (e) { res.json([]); }
});

app.post('/api/upload', function(req, res) {
  if (!upload) return res.status(500).json({ error: 'Upload nicht verfuegbar' });
  upload.array('files', 20)(req, res, function(err) {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'Keine Dateien' });
    var out = req.files.map(function(f) {
      var isVid = f.path.indexOf('videos') !== -1;
      return { name: f.filename, originalName: f.originalname, path: isVid ? '/media/videos/' + f.filename : '/media/sounds/' + f.filename, type: isVid ? 'video' : 'sound', size: f.size };
    });
    log('INFO', out.length + ' Datei(en) hochgeladen');
    res.json({ uploaded: out });
  });
});

app.delete('/api/media/:type/:filename', function(req, res) {
  var type = req.params.type, filename = decodeURIComponent(req.params.filename);
  var dir = type === 'video' ? VIDEOS_DIR : SOUNDS_DIR;
  var fp = path.join(dir, filename);
  if (fp.indexOf(dir) !== 0) return res.status(403).json({ error: 'Blocked' });
  try {
    fs.unlinkSync(fp);
    for (var k in (config.chat_commands || {})) { if (config.chat_commands[k].file === filename) delete config.chat_commands[k]; }
    if (config.file_settings) delete config.file_settings[filename];
    saveConfig(); log('INFO', 'Geloescht: ' + filename); res.json({ success: true });
  } catch (e) { res.status(404).json({ error: 'Nicht gefunden' }); }
});

// =============================================
// API – Embed Links
// =============================================
app.get('/api/links', function(req, res) {
  try {
    var links = config.links || {};
    var arr = [];
    for (var id in links) {
      var l = links[id];
      arr.push({
        link_id: id,
        link_type: l.link_type,
        title: l.title,
        video_id: l.video_id,
        duration_ms: l.duration_ms !== undefined ? l.duration_ms : null,
        display_name: l.title
      });
    }
    res.json(arr);
  } catch (e) { res.json([]); }
});

app.delete('/api/links/:linkId', function(req, res) {
  var linkId = decodeURIComponent(req.params.linkId);
  if (!config.links || !config.links[linkId]) return res.status(404).json({ error: 'Link nicht gefunden' });
  var title = config.links[linkId].title;
  delete config.links[linkId];
  // Commands die diesen Link nutzen auch loeschen
  for (var k in (config.chat_commands || {})) { if (config.chat_commands[k].file === linkId) delete config.chat_commands[k]; }
  saveConfig();
  log('INFO', 'Link geloescht: ' + linkId + ' ("' + title + '")');
  res.json({ success: true });
});

// =============================================
// API – Export / Import Links
// =============================================
app.get('/api/links/export', function(req, res) {
  try {
    var links = config.links || {};
    var cmds = config.chat_commands || {};
    var data = { version: getVersion(), exported: new Date().toISOString(), links: links, chat_commands: cmds };
    res.setHeader('Content-Disposition', 'attachment; filename="twitchsoundboard-links-export.json"');
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/links/import', function(req, res) {
  var body = req.body;
  if (!body || !body.links) return res.status(400).json({ error: 'Ungueltige Export-Datei' });
  try {
    if (!config.links) config.links = {};
    var imported = 0;
    for (var id in body.links) {
      var l = body.links[id];
      if (l.link_type === 'yt_embed' && l.video_id) {
        config.links[id] = l;
        imported++;
      }
    }
    if (body.chat_commands && imported > 0) {
      if (!config.chat_commands) config.chat_commands = {};
      for (var cmd in body.chat_commands) {
        var c = body.chat_commands[cmd];
        if (c.type === 'link' && config.links[c.file]) {
          config.chat_commands[cmd] = c;
        }
      }
    }
    saveConfig();
    broadcast({ type: 'config_reloaded', config: config });
    log('INFO', 'Links importiert: ' + imported);
    res.json({ ok: true, imported: imported });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// =============================================
// API – File Settings
// =============================================
app.put('/api/media/settings', function(req, res) {
  var body = req.body; if (!body.filename) return res.status(400).json({ error: 'filename noetig' });
  if (!config.file_settings) config.file_settings = {};
  var f = config.file_settings[body.filename] || {};
  if (body.duration_ms !== undefined && body.duration_ms !== null && body.duration_ms !== '') { f.duration_ms = parseInt(body.duration_ms); }
  else if (body.duration_ms === null || body.duration_ms === '') { delete f.duration_ms; }
  if (body.display_name !== undefined && body.display_name !== null && body.display_name !== '') { f.display_name = String(body.display_name); }
  else if (body.display_name === null || body.display_name === '') { delete f.display_name; }
  if (Object.keys(f).length === 0) { delete config.file_settings[body.filename]; } else { config.file_settings[body.filename] = f; }
  saveConfig(); log('INFO', 'Datei-Settings: ' + body.filename); res.json({ ok: true, settings: f });
});

// Link Settings (duration, display_name)
app.put('/api/links/settings', function(req, res) {
  var body = req.body; if (!body.link_id) return res.status(400).json({ error: 'link_id noetig' });
  if (!config.links) config.links = {};
  var l = config.links[body.link_id];
  if (!l) return res.status(404).json({ error: 'Link nicht gefunden' });
  if (body.duration_ms !== undefined && body.duration_ms !== null && body.duration_ms !== '') { l.duration_ms = parseInt(body.duration_ms); }
  else if (body.duration_ms === null || body.duration_ms === '') { delete l.duration_ms; }
  if (body.display_name !== undefined && body.display_name !== null && body.display_name !== '') { l.title = String(body.display_name); }
  if (body.artist !== undefined) { l.artist = typeof body.artist === 'string' ? body.artist : ''; }
  saveConfig(); log('INFO', 'Link-Settings: ' + body.link_id); res.json({ ok: true });
});

// =============================================
// API – Config
// =============================================
app.get('/api/config', function(req, res) { res.json(config); });
app.put('/api/config', function(req, res) { config = req.body; saveConfig(); broadcast({ type: 'config_reloaded', config: config }); res.json({ ok: true }); });

app.post('/api/config/commands', function(req, res) {
  var body = req.body;
  if (!body.command || !body.file || !body.type) return res.status(400).json({ error: 'Felder fehlen' });
  if (!config.chat_commands) config.chat_commands = {};
  config.chat_commands[body.command] = { file: body.file, type: body.type }; saveConfig();
  broadcast({ type: 'config_reloaded', config: config });
  log('INFO', 'Command "' + body.command + '" -> "' + body.file + '" (' + body.type + ')');
  res.json({ ok: true });
});

app.delete('/api/config/commands/:command', function(req, res) {
  var cmd = decodeURIComponent(req.params.command);
  if (config.chat_commands && config.chat_commands[cmd]) { delete config.chat_commands[cmd]; saveConfig(); broadcast({ type: 'config_reloaded', config: config }); }
  res.json({ ok: true });
});

app.put('/api/config/settings', function(req, res) {
  config.settings = Object.assign({}, config.settings, req.body); saveConfig();
  broadcast({ type: 'config_reloaded', config: config }); res.json({ ok: true });
});

// =============================================
// API – Test Trigger
// =============================================
app.post('/api/test-trigger', function(req, res) {
  var body = req.body; if (!body.file || !body.type) return res.status(400).json({ error: 'file und type noetig' });
  triggerOverlay(body.file, body.type, 'test', 'Admin'); res.json({ ok: true });
});

// =============================================
// API – YouTube Embed Import
// =============================================
app.post('/api/import', function(req, res) {
  var url = (req.body.url || '').trim();
  if (!url) return res.status(400).json({ error: 'URL noetig' });

  if (isYtUrl(url)) {
    importYouTubeEmbed(url, true).then(function(result) {
      broadcast({ type: 'config_reloaded', config: config });
      res.json({ ok: true, 'import': result });
    }).catch(function(err) {
      log('ERROR', 'YT Embed Import Error: ' + err.message);
      res.status(500).json({ error: err.message });
    });
  } else {
    res.status(400).json({ error: 'Nur YouTube Links unterstuetzt' });
  }
});

// =============================================
// API – Credentials
// =============================================
app.get('/api/credentials', function(req, res) {
  var creds = loadCredentials(); var masked = {};
  for (var k in creds) { var v = creds[k]; if (!v) { masked[k] = ''; } else if (k.indexOf('token') !== -1 || k.indexOf('secret') !== -1) { masked[k] = v.length > 4 ? '****' + v.slice(-4) : '****'; } else { masked[k] = v; } }
  var hasAny = false; for (var kk in creds) { if (creds[kk]) { hasAny = true; break; } }
  res.json({ masked: masked, hasValues: hasAny });
});

app.put('/api/credentials', function(req, res) {
  var existing = loadCredentials(); var body = req.body;
  for (var k in body) { if (body[k] && typeof body[k] === 'string' && body[k].indexOf('****') !== 0) { existing[k] = body[k]; } }
  saveCredentials(existing); log('INFO', 'Credentials gespeichert'); res.json({ ok: true });
});

// =============================================
// Chat Helpers
// =============================================
function sendChat(msg) {
  try {
    var creds = loadCredentials();
    if (chatClient && creds.twitch_channel && msg) {
      chatClient.say('#' + creds.twitch_channel, msg);
      log('INFO', 'Chat: ' + msg);
    }
  } catch (e) {}
}

function getItemDisplay(item) {
  if (!item) return '';
  if (item.artist && item.title) return item.artist + ' - ' + item.title;
  if (item.title) return item.title;
  if (item.embedType) return '[' + item.embedType + '] ' + item.videoId;
  return item.file || '';
}

// Song-Change Detection
var lastPlayedLabel = null;

function checkSongChange(state) {
  var s = config.settings || {};
  if (!s.chat_now_playing) { lastPlayedLabel = null; return; }
  if (!state || !state.isPlaying || !state.current) {
    if (lastPlayedLabel) { lastPlayedLabel = null; }
    return;
  }
  var label = state.current.label || state.current.file || '';
  if (label && label !== lastPlayedLabel) {
    lastPlayedLabel = label;
    var user = state.current.user || 'System';
    sendChat('Now Playing: ' + label + ' (von ' + user + ')');
  }
}

// =============================================
// Hot or Not Voting System
// =============================================
var activeVote = null; // { linkId, videoId, label, hot: {}, not: {}, resolved: false }

function resetVote() {
  activeVote = null;
  broadcast({ type: 'vote_reset' });
}

function startVote(linkId) {
  var s = config.settings || {};
  if (!s.voting_enabled) return;
  var link = (config.links || {})[linkId];
  if (!link || link.link_type !== 'yt_embed') return;

  var label = getItemDisplay({ artist: link.artist, title: link.title });
  activeVote = { linkId: linkId, videoId: link.video_id, label: label, hot: {}, not: {}, resolved: false };

  broadcast({
    type: 'vote_start',
    linkId: linkId,
    label: label,
    threshold: s.voting_threshold || 5
  });

  // Bot fordert zum Voten auf
  sendChat(label + ' - Votet !Hot oder !Not um ueber die Zukunft des Liedes zu entscheiden');
  log('INFO', 'Voting gestartet: ' + label);
}

function castVote(user, voteType) {
  if (!activeVote || activeVote.resolved) return;
  var s = config.settings || {};
  var threshold = s.voting_threshold || 5;
  var userId = user.toLowerCase();

  // Doppel-Vote verhindern
  if (activeVote.hot[userId]) return sendChat('@' + user + ' Du hast bereits fuer Hot gevotet!');
  if (activeVote.not[userId]) return sendChat('@' + user + ' Du hast bereits fuer Not gevotet!');

  if (voteType === 'hot') {
    activeVote.hot[userId] = true;
    log('INFO', 'Vote Hot: ' + user + ' (' + Object.keys(activeVote.hot).length + '/' + threshold + ') fuer ' + activeVote.label);
  } else {
    activeVote.not[userId] = true;
    log('INFO', 'Vote Not: ' + user + ' (' + Object.keys(activeVote.not).length + '/' + threshold + ') fuer ' + activeVote.label);
  }

  var hotCount = Object.keys(activeVote.hot).length;
  var notCount = Object.keys(activeVote.not).length;

  broadcast({
    type: 'vote_update',
    hot: hotCount,
    not: notCount,
    threshold: threshold,
    label: activeVote.label
  });

  // Threshold erreicht?
  if (hotCount >= threshold) {
    activeVote.resolved = true;
    sendChat(activeVote.label + ' - Das Volk hat gesprochen! HOT mit ' + hotCount + ' Stimmen! Der Track bleibt!');
    broadcast({ type: 'vote_result', result: 'hot', hot: hotCount, not: notCount, threshold: threshold, label: activeVote.label });
    log('INFO', 'Voting Ergebnis: HOT - ' + activeVote.label);
    setTimeout(resetVote, 5000);
  } else if (notCount >= threshold) {
    activeVote.resolved = true;
    sendChat(activeVote.label + ' - Das Volk hat gesprochen! NOT mit ' + notCount + ' Stimmen! Der Track fliegt!');
    broadcast({ type: 'vote_result', result: 'not', hot: hotCount, not: notCount, threshold: threshold, label: activeVote.label });
    log('INFO', 'Voting Ergebnis: NOT - ' + activeVote.label);

    // Track aus Datenbank entfernen und skippen
    var linkId = activeVote.linkId;
    if (config.links && config.links[linkId]) {
      delete config.links[linkId];
      for (var k in (config.chat_commands || {})) { if (config.chat_commands[k].file === linkId) delete config.chat_commands[k]; }
      saveConfig();
      broadcast({ type: 'config_reloaded', config: config });
      log('INFO', 'Voting NOT: Link geloescht ' + linkId);
    }
    broadcast({ type: 'queue_skip' });
    setTimeout(resetVote, 5000);
  }
}

// =============================================
// Chat Link Handler (!ytlink)
// =============================================
async function handleChatLink(url, user) {
  try {
    if (!isYtUrl(url)) { log('WARN', 'Chat Link: Ungueltige URL von ' + user + ': ' + url); return; }
    var videoId = extractYtVideoId(url);
    if (!videoId) { log('WARN', 'Chat Link: Ungueltige YT URL von ' + user); return; }
    var linkId = 'yt_' + videoId;
    var result;
    // Pruefe ob bereits importiert
    if ((config.links || {})[linkId]) {
      var link = config.links[linkId];
      result = { link_id: linkId, title: link.title, video_id: link.video_id, artist: link.artist || '' };
    } else {
      result = await importYouTubeEmbed(url, false);
      result.artist = '';
    }

    var artist = (result.artist || '').trim();
    var title = result.title || '';

    // Blacklist Pruefung (zuerst! Blacklist > Whitelist)
    var blocked = isBlacklisted(title, artist);
    if (blocked) {
      log('INFO', 'Chat !ytlink: BLACKLIST "' + title + '" (Eintrag: ' + blocked.match + ', Feld: ' + blocked.field + ') von ' + user);
      try {
        var creds = loadCredentials();
        if (chatClient && creds.twitch_channel) {
          chatClient.say('#' + creds.twitch_channel, '@' + user + ' Dieser Song darf wegen Twitch-Richtlinien nicht gespielt werden.');
        }
      } catch (e) {}
      return;
    }

    // Artist Whitelist Pruefung
    var whitelist = (config.settings || {}).whitelist_artists || [];
    if (whitelist.length > 0) {
      var isWhitelisted = artist && whitelist.some(function(a) { return a.trim().toLowerCase() === artist.toLowerCase(); });
      if (!isWhitelisted) {
        log('INFO', 'Chat !ytlink: Blockiert' + (artist ? ' (Artist "' + artist + '" nicht freigegeben)' : ' (kein Artist gesetzt)') + ' von ' + user);
        try {
          var creds2 = loadCredentials();
          if (chatClient && creds2.twitch_channel) {
            if (!artist) {
              chatClient.say('#' + creds2.twitch_channel, '@' + user + ' Song wurde importiert aber kein Artist eingetragen. Ein Admin muss den Artist eintragen und freigeben.');
            } else {
              chatClient.say('#' + creds2.twitch_channel, '@' + user + ' Der Artist "' + artist + '" ist nicht freigegeben.');
            }
          }
        } catch (e) {}
        return;
      }
    }

    triggerOverlay(result.link_id, 'link', 'chat', user);
    log('INFO', 'Chat !ytlink: "' + result.title + '" von ' + user);
  } catch (e) {
    // Blacklist-Fehler beim Import
    if (e.message && e.message.indexOf('BLACKLIST:') === 0) {
      log('INFO', 'Chat !ytlink: BLACKLIST Import-Block von ' + user + ': ' + e.message);
      try {
        var creds3 = loadCredentials();
        if (chatClient && creds3.twitch_channel) {
          chatClient.say('#' + creds3.twitch_channel, '@' + user + ' Dieser Song darf wegen Twitch-Richtlinien nicht gespielt werden.');
        }
      } catch (e2) {}
      return;
    }
    log('ERROR', 'Chat Link Fehler von ' + user + ': ' + e.message);
  }
}

// =============================================
// API – Twitch (tmi.js)
// =============================================
var chatClient = null, twitchRunning = false;

app.get('/api/twitch/status', function(req, res) { var creds = loadCredentials(); res.json({ running: twitchRunning, channel: creds.twitch_channel || null }); });

app.post('/api/twitch/start', function(req, res) {
  if (twitchRunning) return res.status(400).json({ error: 'Laeuft bereits' });
  var creds = loadCredentials();
  if (!creds.twitch_channel) return res.status(400).json({ error: 'Kanalname fehlt' });
  if (!creds.twitch_bot_token) return res.status(400).json({ error: 'Bot-Token fehlt' });
  try {
    var tmi = require('tmi.js');
    var token = creds.twitch_bot_token;
    if (token.indexOf('oauth:oauth:') === 0) token = token.slice(6);
    if (token.indexOf('oauth:') !== 0) token = 'oauth:' + token;
    chatClient = new tmi.Client({ identity: { username: creds.twitch_bot_username || creds.twitch_channel, password: token }, channels: [creds.twitch_channel] });
    chatClient.on('connected', function(addr, port) { twitchRunning = true; log('INFO', 'Twitch Chat: #' + creds.twitch_channel); res.json({ ok: true, channel: creds.twitch_channel }); });
    chatClient.on('disconnected', function(reason) { twitchRunning = false; log('WARN', 'Twitch getrennt: ' + reason); });
    chatClient.on('chat', function(channel, userstate, message, self) {
      if (self) return;
      var prefix = (config.settings || {}).command_prefix || '!';
      if (message.indexOf(prefix) === 0) {
        var parts = message.split(' ');
        var cmd = parts[0].toLowerCase();
        var rest = parts.slice(1).join(' ').trim();
        var user = userstate['display-name'] || 'Viewer';

        // Configurierte Commands
        var mapping = config.chat_commands || {};
        if (mapping[cmd]) {
          triggerOverlay(mapping[cmd].file, mapping[cmd].type, 'chat', user);
          return;
        }

        // !ytlink <url> – YouTube Video direkt aus Chat abspielen
        if (cmd === prefix + 'ytlink' && rest) {
          handleChatLink(rest, user);
          return;
        }

        // !queue – Aktuelle Queue anzeigen
        if (cmd === prefix + 'queue') {
          var qs = (config.settings || {}).chat_queue_enabled;
          if (!qs) { sendChat('@' + user + ' Die Queue-Anzeige ist deaktiviert.'); return; }
          var st = overlayQueueState;
          if (!st.isPlaying && (!st.queue || st.queue.length === 0)) {
            sendChat('@' + user + ' Die Queue ist leer.'); return;
          }
          var lines = [];
          if (st.isPlaying && st.current) {
            lines.push('Jetzt: ' + getItemDisplay(st.current));
          }
          if (st.queue && st.queue.length > 0) {
            var max = Math.min(st.queue.length, 5);
            for (var i = 0; i < max; i++) {
              lines.push('#' + (i + (st.isPlaying ? 2 : 1)) + ' ' + getItemDisplay(st.queue[i]));
            }
            if (st.queue.length > 5) {
              lines.push('... und ' + (st.queue.length - 5) + ' weitere');
            }
          }
          sendChat(lines.join(' | '));
          return;
        }

        // !hot – Vote Hot
        if (cmd === prefix + 'hot') {
          if (!activeVote) { sendChat('@' + user + ' Es laeuft gerade keine Abstimmung.'); return; }
          castVote(user, 'hot');
          return;
        }

        // !not – Vote Not
        if (cmd === prefix + 'not') {
          if (!activeVote) { sendChat('@' + user + ' Es laeuft gerade keine Abstimmung.'); return; }
          castVote(user, 'not');
          return;
        }
      }
    });
    chatClient.on('error', function(err) { log('ERROR', 'Twitch: ' + (err.message || JSON.stringify(err))); });
    chatClient.connect().catch(function(e) { log('ERROR', 'Twitch Connect: ' + e.message); if (!twitchRunning) { res.status(500).json({ error: e.message || 'Verbindung fehlgeschlagen' }); } });
  } catch (e) { log('ERROR', 'Twitch Start: ' + e.message); res.status(500).json({ error: e.message }); }
});

app.post('/api/twitch/stop', function(req, res) {
  if (!twitchRunning) return res.status(400).json({ error: 'Laeuft nicht' });
  try {
    if (chatClient) { chatClient.disconnect().then(function() { chatClient = null; twitchRunning = false; log('INFO', 'Twitch gestoppt'); res.json({ ok: true }); }).catch(function(e) { chatClient = null; twitchRunning = false; res.json({ ok: true }); }); }
    else { twitchRunning = false; res.json({ ok: true }); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// =============================================
// API – Vote Status (fuer Admin)
// =============================================
app.get('/api/vote', function(req, res) {
  if (!activeVote) return res.json({ active: false });
  var s = config.settings || {};
  var threshold = s.voting_threshold || 5;
  res.json({
    active: true,
    resolved: activeVote.resolved,
    linkId: activeVote.linkId,
    videoId: activeVote.videoId,
    label: activeVote.label,
    hot: Object.keys(activeVote.hot).length,
    not: Object.keys(activeVote.not).length,
    threshold: threshold,
    hotVoters: Object.keys(activeVote.hot),
    notVoters: Object.keys(activeVote.not)
  });
});

// =============================================
// API – Health
// =============================================
app.get('/api/health', function(req, res) {
  var creds = loadCredentials(); var sndCount = 0, vidCount = 0, linkCount = 0;
  try { sndCount = fs.readdirSync(SOUNDS_DIR).filter(function(f) { return /\.(mp3|wav|ogg|m4a|webm)$/i.test(f); }).length; } catch (e) {}
  try { vidCount = fs.readdirSync(VIDEOS_DIR).filter(function(f) { return /\.(mp4|webm|avi|mov)$/i.test(f); }).length; } catch (e) {}
  linkCount = Object.keys(config.links || {}).length;
  res.json({ status: 'ok', uptime: process.uptime(), version: getVersion(), twitch: { running: twitchRunning, channel: creds.twitch_channel || null }, sounds: sndCount, videos: vidCount, links: linkCount, overlayClients: overlayClients.size });
});

// =============================================
// API – Queue Management
// =============================================
var overlayQueueState = { queue: [], current: null, isPlaying: false };

app.get('/api/queue', function(req, res) {
  res.json(overlayQueueState);
});

app.post('/api/queue/skip', function(req, res) {
  broadcast({ type: 'queue_skip' });
  log('INFO', 'Queue: Skip angefordert');
  res.json({ ok: true });
});

app.post('/api/queue/clear', function(req, res) {
  broadcast({ type: 'queue_clear' });
  log('INFO', 'Queue: Clear angefordert');
  res.json({ ok: true });
});

app.post('/api/queue/stop', function(req, res) {
  broadcast({ type: 'queue_stop' });
  log('INFO', 'Queue: Stop angefordert (aktuelles + Queue)');
  res.json({ ok: true });
});

// =============================================
// Pages
// =============================================
app.get('/admin', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'admin.html')); });
app.get('/overlay', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'overlay.html')); });
app.get('/vote', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'vote.html')); });
app.get('/', function(req, res) { res.redirect('/admin'); });

// =============================================
// WebSocket (Overlay)
// =============================================
var wss = null, overlayClients = new Set();
try {
  wss = new WebSocket.Server({ port: WS_PORT });
  wss.on('error', function(err) {
    if (err.code === 'EADDRINUSE') { log('WARN', 'WS Port ' + WS_PORT + ' belegt, versuche ' + (WS_PORT+1)); try { wss = new WebSocket.Server({ port: WS_PORT + 1 }); log('INFO', 'WS auf Port ' + (WS_PORT+1)); } catch (e2) { log('ERROR', 'WS Start fehlgeschlagen'); } }
    else { log('ERROR', 'WS: ' + err.message); }
  });
} catch (e) { log('ERROR', 'WS Init: ' + e.message); }

if (wss) wss.on('connection', function(ws) {
  log('INFO', 'Overlay verbunden (' + (overlayClients.size + 1) + ')');
  overlayClients.add(ws);
  try { ws.send(JSON.stringify({ type: 'init', config: config })); } catch (e) {}
  ws.on('close', function() { overlayClients.delete(ws); });
  ws.on('error', function() {});
  ws.on('message', function(raw) {
    try {
      var msg = JSON.parse(raw);
      if (msg.type === 'queue_state') {
        overlayQueueState = msg.state || { queue: [], current: null, isPlaying: false };
        checkSongChange(overlayQueueState);

        // Voting starten wenn neuer Link spielt
        var cur = overlayQueueState.current;
        if (overlayQueueState.isPlaying && cur && cur.file && cur.mediaType === 'link') {
          if (!activeVote || activeVote.linkId !== cur.file) {
            resetVote();
            startVote(cur.file);
          }
        } else if (!overlayQueueState.isPlaying) {
          resetVote();
        }
      }
    } catch (e) {}
  });
});

function broadcast(data) { var msg = JSON.stringify(data); overlayClients.forEach(function(c) { if (c.readyState === WebSocket.OPEN) { try { c.send(msg); } catch (e) {} } }); }

function triggerOverlay(file, type, source, user) {
  var s = config.settings || {};
  var dur;

  if (type === 'link') {
    // Embed Link (YouTube)
    var link = (config.links || {})[file];
    if (!link) { log('WARN', 'Trigger: Link "' + file + '" nicht gefunden'); return; }

    // Dauer: Link-Einstellung > Global
    if (link.duration_ms !== undefined && link.duration_ms !== null) {
      dur = link.duration_ms;
    } else {
      dur = s.video_duration_override_ms || 5000;
    }

    broadcast({
      type: 'play', file: file, mediaType: 'link',
      embedType: 'yt_video', videoId: link.video_id,
      title: link.title || '', artist: link.artist || '',
      source: source, user: user || 'System',
      volume: s.video_volume || 0.5,
      allowOverlap: s.allow_overlap || false, maxQueue: s.max_queue_size || 10,
      durationOverride: dur
    });

  } else {
    // Normale Datei (Sound / Video)
    var fs_cfg = (config.file_settings || {})[file] || {};
    if (type === 'video') {
      if (fs_cfg.duration_ms !== undefined && fs_cfg.duration_ms !== null) { dur = fs_cfg.duration_ms; }
      else { dur = s.video_duration_override_ms || 5000; }
    } else {
      dur = (fs_cfg.duration_ms != null && fs_cfg.duration_ms > 0) ? fs_cfg.duration_ms : null;
    }
    broadcast({
      type: 'play', file: file, mediaType: type, source: source, user: user || 'System',
      volume: type === 'video' ? (s.video_volume || 0.5) : (s.sound_volume || 0.8),
      allowOverlap: s.allow_overlap || false, maxQueue: s.max_queue_size || 10,
      durationOverride: dur
    });
  }
  log('INFO', 'Trigger: ' + type + ' "' + file + '" von ' + (user || 'System') + ' (' + source + ')');
}

// =============================================
// Helpers
// =============================================
function getVersion() { try { return fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf-8').trim(); } catch (e) { return '0.0.0'; } }

process.on('SIGINT', function() {
  log('INFO', 'Shutdown...');
  try { if (chatClient) chatClient.disconnect(); } catch (e) {}
  try { server.close(); } catch (e) {}
  try { if (wss) wss.close(); } catch (e) {}
  process.exit(0);
});

console.log('');
console.log('========================================');
console.log('  TwitchSoundBoard v' + getVersion());
console.log('========================================');
server.listen(PORT, function() {
  console.log('  Admin:    http://localhost:' + PORT + '/admin');
  console.log('  Overlay:  http://localhost:' + PORT + '/overlay');
  console.log('========================================');
  log('INFO', 'Server laeuft - oeffne http://localhost:' + PORT + '/admin');
  console.log('');
});
