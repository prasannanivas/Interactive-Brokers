import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { settingsAPI } from '../api/api'
import './SettingsPage.css'
import { ArrowLeft, BellRing, Bot, ChevronDown, ChevronRight, CircleCheck, CircleX, Eye, EyeOff, History, Lock, Megaphone, PlugZap, RefreshCw, Save, Search, Send, UserRound, Users } from 'lucide-react'

const KIND_LABELS = {
  ma_cross: 'MA Cross alert',
  test_alert: 'Test alert',
  connection_test: 'Connection test',
  command_reply: 'Command reply',
}

const formatMs = (ms) => {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`
  return `${(ms / 60000).toFixed(1)} min`
}

const errorText = (err, fallback) => err?.response?.data?.detail || err?.message || fallback

const SettingsPage = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(null) // settings from server
  const [botToken, setBotToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [chatId, setChatId] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [maCrossAlerts, setMaCrossAlerts] = useState(true)
  const [busy, setBusy] = useState(null) // 'save' | 'test' | 'detect' | 'delete'
  const [message, setMessage] = useState(null) // { type: 'success' | 'error', text }
  const [testResult, setTestResult] = useState(null)
  const [detectedChats, setDetectedChats] = useState(null)
  const [showGuide, setShowGuide] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const applySettings = (s) => {
    setSaved(s)
    setChatId(s.chat_id || '')
    setEnabled(s.configured ? s.enabled : true)
    setMaCrossAlerts(s.ma_cross_alerts ?? true)
    setBotToken('')
    setShowGuide(!s.configured)
  }

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const res = await settingsAPI.getTelegramHistory(50)
      setHistory(res.data.messages || [])
    } catch (err) {
      console.error('Failed to load Telegram history:', err)
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
    settingsAPI.getTelegram()
      .then(res => applySettings(res.data))
      .catch(err => {
        setMessage({ type: 'error', text: errorText(err, 'Failed to load settings') })
        setShowGuide(true)
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setBusy('save'); setMessage(null)
    try {
      const res = await settingsAPI.saveTelegram({
        bot_token: botToken.trim() || null,
        chat_id: chatId.trim(),
        enabled,
        ma_cross_alerts: maCrossAlerts,
      })
      applySettings(res.data)
      setMessage({ type: 'success', text: `Saved. Alerts will be sent by @${res.data.bot_username || 'your bot'}.` })
    } catch (err) {
      setMessage({ type: 'error', text: errorText(err, 'Failed to save settings') })
    } finally {
      setBusy(null)
    }
  }

  const handleTest = async () => {
    setBusy('test'); setMessage(null); setTestResult(null)
    try {
      const res = await settingsAPI.testTelegram({ bot_token: botToken.trim() || null, chat_id: chatId.trim() || null })
      setTestResult(res.data)
      loadHistory()
    } catch (err) {
      setTestResult({ ok: false, steps: [{ step: 'Connection', ok: false, message: errorText(err, 'Test failed') }] })
    } finally {
      setBusy(null)
    }
  }

  const handleDetect = async () => {
    setBusy('detect'); setMessage(null); setDetectedChats(null)
    try {
      const res = await settingsAPI.detectTelegramChat({ bot_token: botToken.trim() || null })
      const chats = res.data.chats || []
      setDetectedChats(chats)
      if (chats.length === 1) setChatId(chats[0].chat_id)
    } catch (err) {
      setMessage({ type: 'error', text: errorText(err, 'Could not detect chats') })
    } finally {
      setBusy(null)
    }
  }

  const handleTestAlert = async () => {
    setBusy('alert'); setMessage(null)
    try {
      const res = await settingsAPI.sendTestAlert()
      setMessage({ type: 'success', text: `Test alert delivered in ${res.data.delay_ms} ms (Telegram API ${res.data.telegram_ms} ms). Check your Telegram.` })
      loadHistory()
    } catch (err) {
      setMessage({ type: 'error', text: errorText(err, 'Failed to send test alert') })
    } finally {
      setBusy(null)
    }
  }

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect your Telegram bot? You will stop receiving alerts.')) return
    setBusy('delete'); setMessage(null); setTestResult(null)
    try {
      const res = await settingsAPI.deleteTelegram()
      applySettings(res.data)
      setMessage({ type: 'success', text: 'Telegram disconnected.' })
    } catch (err) {
      setMessage({ type: 'error', text: errorText(err, 'Failed to disconnect') })
    } finally {
      setBusy(null)
    }
  }

  const hasToken = botToken.trim() || saved?.bot_token_masked
  const status = !saved?.configured
    ? { cls: 'off', text: 'Not connected' }
    : !saved.enabled
      ? { cls: 'paused', text: `Paused · @${saved.bot_username || 'bot'}` }
      : { cls: 'on', text: `Connected · @${saved.bot_username || 'bot'}` }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <button className="back-button" onClick={() => navigate('/dashboard')}>
          <ArrowLeft size={15} /> Back to Dashboard
        </button>
        <h1>Settings</h1>
      </div>

      <div className="settings-content">
        <div className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2><Send size={18} /> Telegram Alerts</h2>
              <p className="settings-subtitle">
                Get an instant message on your phone when EMA 9 crosses EMA 21 (MA Cross BUY / SELL).
                Use your own Telegram bot so the alerts come straight to you.
              </p>
            </div>
            {!loading && <span className={`settings-status ${status.cls}`}>{status.text}</span>}
          </div>

          {loading ? (
            <div className="settings-loading">Loading…</div>
          ) : (
            <>
              <button className="guide-toggle" onClick={() => setShowGuide(v => !v)}>
                {showGuide ? <ChevronDown size={15} /> : <ChevronRight size={15} />} How to set up your Telegram bot (about 3 minutes)
              </button>

              {showGuide && (
                <div className="settings-guide">
                  <ol className="guide-steps">
                    <li>
                      <strong>Create your bot with BotFather.</strong>
                      <p>
                        In Telegram, open{' '}
                        <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a>{' '}
                        (the official one has a blue check mark) and send <code>/newbot</code>.
                      </p>
                      <p>
                        Give it a display name (e.g. <em>My FX Alerts</em>), then a username that ends in <code>bot</code>{' '}
                        (e.g. <code>my_fx_alerts_bot</code>).
                      </p>
                    </li>
                    <li>
                      <strong>Copy the token.</strong>
                      <p>
                        BotFather replies with a token that looks like{' '}
                        <code>123456789:AAHk7x...Qw4E</code>. Paste it into <em>Bot Token</em> below.
                      </p>
                    </li>
                    <li>
                      <strong>Start your bot.</strong>
                      <p>
                        Tap the <code>t.me/your_bot</code> link in BotFather's message and press <strong>Start</strong>{' '}
                        (or send it any message, like "hi"). Telegram doesn't let a bot message you until you do this.
                      </p>
                    </li>
                    <li>
                      <strong>Find your Chat ID.</strong>
                      <p>
                        Click <em>Detect my Chat ID</em> below and pick your name. If nothing shows up, send your bot
                        another message and try again. You can also message{' '}
                        <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer">@userinfobot</a>, which replies
                        with your ID.
                      </p>
                    </li>
                    <li>
                      <strong>Test, then save.</strong>
                      <p>
                        Click <em>Test Connection</em>. You should get a "connected" message in Telegram within a few
                        seconds. Then click <em>Save</em>.
                      </p>
                    </li>
                  </ol>

                  <details className="guide-more">
                    <summary>Send alerts to a group or channel instead</summary>
                    <ul>
                      <li><strong>Group:</strong> add your bot to the group, then send <code>/start@your_bot</code> in the group and click <em>Detect my Chat ID</em>. Group IDs start with <code>-</code>.</li>
                      <li><strong>Channel:</strong> add your bot as a channel admin with permission to post, publish any post, then click <em>Detect my Chat ID</em>. Channel IDs start with <code>-100</code>.</li>
                    </ul>
                  </details>

                  <details className="guide-more">
                    <summary>Troubleshooting</summary>
                    <table className="guide-table">
                      <tbody>
                        <tr><td>"Bot token is invalid or was revoked"</td><td>Copy the token again: @BotFather → <code>/mybots</code> → your bot → <em>API Token</em>.</td></tr>
                        <tr><td>"Chat not found" / "can't initiate conversation"</td><td>Open your bot in Telegram and press <strong>Start</strong>, then test again.</td></tr>
                        <tr><td>"You blocked this bot"</td><td>Open the bot chat, tap <em>Unblock</em>, then <em>Start</em>.</td></tr>
                        <tr><td>Detect finds no chats</td><td>Send your bot a new message first. Telegram only keeps recent messages for 24 hours.</td></tr>
                        <tr><td>"webhook set"</td><td>Another app controls this bot. Create a new bot just for alerts, or enter the Chat ID manually.</td></tr>
                      </tbody>
                    </table>
                  </details>

                  <p className="guide-security">
                    <Lock size={13} /> Your token is stored on our server and used only to send you alerts. Never share it with anyone else.
                    If it leaks, send <code>/revoke</code> to @BotFather to get a new one.
                  </p>
                </div>
              )}

              <div className="settings-form">
                <label className="settings-label" htmlFor="bot-token">Bot Token</label>
                <div className="settings-input-row">
                  <input
                    id="bot-token"
                    className="settings-input"
                    type={showToken ? 'text' : 'password'}
                    value={botToken}
                    onChange={e => setBotToken(e.target.value)}
                    placeholder={saved?.bot_token_masked ? `Saved: ${saved.bot_token_masked} (leave blank to keep)` : '123456789:AAH...'}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button className="settings-btn secondary" onClick={() => setShowToken(v => !v)} type="button">
                    {showToken ? <><EyeOff size={14} /> Hide</> : <><Eye size={14} /> Show</>}
                  </button>
                </div>

                <label className="settings-label" htmlFor="chat-id">Chat ID</label>
                <div className="settings-input-row">
                  <input
                    id="chat-id"
                    className="settings-input"
                    type="text"
                    value={chatId}
                    onChange={e => setChatId(e.target.value)}
                    placeholder="e.g. 1167765607 (groups start with -)"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    className="settings-btn secondary"
                    onClick={handleDetect}
                    disabled={!hasToken || busy !== null}
                    type="button"
                    title={hasToken ? 'Find chats that messaged your bot' : 'Enter your bot token first'}
                  >
                    {busy === 'detect' ? 'Detecting…' : <><Search size={14} /> Detect my Chat ID</>}
                  </button>
                </div>

                {detectedChats && (
                  <div className="detected-chats">
                    {detectedChats.length === 0 ? (
                      <p>No messages found. Open your bot in Telegram, press <strong>Start</strong> or send "hi", then click Detect again.</p>
                    ) : (
                      <>
                        <p>{detectedChats.length === 1 ? 'Found your chat and filled it in:' : 'Choose the chat that should receive alerts:'}</p>
                        {detectedChats.map(c => (
                          <button
                            key={c.chat_id}
                            type="button"
                            className={`detected-chat ${chatId === c.chat_id ? 'selected' : ''}`}
                            onClick={() => setChatId(c.chat_id)}
                          >
                            <span>{c.type === 'private' ? <UserRound size={14} /> : c.type === 'channel' ? <Megaphone size={14} /> : <Users size={14} />} {c.name}{c.username ? ` (@${c.username})` : ''}</span>
                            <code>{c.chat_id}</code>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}

                <div className="settings-toggles">
                  <label className="settings-check">
                    <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
                    Send Telegram alerts
                  </label>
                  <label className="settings-check">
                    <input type="checkbox" checked={maCrossAlerts} onChange={e => setMaCrossAlerts(e.target.checked)} disabled={!enabled} />
                    MA Cross (EMA 9 / EMA 21) BUY and SELL alerts
                  </label>
                </div>

                <div className="settings-actions">
                  <button className="settings-btn secondary" onClick={handleTest} disabled={!hasToken || busy !== null} type="button">
                    {busy === 'test' ? 'Testing…' : <><PlugZap size={14} /> Test Connection</>}
                  </button>
                  <button className="settings-btn primary" onClick={handleSave} disabled={!hasToken || !chatId.trim() || busy !== null} type="button">
                    {busy === 'save' ? 'Saving…' : <><Save size={14} /> Save</>}
                  </button>
                  {saved?.configured && (
                    <button className="settings-btn secondary" onClick={handleTestAlert} disabled={busy !== null} type="button"
                      title="Send a sample MA Cross alert to your saved chat and measure delivery time">
                      {busy === 'alert' ? 'Sending…' : <><BellRing size={14} /> Send test alert</>}
                    </button>
                  )}
                  {saved?.configured && (
                    <button className="settings-btn danger" onClick={handleDisconnect} disabled={busy !== null} type="button">
                      Disconnect
                    </button>
                  )}
                </div>

                {testResult && (
                  <div className={`test-result ${testResult.ok ? 'ok' : 'fail'}`}>
                    <div className="test-result-title">
                      {testResult.ok ? <><CircleCheck size={16} /> Connection works</> : <><CircleX size={16} /> Connection test failed</>}
                    </div>
                    <ul>
                      {testResult.steps.map((s, i) => (
                        <li key={i}>
                          <span>{s.ok ? <CircleCheck size={15} className="ok-icon" /> : <CircleX size={15} className="fail-icon" />}</span>
                          <strong>{s.step}:</strong> {s.message}
                        </li>
                      ))}
                    </ul>
                    {testResult.ok && !saved?.configured && <p>Click <strong>Save</strong> to start receiving alerts.</p>}
                  </div>
                )}

                {message && <div className={`settings-message ${message.type}`}>{message.text}</div>}

                {saved?.last_test_at && (
                  <p className="settings-meta">
                    Last test: {saved.last_test_ok ? 'passed' : 'failed'} · {new Date(saved.last_test_at + 'Z').toLocaleString()}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2><Bot size={18} /> Bot commands</h2>
              <p className="settings-subtitle">Send these to your bot in Telegram. It replies within a few seconds.</p>
            </div>
          </div>
          <table className="guide-table commands-table">
            <tbody>
              <tr><td><code>/start</code> or <code>/help</code></td><td>Welcome message with your Chat ID and whether this chat is linked</td></tr>
              <tr><td><code>/status</code></td><td>How many pairs are BUY vs SELL on EMA 9 / EMA 21, and crosses in the last 3 bars</td></tr>
              <tr><td><code>/last</code></td><td>The 5 most recent MA Cross alerts</td></tr>
              <tr><td><code>/test</code></td><td>Sends a sample alert and tells you how long delivery took</td></tr>
              <tr><td><code>/id</code></td><td>Shows this chat's Chat ID</td></tr>
            </tbody>
          </table>
        </div>

        <div className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2><History size={18} /> Message history</h2>
              <p className="settings-subtitle">
                Every message sent to your Telegram. <strong>Delay</strong> is the time from the moment the server
                detected the cross until Telegram confirmed delivery.
              </p>
            </div>
            <button className="settings-btn secondary" onClick={loadHistory} disabled={historyLoading} type="button">
              {historyLoading ? 'Loading…' : <><RefreshCw size={14} /> Refresh</>}
            </button>
          </div>
          {history.length === 0 ? (
            <p className="settings-meta">No messages yet. Use Test Connection, Send test alert, or send /test to your bot.</p>
          ) : (
            <div className="history-scroll">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Sent</th>
                    <th>Type</th>
                    <th>Signal</th>
                    <th>Delay</th>
                    <th>Telegram API</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((m, i) => (
                    <tr key={i}>
                      <td>{m.sent_at ? new Date(m.sent_at).toLocaleString() : '-'}</td>
                      <td>{KIND_LABELS[m.kind] || m.kind}</td>
                      <td>
                        {m.symbol ? (
                          <span className={m.direction === 'BUY' ? 'hist-buy' : 'hist-sell'}>
                            {m.direction === 'BUY' ? '▲' : '▼'} {m.symbol.replace('C:', '')} {m.direction}
                            {m.cross_date && <span className="hist-sub"> · bar {m.cross_date}</span>}
                          </span>
                        ) : '-'}
                      </td>
                      <td>{formatMs(m.delay_ms)}</td>
                      <td>{formatMs(m.telegram_ms)}</td>
                      <td>
                        {m.ok
                          ? <span className="hist-ok"><CircleCheck size={14} /> Delivered</span>
                          : <span className="hist-fail"><CircleX size={14} /> {m.error || 'Failed'}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
