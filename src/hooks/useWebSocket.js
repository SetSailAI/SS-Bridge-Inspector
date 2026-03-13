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
    const { serverUrl, apiKey, path, chatbotId, pageId, channel, sessionPrefix, customParams = {} } = config;
    configRef.current = config;

    const protocol = serverUrl.startsWith('wss://') || serverUrl.startsWith('https://') ? 'wss://' : 'ws://';
    const cleanUrl = serverUrl.replace(/^(ws|wss|http|https):\/\//, '');
    const socketUrl = `${protocol}${cleanUrl}`;
    const userId = generateUserId(channel || 'app', sessionPrefix || '');

    setConnectionState('connecting');

    const newSocket = io(socketUrl, {
      path: path || '/engine/ws/socket.io/',
      auth: {
        api_key: apiKey,
        token: apiKey,
        user_id: userId,
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
          }));
        }
      } catch {}


      const params = getParameters(channel || 'app', customParams);
      const messagePayload = {
        sender: { id: userId },
        recipient: { id: 'BOT' },
        message: { text: 'set_lang_english' },
        chatbot_id: chatbotId,
        page_id: pageId,
        timestamp: Date.now(),
        parameters: params,
      };
      if (isEmptyObject(messagePayload.parameters)) delete messagePayload.parameters;
      const setLangPayload = { message: messagePayload };
      newSocket.emit('client-message', setLangPayload);
      addSentLog(setLangPayload);
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

  const send = useCallback(() => {
    const text = messageInput.trim();
    if (!text || !socket) return;

    const config = configRef.current;
    const params = config ? getParameters(config.channel || 'app', config.customParams) : {};
    const payload = stripEmptyParameters({
      message: text,
      parameters: params,
    });
    socket.emit('user_message', payload);
    addSentLog(payload);
    setMessageInput('');
  }, [messageInput, socket, addSentLog]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const clearAndReconnect = useCallback(() => {
    setLogs([]);
    if (socket) {
      socket.disconnect();
      socket.removeAllListeners();
      setSocket(null);
    }
    setConnectionState('disconnected');
    const config = configRef.current;
    if (config) {
      setTimeout(() => connect(config), 100);
    }
  }, [socket, connect]);

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
  };
}
