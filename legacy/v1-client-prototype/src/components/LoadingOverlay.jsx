import { useApp } from '../context/AppContext';

export default function LoadingOverlay() {
  const { loading, loadingStep, loadingSteps } = useApp();
  if (!loading) return null;

  return (
    <div className="valora-loading open">
      <div className="valora-loading-spinner" />
      <h3>Analysing property…</h3>
      <p>Valora AI is building your investment report</p>
      <div className="valora-loading-steps">
        {loadingSteps.map((s, i) => (
          <div
            key={s}
            className={`valora-loading-step${i < loadingStep ? ' done' : ''}${i === loadingStep - 1 ? ' active' : ''}`}
          >
            <span className="dot" />{s}
          </div>
        ))}
      </div>
    </div>
  );
}
