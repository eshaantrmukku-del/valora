import { useEffect, useRef, useState } from 'react';
import {
  answerPropertyQuestion,
  getChatSuggestions,
  loadChat,
  saveChat,
} from '../lib/propertyChat';

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

export default function PropertyChat({ property }) {
  const [messages, setMessages] = useState(() => loadChat(property.id));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const suggestions = getChatSuggestions(property);

  useEffect(() => {
    setMessages(loadChat(property.id));
    setInput('');
  }, [property.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, busy]);

  const send = (text) => {
    const q = (text || input).trim();
    if (!q || busy) return;
    setBusy(true);
    const userMsg = { role: 'user', text: q, at: Date.now() };
    const { answer } = answerPropertyQuestion(property, q);
    const assistantMsg = { role: 'assistant', text: answer, at: Date.now() };
    const next = [...messages, userMsg, assistantMsg];
    setMessages(next);
    saveChat(property.id, next);
    setInput('');
    setBusy(false);
  };

  return (
    <div className="prop-chat">
      <div className="prop-chat-head">
        <div>
          <div className="prop-chat-title">Continue the conversation</div>
          <div className="prop-chat-sub">
            Ask about this property — answers only use verified figures from the report.
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
            Try “What will the refurb cost?” or “Why this score?” — I will cite the numbers already calculated above.
          </div>
        )}
        {messages.map((m) => (
          <div key={`${m.at}-${m.role}-${m.text.slice(0, 12)}`} className={`prop-chat-msg prop-chat-msg--${m.role}`}>
            <div className="prop-chat-role">{m.role === 'user' ? 'You' : 'Valora'}</div>
            <div className="prop-chat-bubble">
              {m.role === 'assistant' ? renderAnswer(m.text) : m.text}
            </div>
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
