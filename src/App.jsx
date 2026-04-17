import { useState, useEffect, useRef, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { STORAGE_KEY } from './constants';

const DEFAULT_URL = 'https://dev.setsailapi.com';
const DEFAULT_PATH = '/engine/ws/socket.io/';

function getInitialConfig() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        serverUrl: parsed.url ?? DEFAULT_URL,
        apiKey: parsed.api_key ?? '',
        path: parsed.path ?? DEFAULT_PATH,
        chatbotId: parsed.chatbot_id ?? '',
        pageId: parsed.page_id ?? '',
        injectParamInput: parsed.inject_param_input ?? '[]',
      };
    }
  } catch {}
  return {
    serverUrl: DEFAULT_URL,
    apiKey: '',
    path: DEFAULT_PATH,
    chatbotId: '',
    pageId: '',
    injectParamInput: '[]',
  };
}

function App() {
  const logsContainerRef = useRef(null);
  const initialConfig = useMemo(() => getInitialConfig(), []);
  const [serverUrl, setServerUrl] = useState(initialConfig.serverUrl);
  const [apiKey, setApiKey] = useState(initialConfig.apiKey);
  const [path, setPath] = useState(initialConfig.path);
  const [chatbotId, setChatbotId] = useState(initialConfig.chatbotId);
  const [pageId, setPageId] = useState(initialConfig.pageId);
  const [channel, setChannel] = useState('app');
  const [sessionPrefix, setSessionPrefix] = useState('');
  const [customParams, setCustomParams] = useState({});
  const [customParamInput, setCustomParamInput] = useState('');
  const [paramInputError, setParamInputError] = useState('');
  const [injectParamInput, setInjectParamInput] = useState(initialConfig.injectParamInput);
  const [injectParamError, setInjectParamError] = useState('');

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

  const buildInjectParam = () => {
    try {
      const parsed = JSON.parse(injectParamInput || '[]');
      if (!Array.isArray(parsed)) {
        return { injectParam: null, error: 'inject_param must be a JSON array' };
      }
      for (const item of parsed) {
        if (!item || typeof item !== 'object' || !('key' in item) || !('value' in item)) {
          return { injectParam: null, error: 'each inject_param item must include key and value' };
        }
      }
      return { injectParam: parsed, error: '' };
    } catch {
      return { injectParam: null, error: 'inject_param must be valid JSON' };
    }
  };

  const handleFillAAHKTemplate = () => {
    setInjectParamInput(
      JSON.stringify(
        [
          { key: 'app_user_id', value: 'YOUR_APP_USER_ID' },
          { key: 'app_flight_ids', value: '[{"id":"CX548","timestamp":1744732800000}]' },
          { key: 'app_has_mytag', value: 'true' },
        ],
        null,
        2
      )
    );
    setInjectParamError('');
  };

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
    simulateDrop,
    testHistoryReplay,
    lastReceivedAt,
  } = useWebSocket({
    serverUrl,
    apiKey,
    path,
    chatbotId,
    pageId,
    channel,
    sessionPrefix,
    customParams,
    injectParam: buildInjectParam().injectParam || [],
    injectParamInput,
  });

  const handleConnect = () => {
    const { injectParam, error } = buildInjectParam();
    if (error) {
      setInjectParamError(error);
      return;
    }
    setInjectParamError('');
    connect({
      serverUrl,
      apiKey,
      path,
      chatbotId,
      pageId,
      channel,
      sessionPrefix,
      customParams,
      injectParam,
    });
  };

  const handleSend = () => {
    const { injectParam, error } = buildInjectParam();
    if (error) {
      setInjectParamError(error);
      return;
    }
    setInjectParamError('');
    send({ injectParam });
  };

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
      <div className="app-layout">

        {/* ── LEFT COLUMN ── */}
        <div className="left-column">

          {/* Config panel — scrolls independently */}
          <div className="config-panel">
            <div className="panel-header">
              <h2>Connection</h2>
              <div className="connection-actions">
                <span className={`status status-${connectionState}`}>{connectionState}</span>
                {!isConnected ? (
                  <button onClick={handleConnect} disabled={connectionState === 'connecting' || !canConnect}>
                    Connect
                  </button>
                ) : (
                  <button onClick={disconnect} className="btn-danger">Disconnect</button>
                )}
              </div>
            </div>

            <div className="connection-row">
              <label>
                Server URL
                <input type="text" value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} disabled={configDisabled} />
              </label>
            </div>
            <div className="connection-row">
              <label>
                API Key
                <input type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={configDisabled} />
              </label>
            </div>
            <div className="connection-row">
              <label>
                Path
                <input type="text" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/engine/ws/socket.io/" disabled={configDisabled} />
              </label>
            </div>
            <div className="connection-row">
              <label>
                Chatbot ID
                <input type="text" value={chatbotId} onChange={(e) => setChatbotId(e.target.value)} disabled={configDisabled} />
              </label>
            </div>
            <div className="connection-row">
              <label>
                Page ID
                <input type="text" value={pageId} onChange={(e) => setPageId(e.target.value)} disabled={configDisabled} />
              </label>
            </div>
            <div className="connection-row">
              <label>
                Channel
                <select value={channel} onChange={(e) => setChannel(e.target.value)} disabled={configDisabled}>
                  <option value="app">app</option>
                  <option value="kiosk">kiosk</option>
                  <option value="widget">widget</option>
                </select>
              </label>
            </div>
            <div className="connection-row">
              <label>
                <span className="label-inline">Session prefix <span className="required">(required)</span></span>
                <input type="text" value={sessionPrefix} onChange={(e) => setSessionPrefix(e.target.value)} placeholder="Enter session prefix" disabled={configDisabled} />
              </label>
            </div>
            <div className="connection-row connection-row-param">
              <label>
                Custom param (key:value)
                <div className="param-row">
                  <input
                    type="text"
                    value={customParamInput}
                    onChange={(e) => { setCustomParamInput(e.target.value); setParamInputError(''); }}
                    placeholder='e.g. foo:123 or bar:"hello"'
                    disabled={configDisabled}
                  />
                  <button type="button" onClick={handleAddParam} disabled={configDisabled}>Add</button>
                </div>
                {paramInputError && <span className="param-error">{paramInputError}</span>}
                {Object.keys(customParams).length > 0 && (
                  <div className="param-list">
                    {Object.entries(customParams).map(([key, value]) => (
                      <div key={key} className="param-item">
                        <span className="param-item-text">{key}: {JSON.stringify(value)}</span>
                        <button type="button" onClick={() => handleRemoveParam(key)} className="param-remove">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </label>
            </div>
            <div className="connection-row">
              <label>
                Inject param (JSON array)
                <textarea
                  value={injectParamInput}
                  onChange={(e) => { setInjectParamInput(e.target.value); setInjectParamError(''); }}
                  placeholder='[{"key":"app_user_id","value":"YOUR_APP_USER_ID"}]'
                  disabled={configDisabled}
                  rows={6}
                />
              </label>
            </div>
            <div className="connection-row button-row">
              <button type="button" onClick={handleFillAAHKTemplate} disabled={configDisabled}>
                AAHK template
              </button>
            </div>
            {injectParamError && (
              <div className="connection-row">
                <span className="param-error">{injectParamError}</span>
              </div>
            )}
          </div>

          {/* Send bar — pinned at bottom of left column */}
          <div className="send-panel">
            <h2>Send Message</h2>
            <div className="send-row">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Type message..."
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                disabled={!isConnected}
              />
              <button onClick={handleSend} disabled={!isConnected} className="btn-send">Send</button>
            </div>
            <div className="send-meta">
              {Object.keys(mergedParams).length > 0 && (
                <div className="send-params">
                  <span className="send-params-label">Parameters:</span>
                  <pre className="send-params-value">{JSON.stringify(mergedParams, null, 2)}</pre>
                </div>
              )}
              {(buildInjectParam().injectParam || []).length > 0 && (
                <div className="send-params">
                  <span className="send-params-label">Inject Param:</span>
                  <pre className="send-params-value">{JSON.stringify(buildInjectParam().injectParam || [], null, 2)}</pre>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="logs-column">
          <div className="logs-header">
            <h2>Raw Data Log</h2>
            <div className="logs-header-buttons">
              {/* Log management */}
              <button onClick={clearLogs} className="clear-btn">Clear</button>
              <button onClick={clearAndReconnect} className="clear-reconnect-btn" disabled={!canConnect}>
                Clear &amp; Reconnect
              </button>
              {/* Simulate transport drop — grace period testing */}
              <button
                onClick={simulateDrop}
                className="simulate-drop-btn"
                disabled={!isConnected}
                title="Close transport directly (bridge sees 'transport close' → starts 15min grace period)"
              >
                Simulate Drop
              </button>
              {/* History replay — debug action, separated visually */}
              <div className="btn-divider" />
              <button
                onClick={testHistoryReplay}
                className="history-replay-btn"
                disabled={!lastReceivedAt}
                title={lastReceivedAt ? `Reconnect with since=${lastReceivedAt}` : 'No messages received yet — receive at least one bot_message first'}
              >
                Test History Replay
                {lastReceivedAt && (
                  <span className="history-replay-since"> (since {new Date(lastReceivedAt).toLocaleTimeString()})</span>
                )}
              </button>
            </div>
          </div>
          <div className="logs-container" ref={logsContainerRef}>
            {logs.length === 0 ? (
              <p className="log-empty">No messages yet</p>
            ) : (
              logs.map((entry) => (
                <div key={entry.id} className={`log-entry log-entry-${entry.direction}`}>
                  <span className="log-label">{entry.direction}</span>
                  <span className="log-time">{entry.timestamp}</span>
                  <pre>{entry.json}</pre>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default App;
