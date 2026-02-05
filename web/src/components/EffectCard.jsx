export default function EffectCard({ effect }) {
  if (!effect) return null

  const {
    effectType,
    label,
    permanence,
    beneficiary,
    consequences = [],
    warnings = [],
    mitigations = [],
    trustWarnings = []
  } = effect

  const allWarnings = [...warnings, ...trustWarnings]

  return (
    <div className="effect-card">
      {/* Effect type header */}
      <div className="effect-header">
        <span className="effect-type">{formatEffectType(effectType)}</span>
        {label && <span className="effect-label">{label}</span>}
      </div>

      {/* Meta info */}
      <div className="effect-meta">
        {permanence && (
          <span className="effect-meta-item">
            <span className="meta-icon">⏱</span>
            {formatPermanence(permanence)}
          </span>
        )}
        {beneficiary && (
          <span className="effect-meta-item">
            <span className="meta-icon">→</span>
            <code className="beneficiary">{truncateAddress(beneficiary)}</code>
          </span>
        )}
      </div>

      {/* Consequences */}
      {consequences.length > 0 && (
        <div className="effect-section">
          <h4 className="effect-section-title">Consequences</h4>
          <ul className="effect-list consequences-list">
            {consequences.map((item, i) => (
              <li key={i} className="effect-list-item">{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {allWarnings.length > 0 && (
        <div className="effect-section effect-section-warnings">
          <h4 className="effect-section-title warnings-title">Warnings</h4>
          <ul className="effect-list warnings-list">
            {allWarnings.map((item, i) => (
              <li key={i} className="effect-list-item warning-item">{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Mitigations */}
      {mitigations.length > 0 && (
        <div className="effect-section">
          <h4 className="effect-section-title mitigations-title">Mitigations</h4>
          <ul className="effect-list mitigations-list">
            {mitigations.map((item, i) => (
              <li key={i} className="effect-list-item mitigation-item">{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function formatEffectType(type) {
  if (!type) return 'Unknown Effect'
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
}

function formatPermanence(permanence) {
  const labels = {
    'PERMANENT': 'Permanent',
    'PERMANENT_UNTIL_REVOKED': 'Until Revoked',
    'TEMPORARY': 'Temporary',
    'IMMEDIATE': 'Immediate',
    'ONE_TIME': 'One-time'
  }
  return labels[permanence] || permanence
}

function truncateAddress(addr) {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}
