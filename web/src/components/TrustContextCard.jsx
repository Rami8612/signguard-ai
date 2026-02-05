export default function TrustContextCard({ trustContext }) {
  const hasProfile = trustContext?.profileLoaded

  // Always render - show placeholder if no profile
  if (!hasProfile) {
    return (
      <div className="trust-card trust-card-empty">
        <div className="trust-card-header">
          <span className="trust-card-icon">🛡</span>
          <h4 className="card-title">Trust Profile Context</h4>
        </div>
        <div className="trust-empty-state">
          <p className="trust-empty-text">No trust profile loaded</p>
          <p className="trust-empty-hint">Upload a profile to see contract trust classification</p>
        </div>
      </div>
    )
  }

  const {
    contractClassification,
    selectorClassification,
    trustLevel,
    label,
    selectorLabel,
    warnings = [],
    notes
  } = trustContext

  const isTrusted = contractClassification === 'TRUSTED'
  const isBlocked = contractClassification === 'UNKNOWN' || contractClassification === 'NOT_ALLOWED'

  return (
    <div className={`trust-card ${isTrusted ? 'trust-card-trusted' : ''} ${isBlocked ? 'trust-card-blocked' : ''}`}>
      <div className="trust-card-header">
        <span className="trust-card-icon">{isTrusted ? '✓' : isBlocked ? '⚠' : '🛡'}</span>
        <h4 className="card-title">Trust Profile Context</h4>
        {isTrusted && <span className="trust-status-badge trusted">Trusted</span>}
        {isBlocked && <span className="trust-status-badge blocked">Not Trusted</span>}
      </div>

      <div className="trust-grid">
        {/* Contract classification */}
        <div className="trust-item">
          <span className="trust-label">Contract</span>
          <span className={`trust-value trust-${contractClassification?.toLowerCase()}`}>
            {contractClassification || 'Unknown'}
          </span>
        </div>

        {/* Selector classification */}
        <div className="trust-item">
          <span className="trust-label">Selector</span>
          <span className={`trust-value trust-${selectorClassification?.toLowerCase()}`}>
            {selectorClassification || 'Unknown'}
          </span>
        </div>

        {/* Trust level */}
        {trustLevel && (
          <div className="trust-item">
            <span className="trust-label">Trust Level</span>
            <span className="trust-value">{trustLevel}</span>
          </div>
        )}

        {/* Labels */}
        {label && (
          <div className="trust-item">
            <span className="trust-label">Contract Label</span>
            <span className="trust-value trust-label-value">{label}</span>
          </div>
        )}
        {selectorLabel && (
          <div className="trust-item">
            <span className="trust-label">Function Label</span>
            <span className="trust-value">{selectorLabel}</span>
          </div>
        )}
      </div>

      {/* Notes */}
      {notes && (
        <div className="trust-notes">
          <span className="trust-notes-label">Notes:</span>
          <span className="trust-notes-text">{notes}</span>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="trust-warnings">
          {warnings.map((warning, i) => (
            <div key={i} className="trust-warning-item">
              <span className="warning-icon">⚠</span>
              {warning}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
