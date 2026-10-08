export default function AiInsightPanel({ title = 'AI analysis', children, footer }) {
  return (
    <div className="ai-insight-panel">
      <div className="ai-insight-head">
        <div className="analyst-avatar">AI</div>
        <div className="ai-insight-title">{title}</div>
      </div>
      <div className="ai-insight-body">{children}</div>
      {footer && <div className="ai-insight-footer">{footer}</div>}
    </div>
  );
}
