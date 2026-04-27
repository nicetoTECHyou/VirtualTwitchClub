// ═══════════════════════════════════════════════════════════════
// TwitchDancefloor - WebSocket Client v5
// Added: scenes-state, scene-applied events
// ═══════════════════════════════════════════════════════════════
const OverlaySocket = (() => {
  let socket = null;
  let reconnectTimer = null;
  let reconnectDelay = 1000;
  const listeners = {};

  function on(event, callback) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
  }

  function emit(event, data) {
    if (socket && socket.connected) socket.emit(event, data);
  }

  function connect() {
    if (socket && socket.connected) return;
    socket = io({ transports: ['websocket', 'polling'], reconnection: true, reconnectionAttempts: 20, reconnectionDelay: 2000 });

    socket.on('connect', () => {
      console.log('[WS] Connected');
      reconnectDelay = 1000;
      trigger('connected', true);
    });

    socket.on('disconnect', () => {
      console.log('[WS] Disconnected');
      trigger('connected', false);
    });

    socket.on('effects-state', (data) => trigger('effects-state', data));
    socket.on('effect-update', (data) => trigger('effect-update', data));
    socket.on('commands-state', (data) => trigger('commands-state', data));
    socket.on('scenes-state', (data) => trigger('scenes-state', data));
    socket.on('scene-applied', (data) => trigger('scene-applied', data));
    socket.on('channel-status', (data) => trigger('channel-status', data));
    socket.on('audio-data', (data) => trigger('audio-data', data));
    socket.on('chat-trigger', (data) => trigger('chat-trigger', data));
    socket.on('chat-message', (data) => trigger('chat-message', data));
  }

  function trigger(event, data) {
    (listeners[event] || []).forEach(cb => cb(data));
  }

  return { connect, on, emit };
})();
