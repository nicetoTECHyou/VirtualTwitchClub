# Virtual Twitch Club

**All-in-One Twitch Stream Tool Suite** von [nicetoTECHyou](https://github.com/nicetoTECHyou)

Drei professionelle Twitch-Stream-Tools in einer einzigen Desktop-App mit zentralem Setup, geteilten Twitch-Credentials und integriertem Backup-System.

---

## Download

Neueste Version: [`VirtualTwitchClub-v1.0.7-Windows.exe`](https://github.com/nicetoTECHyou/VirtualTwitchClub/releases)

Einfach herunterladen, ausfuehren und loslegen. Keine Installation noetig (portable).

---

## Was ist das?

Virtual Twitch Club verbindet drei eigenstaendige Projekte in einer einzigen Electron-App:

| App | Version | Port | Beschreibung |
|-----|---------|------|--------------|
| **Club Dancers** | 2.3.0 | 3333 | South-Park-style Tanz-Avatare im OBS Overlay |
| **SoundBoard** | 0.6.3 | 3000 + 3001 | Sound- & Video-Alerts mit Queue-System |
| **Dancefloor** | 0.0.9 | 3131 | Musik-reaktive Lichtshow fuer OBS |

---

## Features

### Launcher (Zentrale App)

- **One-Click Setup** - Setup-Wizard fuehrt durch Twitch-Konfiguration
- **Tab-Interface** - Alle 3 Admin-Panels in einem Fenster (keine Addressleiste)
- **Service Manager** - Start/Stop/Restart aller 3 Server mit Status-Ueberwachung
- **System Tray** - App laeuft im Hintergrund, Status wird im Tray angezeigt
- **OBS Guide** - Schritt-fuer-Schritt Anleitung mit URL-Kopier-Buttons
- **Media Permissions** - Automatische Berechtigungsvergabe fuer Audio-Quellen in iframes
- **Credential Propagation** - Twitch-Zugangsdaten werden automatisch an alle 3 Apps weitergegeben
- **Backup & Restore** - Komplettes Export/Import aller Einstellungen aus allen Apps (eine JSON-Datei)
- **Health Monitoring** - Automatische Ueberpruefung ob alle Server laufen (alle 3s)
- **Debug Info** - Umfassende Diagnose-Ansicht fuer Fehlerbehebung

### Club Dancers (VirtualClubDancers v2.3.0)

- **Tanz-Avatare** - South-Park-style Charaktere die im OBS Overlay tanzen
- **Twitch Chat Commands**:
  - `!join` - Zum Club beitreten (Avatar wird gespawnt)
  - `!leave` / `!quit` / `!exit` - Club verlassen
  - `!dance [name]` - Spezifischen Tanz ausfuehren
  - `!emote [name]` - Emote ausfuehren (z.B. !emote heart)
  - `!list dances` - Verfuegbare Taenze anzeigen
  - `!list emotes` - Verfuegbare Emotes anzeigen
  - `!stop` - Aktuellen Tanz stoppen
  - `!hug @user` / `!highfive @user` / `!kiss @user` / `!box @user` - Interaktionen
  - `!color [part] [color]` - Avatar-Farbe aendern
- **48 Tanz-Emotes** - disco, shuffle, headbang, robot, moonwalk, etc.
- **20 Social-Emotes** - heart, wave, clap, laugh, cry, angry, etc.
- **Party Modes** - Force-Emote fuer alle Avatare gleichzeitig
- **Beat Detection** - Automatische + manuelle BPM-Erkennung
- **Avatar Management** - Inaktivitaets-Timeout, persoenlicher Raum, Push-Physik
- **Admin Panel** - Avatare spawnen/entfernen, Emote triggern, BPM setzen, Konfetti
- **Scene Settings** - Avatar Scale, Move Zone, Inaktivitaets-Timeout, Push Strength

### SoundBoard (TwitchSoundBoard v0.6.3)

- **Sound & Video Alerts** - Eigene Sounds und Videos hochladen und abspielen
- **YouTube Embed Import** - YouTube-Videos als Embed hinzufuegen (kein Download noetig!)
- **Queue-System** - Automatische Warteschlange mit max. Queue-Groesse
- **Chat Commands** - Viewer koennen Sounds ueber Chat ausloesen
- **!ytlink System** - Viewer koennen YouTube-Links im Chat posten die direkt abgespielt werden
- **Blacklist** - Gesperrte Artists/Titel (DMCA-Schutz) - Blockiert automatisch bei Chat-Links
- **Whitelist** - Freigegebene Artists die abgespielt werden duerfen
- **Voting System (Hot or Not)**:
  - Automatische Abstimmung bei neuen YouTube-Links
  - `!hot` / `!not` - Viewer stimmen ab
  - Konfigurierbarer Threshold - bei "Not" wird der Track automatisch geloescht
- **Now Playing** - Chat-Ankuendigung bei Song-Wechsel (aktivierbar)
- **Queue Commands**:
  - `!queue` - Aktuelle Warteschlange anzeigen
  - Skip, Clear, Stop - Admin-Kontrolle ueber die Queue
- **Konfigurierbare Settings**:
  - Sound Volume / Video Volume
  - Allow Overlap (gleichzeitige Wiedergabe)
  - Max Queue Size
  - Command Prefix (Standard: !)
  - Video Duration Override
  - Voting Threshold
- **Per-File Settings** - Individuelle Dauer und Anzeigename pro Sound/Video
- **Link Settings** - Individuelle Dauer und Artist pro YouTube-Link
- **Overlay** - Transparentes OBS Overlay mit Wiedergabesteuerung

### Dancefloor (TwitchDancefloor v0.0.9)

- **14 Licht-Effekte**:
  - Laser, Scheinwerfer, Nebel, Stroboskop, Lichtkegel
  - Partikel, Equalizer, Taenzer, Farbflut, Spiegelkugel
  - Puls-Ring, Konfetti, Blitze, Rauch
- **Real-Time Audio Analyse** - Bass, Mid, High, Volume, Beat Detection, BPM, EQ-Bands
- **Scene System** (CRUD - Create, Read, Update, Delete):
  - 5 vorinstallierte Scenes: Club, Rave, Chill, Party, Blackout
  - Eigene Scenes erstellen und konfigurieren
  - Jede Scene konfiguriert alle 14 Effekte (an/aus + Intensitaet)
- **Chat Commands**:
  - `!club` / `!rave` / `!chill` / `!party` / `!blackout` - Scene wechseln
  - `!scene <name>` - Scene direkt anspringen
  - Custom Effect-Commands mit konfigurierbarer Cooldown
- **Effect Commands** - Toggle, On, Off fuer jeden Effekt ueber Chat
- **Twitch IRC** - Read-only Chat-Anbindung fuer Command-Verarbeitung
- **Admin Panel** - Effekte steuern, Scenes verwalten, Audio-Source waehlen
- **OBS Overlay** - Transparentes Overlay mit Canvas-Rendering

---

## Backup & Restore

Das integrierte Backup-System exportiert **alle** Einstellungen aus allen 3 Apps in eine einzige JSON-Datei:

**Was wird exportiert:**
- Launcher Config (Twitch Channel, Bot, Token)
- SoundBoard Config (Chat-Commands, YouTube-Links, Settings)
- SoundBoard Blacklist & Whitelist
- SoundBoard Credentials (verschluesselt)
- SoundBoard File-Settings (Dauer, Display-Name pro Datei)
- Club Dancers Config (Twitch, Scene-Settings, Avatar-Config)
- Dancefloor Scenes (alle custom Scenes mit Effekt-Konfiguration)

**Was NICHT exportiert wird:**
- Medien-Dateien (Sound-Dateien in `sounds/`, Videos in `videos/`) - nur die Einstellungen dazu

**Benutzung:**
1. Auf den **Backup**-Button in der Tab-Leiste klicken
2. Uebersicht aller gespeicherten Daten sehen
3. **Export** - Laedt eine `VTC-Backup-YYYY-MM-DD.json` Datei herunter
4. **Import** - Backup-Datei auswaehlen, bestaetigen, fertig
5. Nach dem Import: App neu starten

---

## OBS Setup

### Overlay URLs

| Overlay | URL | Groesse |
|---------|-----|---------|
| Club Dancers | `http://localhost:3333` | 1920x1080 |
| SoundBoard | `http://localhost:3000/overlay` | 1920x1080 |
| Dancefloor | `http://localhost:3131/overlay.html` | 1920x1080 |

### Schritt-fuer-Schritt

1. In OBS Studio unter **Quellen** auf **+** klicken
2. **Browser** waehlen und einen Namen eingeben
3. Die Overlay-URL eintragen (siehe Tabelle oben)
4. Breite: **1920**, Hoehe: **1080**
5. Wiederholen fuer alle 3 Overlays
6. Die Reihenfolge in OBS bestimmt den Vordergrund (zieh zum umordnen)

> **Tipp:** Der eingebaute OBS Guide im Launcher (Button oben rechts) zeigt die URLs und Anleitung jederzeit an.

---

## Systemvoraussetzungen

- **Windows** 10/11 (64-bit)
- **Node.js** v18+ (wird beim ersten Start geprueft, Download-Link wird angeboten)
- **OBS Studio** (fuer die Overlay-Darstellung)
- **Twitch Account** mit OAuth Token (Chat:read + Chat:write Scopes)

---

## Ordnerstruktur

```
VirtualTwitchClub/
  launcher/                    # Electron Launcher App
    src/main.js               # Main Process (Service Manager, IPC, Backup)
    renderer/index.html       # Tab-UI mit Setup-Wizard, OBS Guide, Backup Modal
    preload.js                # IPC Bridge
    assets/                   # Icons
  apps/
    dancers/                   # VirtualClubDancers v2.3.0
      server.js               # Express + Socket.IO + Twitch Bot
      src/                    # Avatar Manager, Beat Detector, Twitch Bot
      data/animations/        # Tanz-Animationen (JSON)
    soundboard/                # TwitchSoundBoard v0.6.3
      server.js               # Express + WebSocket + Twitch Bot
      public/                 # Admin, Overlay, Vote (HTML)
      sounds/                 # Sound-Dateien (mp3, wav, ogg, m4a)
      videos/                 # Video-Dateien (mp4, webm)
    dancefloor/                # TwitchDancefloor v0.0.9
      standalone/server.js    # HTTP + Socket.IO Server
      data/scenes.json        # Custom Scenes
      public/                 # Admin, Overlay (HTML/CSS/JS)
```

**Konfiguration wird gespeichert unter:**
- `~/.virtualtwitchclub/config.json` (Launcher)
- `~/.virtualtwitchclub/dancers/config.json` (Club Dancers)
- `apps/soundboard/config.json` (SoundBoard Settings)
- `apps/soundboard/credentials.enc` (SoundBoard - verschluesselt)
- `apps/dancefloor/data/scenes.json` (Dancefloor Scenes)

---

## Entwicklung

```bash
# Alle Abhaengigkeiten installieren (Launcher + alle 3 Apps)
cd launcher && npm install
cd ../apps/dancers && npm install
cd ../apps/soundboard && npm install
cd ../apps/dancefloor/standalone && npm install

# Launcher starten (Development)
cd launcher && npm start

# Windows portable EXE bauen
cd launcher && npm run build
```

---

## Changelog

### v1.0.7
- **Backup & Restore System** - Alle Einstellungen aus allen 3 Apps exportieren/importieren
- SoundBoard Blacklist & Whitelist im Backup enthalten
- SoundBoard YouTube-Links, Chat-Commands und File-Settings im Backup
- Dancers Scene-Settings und Twitch-Config im Backup
- Dancefloor Custom Scenes im Backup
- Launcher Twitch-Credentials im Backup
- **README komplett ueberarbeitet** - Alle Features dokumentiert

### v1.0.5
- Audio-Quellen-Erkennung gefixt (iframe `allow` Attribute)
- Media Permissions fuer iframes konfiguriert

### v1.0.0 - v1.0.4
- Initiale Version
- iframe-basiertes Tab-System
- Setup-Wizard
- OBS Guide
- Service Manager mit Health Check

---

## Original-Projekte

| Projekt | Repo | Beschreibung |
|---------|------|--------------|
| VirtualClubDancers | [nicetoTECHyou/VirtualClubDancers](https://github.com/nicetoTECHyou/VirtualClubDancers) | Electron App mit Tanz-Avataren |
| TwitchSoundBoard | [nicetoTECHyou/TwitchSoundBoard](https://github.com/nicetoTECHyou/TwitchSoundBoard) | Sound/Video Alert Board |
| TwitchDancefloor | [nicetoTECHyou/TwitchDancefloor](https://github.com/nicetoTECHyou/TwitchDancefloor) | Musik-reaktive Lichtshow |

---

## Lizenz

MIT - nicetoTECHyou
