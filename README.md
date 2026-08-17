# Yandex Music → Discord Rich Presence

Chrome extension and local Node.js bridge that show the currently playing Yandex Music track in Discord Rich Presence.

The project is split into two parts because a Chrome extension cannot connect directly to Discord's local IPC socket:

```text
Yandex Music page → Chrome MV3 service worker → WebSocket 127.0.0.1:8765 → Node.js bridge → Discord IPC
```

## Features

- Track title, artists and cover image.
- Play/pause state and elapsed track progress.
- Automatic reconnection after tab, extension or Discord restarts.
- Support for Yandex Music regional domains, including `music.yandex.kz` and `music.yandex.ru`.
- MediaSession metadata fallback.
- Optional `На паузе` status or complete status removal while paused.
- Windows startup shortcut for automatic bridge launch.

## Requirements

- Windows 10/11.
- Google Chrome 116 or newer.
- Node.js LTS.
- Discord desktop application.
- A Discord application with an Application ID.

## Installation

### 1. Create a Discord application

1. Open [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and create an application.
3. Open **General Information**.
4. Copy **Application ID**. This is the Client ID used by the bridge.

Bot tokens, OAuth2 secrets and a Discord bot are not required.

For a reliable cover image, open **Rich Presence → Art Assets**, upload an image and remember its asset key.

### 2. Configure and install the bridge

```powershell
cd .\bridge
Copy-Item .env.example .env
notepad .env
npm install
npm start
```

Set your Application ID in `.env`:

```env
DISCORD_CLIENT_ID=123456789012345678
PORT=8765
SHOW_PAUSED=true
IMAGE_MODE=url
DISCORD_ASSET_KEY=yandex_music
```

For the most compatible Discord cover image, use `IMAGE_MODE=asset` and set `DISCORD_ASSET_KEY` to the uploaded asset key.

Expected output:

```text
Мост слушает ws://127.0.0.1:8765
Discord RPC подключён.
Подключено расширение.
```

### 3. Install the Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `extension` folder from this repository.
5. Open or reload Yandex Music and start a track.

Supported domains currently include `music.yandex.ru`, `music.yandex.kz`, `music.yandex.by`, `music.yandex.com` and `music.yandex.uz`.

## Automatic startup on Windows

After the first successful manual test, run once from the project root:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-autostart.ps1
```

This creates a shortcut in the Windows Startup folder. The bridge starts when you sign in, and the extension connects automatically when Yandex Music is opened.

To remove automatic startup, delete `Yandex Music Discord RPC.lnk` from `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`.

## Troubleshooting

### `EADDRINUSE: address already in use 127.0.0.1:8765`

An old bridge process is already running. The project startup script attempts to stop an old `server.js` bridge before starting a new one. Do not run multiple bridge terminals at the same time.

### `Extension context invalidated`

In `chrome://extensions`, click **Reload**, then close and reopen the Yandex Music tab. This error means the tab still contains a content script from an older extension version.

### No Discord status

Check that Discord desktop is running, `DISCORD_CLIENT_ID` is the Application ID, the bridge says `Discord RPC подключён`, the extension was loaded from this repository's `extension` folder, and the Yandex Music tab was reloaded after installation.

### Cover image is missing

Discord clients do not consistently display arbitrary external image URLs. Upload an image under **Rich Presence → Art Assets** and use `IMAGE_MODE=asset`.

## Project structure

```text
extension/
  manifest.json       Chrome MV3 manifest
  content.js          Yandex Music DOM and MediaSession parser
  background.js       MV3 service worker and WebSocket client

bridge/
  server.js           WebSocket server and Discord RPC integration
  start.js            Windows-safe single-instance launcher
  .env.example        Configuration template
  package.json        Node.js dependencies and scripts

start-bridge.cmd      Startup launcher
install-autostart.ps1 Windows startup shortcut installer
```

## Privacy

The extension reads playback information only from supported Yandex Music pages. Track data is sent to the local bridge at `127.0.0.1`, which sends Rich Presence to the locally running Discord client. No external tracking server is included.

## License

Released under the [MIT License](LICENSE).
