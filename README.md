# Virtual Twitch Club

All-in-One Twitch Stream Tool Suite von nicetoTECHyou.

## Was ist das?

Virtual Twitch Club verbindet drei Tools in einer einzigen Anwendung:

- **Club Dancers** - South-Park-style Tanz-Avatare im OBS Overlay, gesteuert durch Twitch Chat
- **SoundBoard** - Sound- und Video-Alerts mit Queue-System und Voting
- **Dancefloor** - Musik-reaktive Lichtshow fuer OBS

## One-Click Setup

1. `VirtualTwitchClub.exe` herunterladen und starten
2. Setup-Wizard durchgehen (Twitch Kanal + OAuth Token eingeben)
3. Fertig! Alle 3 Admin-Panels oeffnen sich automatisch

## OBS Setup

1. In OBS unter "Quellen" auf **+** klicken
2. **Browser** waehlen
3. URL eintragen:
   - Club Dancers: `http://localhost:3333`
   - SoundBoard: `http://localhost:3000/overlay`
   - Dancefloor: `http://localhost:3131/overlay.html`
4. Breite: 1920, Hoehe: 1080

## Entwicklung

```bash
# Alle Abhaengigkeiten installieren
npm run install:all

# Launcher starten
npm run start:launcher

# EXE bauen
npm run build
```

## Projekte

| Projekt | Port | Original Repo |
|---------|------|---------------|
| Club Dancers | 3333 | [VirtualClubDancers](https://github.com/nicetoTECHyou/VirtualClubDancers) |
| SoundBoard | 3000 + 3001 | [TwitchSoundBoard](https://github.com/nicetoTECHyou/TwitchSoundBoard) |
| Dancefloor | 3131 | [TwitchDancefloor](https://github.com/nicetoTECHyou/TwitchDancefloor) |

## Lizenz

MIT - nicetoTECHyou
