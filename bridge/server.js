const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const http = require('node:http');
const { WebSocketServer } = require('ws');
const { Client } = require('@xhayper/discord-rpc');

const PORT = Number(process.env.PORT || 8765);
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const SHOW_PAUSED = String(process.env.SHOW_PAUSED ?? 'true').toLowerCase() === 'true';
const IMAGE_MODE = process.env.IMAGE_MODE || 'url';
const ASSET_KEY = process.env.DISCORD_ASSET_KEY || 'yandex_music';

if (!/^\d{17,20}$/.test(CLIENT_ID || '')) {
  console.error('Укажите DISCORD_CLIENT_ID (Application ID) в переменных окружения.');
  process.exit(1);
}

const rpc = new Client({ clientId: CLIENT_ID });
let rpcReady = false;
let lastState = null;
let lastActivityKey = '';
let discordRetryTimer = null;
let timingTrackKey = '';
let trackStartedAt = 0;

rpc.on('ready', () => {
  rpcReady = true;
  console.log('Discord RPC подключён.');
  applyState(lastState);
});
rpc.on('error', (error) => {
  rpcReady = false;
  console.error('Discord RPC error:', error.message || error);
});

async function connectDiscord() {
  if (rpcReady) return;
  try {
    await rpc.login();
  } catch (error) {
    rpcReady = false;
    console.error('Discord не запущен или RPC недоступен:', error.message || error);
    if (!discordRetryTimer) {
      discordRetryTimer = setTimeout(() => {
        discordRetryTimer = null;
        connectDiscord();
      }, 10000);
    }
  }
}
connectDiscord();

function clean(value, fallback, max = 128) {
  return String(value || fallback).replace(/[\r\n]/g, ' ').trim().slice(0, max);
}

function applyState(state) {
  lastState = state;
  if (!rpcReady || !rpc.user) return;
  if (!state || (!state.isPlaying && !SHOW_PAUSED)) {
    lastActivityKey = '';
    rpc.user.clearActivity().catch((e) => console.error('Не удалось очистить Activity:', e.message));
    return;
  }

  const duration = Number(state.duration);
  const position = Number(state.position);
  const trackKey = `${state.title || ''}\u0000${state.artist || ''}`;

  // Не пересоздаём начало трека на каждом DOM-событии: таймкод Яндекс.Музыки
  // может колебаться на 1 секунду. Discord сам рисует плавный прогресс между обновлениями.
  if (trackKey !== timingTrackKey || !trackStartedAt) {
    timingTrackKey = trackKey;
    trackStartedAt = Date.now() - (Number.isFinite(position) ? position * 1000 : 0);
  } else if (state.isPlaying && Number.isFinite(position)) {
    const expectedPosition = (Date.now() - trackStartedAt) / 1000;
    // Большой скачок считаем ручной перемоткой, мелкие скачки игнорируем.
    if (Math.abs(position - expectedPosition) > 5) {
      trackStartedAt = Date.now() - position * 1000;
    }
  }
  const activity = {
    details: clean(state.title, 'Неизвестный трек'),
    state: state.isPlaying ? clean(state.artist, 'Неизвестный исполнитель') : 'На паузе',
    type: 2
  };
  if (state.isPlaying) {
    activity.startTimestamp = trackStartedAt;
    if (Number.isFinite(duration) && duration > 0) activity.endTimestamp = trackStartedAt + duration * 1000;
  }
  if (IMAGE_MODE === 'asset') {
    activity.largeImageKey = ASSET_KEY;
  } else if (state.coverUrl && /^https?:\/\//i.test(state.coverUrl)) {
    activity.largeImageKey = state.coverUrl;
  }
  activity.largeImageText = clean(state.artist, 'Яндекс.Музыка');

  const key = JSON.stringify(activity);
  if (key === lastActivityKey) return;
  lastActivityKey = key;
  rpc.user.setActivity(activity).catch((e) => console.error('Не удалось установить Activity:', e.message));
}

const server = http.createServer((req, res) => { res.writeHead(200); res.end('Yandex Music Discord RPC bridge'); });
const wss = new WebSocketServer({ server });
wss.on('error', (error) => console.error('WebSocket server error:', error.message));
wss.on('connection', (client) => {
  console.log('Подключено расширение.');
  client.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.type === 'ACTIVE_TRACK') applyState(message.state);
    } catch (error) { console.error('Некорректное сообщение расширения:', error.message); }
  });
  client.on('close', () => console.log('Расширение отключено.'));
});
server.listen(PORT, '127.0.0.1', () => console.log(`Мост слушает ws://127.0.0.1:${PORT}`));
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Порт ${PORT} уже занят. Завершите старый node server.js или измените PORT в .env.`);
  } else {
    console.error('HTTP server error:', error.message);
  }
  // Не оставляем второй процесс живым: иначе расширение может подключиться
  // к старому мосту, а Discord RPC окажется в другом процессе.
  process.exit(1);
});

process.on('SIGINT', async () => {
  try { if (rpcReady && rpc.user) await rpc.user.clearActivity(); } catch {}
  process.exit(0);
});
