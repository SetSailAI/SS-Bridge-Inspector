import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from './hooks/useWebSocket';

const DEFAULT_URL = 'https://dev.setsailapi.com';
const DEFAULT_API_KEY = 'Ba6C7ouMwZ0HqH8VX7WL6cCba0KwrC0sfBt5p-Hwdr0';
const DEFAULT_PATH = '/engine/ws/socket.io/';
const DEFAULT_CHATBOT_ID = '20250221114007914GB1ALRNKNH';
const DEFAULT_PAGE_ID = 'aahk-demo-kmzmz9d';

function App() {
  const logsContainerRef = useRef(null);
  const [serverUrl, setServerUrl] = useState(DEFAULT_URL);
  const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);
  const [path, setPath] = useState(DEFAULT_PATH);
  const [chatbotId, setChatbotId] = useState(DEFAULT_CHATBOT_ID);
  const [pageId, setPageId] = useState(DEFAULT_PAGE_ID);
  const [channel, setChannel] = useState('app');
  const [sessionPrefix, setSessionPrefix] = useState('');
  const [customParams, setCustomParams] = useState({});
  const [customParamInput, setCustomParamInput] = useState('');
  const [paramInputError, setParamInputError] = useState('');

  const parseParamInput = (input) => {
    const colonIndex = input.indexOf(':');
    if (colonIndex === -1) return null;
    const key = input.slice(0, colonIndex).trim();
    const valueStr = input.slice(colonIndex + 1).trim();
    if (!key) return null;
    try {
      const value = JSON.parse(valueStr);
      return { key, value };
    } catch {
      return null;
    }
  };

  const handleAddParam = () => {
    setParamInputError('');
    const parsed = parseParamInput(customParamInput);
    if (!parsed) {
      setParamInputError('Invalid format. Use key:value (value must be valid JSON)');
      return;
    }
    setCustomParams((prev) => ({ ...prev, [parsed.key]: parsed.value }));
    setCustomParamInput('');
  };

  const handleRemoveParam = (key) => {
    setCustomParams((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const mergedParams = { ...(channel === 'kiosk' ? { platform: 'kiosk' } : {}), ...customParams };

  const {
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
  } = useWebSocket({ serverUrl, apiKey, path, chatbotId, pageId, channel, sessionPrefix, customParams });

  const handleConnect = () => connect({
    serverUrl,
    apiKey,
    path,
    chatbotId,
    pageId,
    channel,
    sessionPrefix,
    customParams,
  });

  const canConnect = sessionPrefix.trim() !== '';

  useEffect(() => {
    const el = logsContainerRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [logs]);

  return (
    <div className="app">
      <header>
        <h1>WebSocket POC</h1>
      </header>

      <div className="app-layout">
        <div className="config-column">
          <section className="connection">
            <h2>Connection</h2>
            <div className="connection-row">
              <label>
                Server URL
                <input
                  type="text"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="ws://localhost:3000"
                  disabled={configDisabled}
                />
              </label>
            </div>
            <div className="connection-row">
              <label>
                API Key
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="test_api_key_123"
                  disabled={configDisabled}
                />
              </label>
            </div>
            <div className="connection-row">
              <label>
                Path
                <input
                  type="text"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/engine/ws/socket.io/"
                  disabled={configDisabled}
                />
              </label>
            </div>
            <div className="connection-row">
              <label>
                Chatbot ID
                <input
                  type="text"
                  value={chatbotId}
                  onChange={(e) => setChatbotId(e.target.value)}
                  placeholder="20250221114007914GB1ALRNKNH"
                  disabled={configDisabled}
                />
              </label>
            </div>
            <div className="connection-row">
              <label>
                Page ID
                <input
                  type="text"
                  value={pageId}
                  onChange={(e) => setPageId(e.target.value)}
                  placeholder="aahk-demo-kmzmz9d"
                  disabled={configDisabled}
                />
              </label>
            </div>
            <div className="connection-row">
              <label>
                Channel
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  disabled={configDisabled}
                >
                  <option value="app">app</option>
                  <option value="kiosk">kiosk</option>
                  <option value="widget">widget</option>
                </select>
              </label>
            </div>
            <div className="connection-row">
              <label>
                Session prefix <span className="required">(required)</span>
                <input
                  type="text"
                  value={sessionPrefix}
                  onChange={(e) => setSessionPrefix(e.target.value)}
                  placeholder="Enter session prefix"
                  disabled={configDisabled}
                />
              </label>
            </div>
            <div className="connection-row connection-row-param">
              <label>
                Custom param (key:value)
                <div className="param-row">
                  <input
                    type="text"
                    value={customParamInput}
                    onChange={(e) => {
                      setCustomParamInput(e.target.value);
                      setParamInputError('');
                    }}
                    placeholder='e.g. foo:123 or bar:"hello"'
                    disabled={configDisabled}
                  />
                  <button type="button" onClick={handleAddParam} disabled={configDisabled}>
                    Add
                  </button>
                </div>
                {paramInputError && <span className="param-error">{paramInputError}</span>}
                {Object.keys(customParams).length > 0 && (
                  <div className="param-list">
                    {Object.entries(customParams).map(([key, value]) => (
                      <div key={key} className="param-item">
                        <span className="param-item-text">{key}: {JSON.stringify(value)}</span>
                        <button type="button" onClick={() => handleRemoveParam(key)} className="param-remove">
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </label>
            </div>
            <div className="connection-row">
              <span className={`status status-${connectionState}`}>{connectionState}</span>
              {!isConnected ? (
                <button onClick={handleConnect} disabled={connectionState === 'connecting' || !canConnect}>
                  Connect
                </button>
              ) : (
                <button onClick={disconnect}>Disconnect</button>
              )}
            </div>
          </section>

          <section className="send">
            <h2>Send Message</h2>
            <div className="send-row">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Type message..."
                onKeyDown={(e) => e.key === 'Enter' && send()}
                disabled={!isConnected}
              />
              <button onClick={send} disabled={!isConnected}>
                Send
              </button>
            </div>
            <div className="send-params">
              <span className="send-params-label">Parameters:</span>
              <pre className="send-params-value">
                {JSON.stringify(mergedParams, null, 2)}
              </pre>
            </div>
          </section>
        </div>

        <div className="logs-column">
          <section className="logs">
            <div className="logs-header">
              <h2>Raw Data Log</h2>
              <div className="logs-header-buttons">
                <button onClick={clearLogs} className="clear-btn">
                  Clear
                </button>
                {isConnected && (
                  <button onClick={clearAndReconnect} className="clear-reconnect-btn">
                    Clear & Reconnect
                  </button>
                )}
              </div>
            </div>
            <div className="logs-container" ref={logsContainerRef}>
              {logs.length === 0 ? (
                <p className="log-empty">No messages yet</p>
              ) : (
                logs.map((entry) => (
                  <div
                    key={entry.id}
                    className={`log-entry log-entry-${entry.direction}`}
                  >
                    <span className="log-label">{entry.direction}</span>
                    <span className="log-time">{entry.timestamp}</span>
                    <pre>{entry.json}</pre>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default App;
