import { useApp } from '../context/AppContext';

export default function ToastContainer() {
  const { toasts, showToast } = useApp();

  return (
    <div className="valora-toast-container">
      {toasts.map((t) => (
        <div key={t.id} className="valora-toast">
          <span>✦</span>
          <div>
            <div style={{ fontWeight: 700 }}>{t.title}</div>
            {t.sub && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{t.sub}</div>}
          </div>
          <button type="button" className="valora-toast-close" aria-label="Close" onClick={() => {}}>×</button>
        </div>
      ))}
    </div>
  );
}
