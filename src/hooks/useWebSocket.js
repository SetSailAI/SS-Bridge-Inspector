import { useState, useCallback, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import { STORAGE_KEY } from '../constants';

function generateUserId(channel, sessionPrefix) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')
    .toUpperCase();
  return `${sessionPrefix}_${channel}_${timestamp}_${random}`;
}

function isEmptyObject(obj) {
  return obj && typeof obj === 'object' && Object.keys(obj).length === 0;
}

function getParameters(channel, customParams = {}) {
  const params = {};
  if (channel === 'kiosk') params.platform = 'kiosk';
  return { ...params, ...customParams };
}

function stripEmptyParameters(payload) {
  const result = { ...payload };
  if (result.parameters !== undefined && isEmptyObject(result.parameters)) {
    delete result.parameters;
  }
  return result;
}

export function useWebSocket(config) {
  const [connectionState, setConnectionState] = useState('disconnected');
  const [socket, setSocket] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [logs, setLogs] = useState([]);
  const nextLogIdRef = useRef(0);
  const configRef = useRef(null);
  const userIdRef = useRef(null);
  // Tracks the timestamp of the last received bot_message for history replay
  const lastReceivedAtRef = useRef(null);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const addLog = useCallback((direction, payload) => {
    const id = nextLogIdRef.current++;
    const timestamp = new Date().toISOString();
    const json = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
    setLogs((prev) => [...prev, { id, direction, timestamp, json }]);
  }, []);

  const addSentLog = useCallback((payload) => addLog('sent', payload), [addLog]);
  const addReceivedLog = useCallback((payload) => addLog('received', payload), [addLog]);

  const connect = useCallback((config) => {
    const { serverUrl, apiKey, path, chatbotId, pageId, channel, sessionPrefix, customParams = {}, injectParam = [], since } = config;
    configRef.current = config;

    const protocol = serverUrl.startsWith('wss://') || serverUrl.startsWith('https://') ? 'wss://' : 'ws://';
    const cleanUrl = serverUrl.replace(/^(ws|wss|http|https):\/\//, '');
    const socketUrl = `${protocol}${cleanUrl}`;
    // Reuse existing userId if provided (history replay must use same userId to hit the right Redis key)
    const userId = config.reuseUserId && userIdRef.current
      ? userIdRef.current
      : generateUserId(channel || 'app', sessionPrefix || '');
    userIdRef.current = userId;

    setConnectionState('connecting');

    const newSocket = io(socketUrl, {
      path: path || '/engine/ws/socket.io/',
      auth: {
        api_key: apiKey,
        token: apiKey,
        user_id: userId,
        ...(since != null && { since }),
      },
      transports: ['websocket', 'polling'],
      reconnection: false,
    });

    newSocket.on('connect', () => {
      setConnectionState('connected');
      addReceivedLog({ event: 'connect', userId });

      try {
        const cfg = configRef.current;
        if (cfg) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            url: cfg.serverUrl,
            api_key: cfg.apiKey,
            path: cfg.path,
            chatbot_id: cfg.chatbotId,
            page_id: cfg.pageId,
            inject_param_input: cfg.injectParamInput || '[]',
          }));
        }
      } catch {}


      // Skip set_lang_english when reconnecting mid-conversation (since= set)
      // — sending it would reset bot state and generate a spurious welcome message
      if (!since) {
        const messagePayload = {
          sender: { id: userId },
          recipient: { id: 'BOT' },
          message: { text: 'set_lang_english' },
          chatbot_id: chatbotId,
          page_id: pageId,
          first_message: true,
          inject_param: injectParam,
          timestamp: Date.now(),
        };
        const setLangPayload = { message: messagePayload };
        newSocket.emit('client-message', setLangPayload);
        addSentLog(setLangPayload);
      }
    });

    newSocket.on('disconnect', (reason) => {
      setConnectionState('disconnected');
      addReceivedLog({ event: 'disconnect', reason });
    });

    newSocket.on('connect_error', (error) => {
      setConnectionState('error');
      addReceivedLog({ event: 'connect_error', message: error.message });
    });

    newSocket.on('message', (data) => {
      addReceivedLog({ event: 'message', data });
    });

    newSocket.on('bot_message', (data) => {
      addReceivedLog({ event: 'bot_message', data });
      // Track the latest message timestamp for history replay
      if (data?.timestamp) {
        lastReceivedAtRef.current = data.timestamp;
      }
    });

    setSocket(newSocket);
  }, [addReceivedLog, addSentLog]);

  const disconnect = useCallback(() => {
    if (socket) {
      socket.disconnect();
      socket.removeAllListeners();
      setSocket(null);
      setConnectionState('disconnected');
    }
  }, [socket]);

  const send = useCallback((overrides = {}) => {
    const text = messageInput.trim();
    if (!text || !socket) return;

    const config = configRef.current;
    const userId = userIdRef.current;
    if (!config || !userId) return;
    const injectParam = Array.isArray(overrides.injectParam) ? overrides.injectParam : (config.injectParam || []);

    const payload = {
      message: {
        page_id: config.pageId,
        chatbot_id: config.chatbotId,
        sender: { id: userId },
        recipient: { id: 'BOT' },
        message: { text },
        inject_param: injectParam,
        timestamp: Date.now(),
      }
    };

    socket.emit('client-message', payload);
    addSentLog(payload);
    setMessageInput('');
  }, [messageInput, socket, addSentLog]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const clearAndReconnect = useCallback(() => {
    const config = configRef.current;
    if (!config?.sessionPrefix?.trim()) return;
    setLogs([]);
    if (socket) {
      socket.disconnect();
      socket.removeAllListeners();
      setSocket(null);
    }
    setConnectionState('disconnected');
    if (config) {
      setTimeout(() => connect(config), 100);
    }
  }, [socket, connect]);

  // Simulate a transport-level drop (bridge sees "transport close" → grace period starts)
  // without sending an explicit disconnect packet
  const simulateDrop = useCallback(() => {
    if (!socket) return;
    addLog('system', { event: 'simulate_drop', userId: userIdRef.current, note: 'Closing transport directly — bridge will see transport close and start grace period' });
    // Close the underlying transport without sending a disconnect packet
    // This makes the bridge treat it as an unexpected drop, not an explicit disconnect
    socket.io.engine.close();
    socket.removeAllListeners();
    setSocket(null);
    setConnectionState('disconnected');
  }, [socket, addLog]);

  // Reconnect with `since` set to lastReceivedAt to test history replay
  const testHistoryReplay = useCallback(() => {
    const since = lastReceivedAtRef.current;
    if (socket) {
      // Also use transport close here so bridge starts grace period if not already in one
      socket.io.engine.close();
      socket.removeAllListeners();
      setSocket(null);
    }
    setConnectionState('disconnected');
    const config = configRef.current;
    if (config) {
      addLog('system', { event: 'history_replay_test', since, userId: userIdRef.current, note: `Reconnecting with same userId and since=${since}` });
      setTimeout(() => connect({ ...config, since, reuseUserId: true }), 100);
    }
  }, [socket, connect, addLog]);

  const isConnected = connectionState === 'connected';
  const configDisabled = isConnected || connectionState === 'connecting';

  return {
    connectionState,
    isConnected,
    configDisabled,
    messageInput,
    setMessageInput,
    logs,
    clearLogs,
    connect,
    disconnect,
    send,
    clearAndReconnect,
    simulateDrop,
    testHistoryReplay,
    lastReceivedAt: lastReceivedAtRef.current,
  };
}
