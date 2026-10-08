/** Abstract report layout — Apple-style preview card */
export default function ReportPreview() {
  const bars = [
    { label: 'Price', w: '72%' },
    { label: 'Yield', w: '58%' },
    { label: 'Rent est.', w: '65%' },
    { label: 'BMV', w: '48%' },
  ];

  return (
    <div className="report-preview" aria-hidden="true">
      <div className="report-preview-top">
        <span className="report-preview-eyebrow">Report preview</span>
        <span className="report-preview-title">Your listing analysis</span>
      </div>
      <div className="report-preview-metrics">
        {bars.map(({ label, w }) => (
          <div key={label} className="report-preview-metric">
            <span className="rpm-label">{label}</span>
            <span className="rpm-bar" style={{ '--w': w }} />
          </div>
        ))}
      </div>
      <div className="report-preview-footer">
        <div className="report-preview-score">
          <span className="rps-num">—</span>
          <span className="rps-label">Score</span>
        </div>
        <div className="report-preview-tags">
          <span>Risks</span>
          <span>Cash flow</span>
          <span>Area</span>
        </div>
      </div>
    </div>
  );
}
