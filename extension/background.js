const BRIDGE_URL = 'ws://127.0.0.1:8765';
let socket = null;
let reconnectTimer = null;
let reconnectDelay = 1000;
let activeTabId = null;
const latestByTab = new Map();

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  try {
    socket = new WebSocket(BRIDGE_URL);
    socket.onopen = () => {
      reconnectDelay = 1000;
      sendActive();
    };
    socket.onclose = () => scheduleReconnect();
    socket.onerror = () => socket?.close();
  } catch { scheduleReconnect(); }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
    reconnectDelay = Math.min(reconnectDelay * 2, 30000);
  }, reconnectDelay);
}

function send(message) {
  connect();
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function sendActive() {
  const state = activeTabId == null ? null : latestByTab.get(activeTabId);
  send({ type: 'ACTIVE_TRACK', tabId: activeTabId, state: state || null });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== 'TRACK_STATE' || sender.tab?.id == null) return;
  latestByTab.set(sender.tab.id, message.state);
  if (sender.tab.id === activeTabId) sendActive();
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  activeTabId = tabId;
  sendActive();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  latestByTab.delete(tabId);
  if (tabId === activeTabId) {
    activeTabId = null;
    send({ type: 'ACTIVE_TRACK', tabId, state: null });
  }
});

// Нужен для того, чтобы MV3 service worker не уснул при активном RPC-сеансе.
setInterval(() => send({ type: 'PING' }), 20000);
connect();
chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
  activeTabId = tabs[0]?.id ?? null;
  sendActive();
}).catch(() => {});
