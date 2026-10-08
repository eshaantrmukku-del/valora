import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

const convKey = (id) => `valora_chat_${id}`;
function storedConversation(id) {
  try {
    return localStorage.getItem(convKey(id));
  } catch {
    return null;
  }
}
function rememberConversation(id, conversationId) {
  try {
    localStorage.setItem(convKey(id), conversationId);
  } catch {
    /* convenience only */
  }
}

const SUGGESTIONS = [
  'Why did this property score this way?',
  'What information is missing?',
  'How would returns change if the refurbishment cost 25% more?',
  'What should I investigate before making an offer?',
];

function renderAnswer(text) {
  // Lightweight markdown: **bold** and line breaks only
  return text.split('\n').map((line, i) => {
    const parts = [];
    let rest = line;
    let key = 0;
    while (rest.length) {
      const m = rest.match(/\*\*(.+?)\*\*/);
      if (!m) {
        parts.push(<span key={key++}>{rest}</span>);
        break;
      }
      const idx = rest.indexOf(m[0]);
      if (idx > 0) parts.push(<span key={key++}>{rest.slice(0, idx)}</span>);
      parts.push(<strong key={key++}>{m[1]}</strong>);
      rest = rest.slice(idx + m[0].length);
    }
    return (
      <p key={i} className="prop-chat-line">
        {parts.length ? parts : '\u00a0'}
      </p>
    );
  });
}

export default function PropertyChat({ property, context, title = 'Continue the conversation', subtitle }) {
  const scopeId = property?.id || 'global';
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(() => storedConversation(scopeId));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);
  const suggestions = SUGGESTIONS;

  useEffect(() => {
    const cid = storedConversation(scopeId);
    setConversationId(cid);
    setMessages([]);
    setInput('');
    if (!cid) return;
    api(`/api/assistant/conversations/${cid}`)
      .then((r) => setMessages(r.messages.map((m) => ({ role: m.role, text: m.text, at: m.id, tools: m.toolsUsed }))))
      .catch(() => setConversationId(null));
  }, [scopeId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, busy]);

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: q, at: Date.now() }]);
    try {
      const ctx = context || (property ? { analysisId: property.id, propertyId: property.propertyId, ...(property.briefId ? { briefId: property.briefId } : {}) } : undefined);
      const r = await api('/api/assistant/messages', { method: 'POST', body: { conversationId, message: q, context: ctx } });
      setConversationId(r.conversationId);
      rememberConversation(scopeId, r.conversationId);
      setMessages((m) => [...m, { role: 'assistant', text: r.reply.text, at: Date.now() + 1, tools: r.reply.toolsUsed }]);
    } catch (err) {
      setError(err.code === 'not_configured' ? 'The assistant needs an AI provider. Ask your administrator to configure ANTHROPIC_API_KEY.' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="prop-chat">
      <div className="prop-chat-head">
        <div>
          <div className="prop-chat-title">{title}</div>
          <div className="prop-chat-sub">
            {subtitle || 'Ask about this property. Answers use your workspace data and Valora’s calculator, and flag assumptions.'}
          </div>
        </div>
      </div>

      <div className="prop-chat-suggestions">
        {suggestions.map((s) => (
          <button key={s} type="button" className="prop-chat-chip" onClick={() => send(s)} disabled={busy}>
            {s}
          </button>
        ))}
      </div>

      <div className="prop-chat-thread" aria-live="polite">
        {messages.length === 0 && (
          <div className="prop-chat-empty">
            Try “Why did this rank highly?” or “What if the refurbishment costs more?”
          </div>
        )}
        {error && <div className="notice-banner notice-banner--error">{error}</div>}
        {busy && <div className="prop-chat-empty">Thinking — checking your data…</div>}
        {messages.map((m) => (
          <div key={`${m.at}-${m.role}`} className={`prop-chat-msg prop-chat-msg--${m.role}`}>
            <div className="prop-chat-role">{m.role === 'user' ? 'You' : 'Valora'}</div>
            <div className="prop-chat-bubble">
              {m.role === 'assistant' ? renderAnswer(m.text) : m.text}
            </div>
            {m.tools?.length > 0 && <div className="chat-tools">Looked up: {[...new Set(m.tools)].join(', ').replace(/_/g, ' ')}</div>}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        className="prop-chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about yield, works, risks, cash required…"
          disabled={busy}
        />
        <button type="submit" disabled={!input.trim() || busy}>
          Ask
        </button>
      </form>
    </div>
  );
}
