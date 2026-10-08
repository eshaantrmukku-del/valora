import { useState } from 'react';
import AppPage, { AppCard } from '../components/AppPage';
import PropertyChat from '../components/PropertyChat';
import { useApi } from '../hooks/useApi';
import { api, emitStoreChange } from '../lib/api';

const SCOPE_KEY = 'valora_chat_global';

export default function Assistant() {
  const convs = useApi('/api/assistant/conversations');
  const [nonce, setNonce] = useState(0);
  const available = convs.data?.available;

  const openConversation = (id) => {
    try {
      if (id) localStorage.setItem(SCOPE_KEY, id);
      else localStorage.removeItem(SCOPE_KEY);
    } catch {
      /* convenience only */
    }
    setNonce((n) => n + 1);
  };

  const remove = async (id) => {
    await api(`/api/assistant/conversations/${id}`, { method: 'DELETE' });
    emitStoreChange();
    openConversation(null);
  };

  const aside = (
    <div className="app-panel">
      <div className="app-panel-head">
        <div className="app-panel-title">Conversations</div>
      </div>
      <div className="app-panel-body app-card-list">
        <button type="button" className="app-btn app-btn--primary" onClick={() => openConversation(null)}>
          New conversation
        </button>
        {(convs.data?.conversations || []).map((c) => (
          <div key={c.id} style={{ display: 'flex', gap: 6 }}>
            <AppCard
              title={c.title}
              meta={new Date(c.updatedAt).toLocaleString('en-GB')}
              onClick={() => openConversation(c.id)}
            />
            <button
              type="button"
              className="app-btn app-btn--ghost"
              aria-label={`Delete ${c.title}`}
              onClick={() => remove(c.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <AppPage
      eyebrow="Valora AI"
      title="Assistant"
      subtitle="Ask about your briefs, saved properties, analyses and search results. Figures come from Valora’s calculator, and assumptions are flagged."
      aside={aside}
    >
      {available === false && (
        <div className="notice-banner notice-banner--warn">
          The assistant needs an AI provider. An administrator must set ANTHROPIC_API_KEY. Everything else in
          Valora works without it.
        </div>
      )}
      <PropertyChat
        key={nonce}
        property={null}
        context={{}}
        title="Ask Valora"
        subtitle="Examples: “Compare my saved properties for a rental strategy”, “What information is missing for my top Discover result?”"
      />
    </AppPage>
  );
}
