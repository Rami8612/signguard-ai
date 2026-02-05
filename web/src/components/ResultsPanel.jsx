import SeverityBadge from './SeverityBadge'
import TrustContextCard from './TrustContextCard'
import AIExplanationCard from './AIExplanationCard'
import EffectCard from './EffectCard'
import ParametersCard from './ParametersCard'
import BatchTimeline from './BatchTimeline'

/**
 * Get primary title based on trust profile > verified > abiVerified > unknown priority
 */
function getPrimaryTitle(result) {
  const { trustContext, verified, abiVerified, functionName, signature } = result

  // Priority 1: Trust Profile with TRUSTED contract
  const isTrustProfileTrusted =
    trustContext?.profileLoaded &&
    trustContext?.contractClassification === 'TRUSTED'

  if (isTrustProfileTrusted || result.trustProfileVerified) {
    const contractLabel = trustContext?.label || 'Trusted Contract'
    const selectorLabel = trustContext?.selectorLabel || functionName || 'Trusted call'
    return {
      title: `${contractLabel} — ${selectorLabel}`,
      subtitle: signature || null,
      source: 'TRUST_PROFILE',
      badge: 'trust-profile'
    }
  }

  // Priority 2: Verified from database
  if (verified) {
    return {
      title: functionName || 'Verified Function',
      subtitle: signature || null,
      source: 'verified_database',
      badge: 'verified'
    }
  }

  // Priority 3: ABI Verified (local ABI registry)
  if (abiVerified) {
    return {
      title: functionName || 'Function',
      subtitle: signature || null,
      source: 'LOCAL_REGISTRY',
      badge: 'abi-verified'
    }
  }

  // Priority 4: Unknown/Unverified
  return {
    title: functionName || 'Unknown Function',
    subtitle: signature || null,
    source: 'unverified',
    badge: null
  }
}

/**
 * Get primary severity for header badge.
 *
 * Priority:
 * 1) If result.headerSeverity is present (trust-based from backend), use it
 * 2) Fall back to existing logic for backward compatibility
 */
function getPrimarySeverity(result) {
  const { effect, isBatch, batchInfo } = result || {}

  // NEW: If headerSeverity is explicitly set by backend, use it (trust-first approach)
  if (result?.headerSeverity) {
    return result.headerSeverity
  }

  // Fallback: existing logic for backward compatibility
  const tp = result?.trustProfile || result?.trustContext

  // Trust Profile priority (legacy)
  if (tp?.blocked === true) return 'UNKNOWN'
  if (tp?.contract?.classification && tp.contract.classification !== 'TRUSTED') return 'UNKNOWN'
  if (tp?.contractClassification && tp.contractClassification !== 'TRUSTED') return 'UNKNOWN'
  if (tp?.trustBlocked === true) return 'UNKNOWN'

  // Batch severity
  if (isBatch && batchInfo?.batchSummary?.overallSeverity) {
    return batchInfo.batchSummary.overallSeverity
  }

  // Effect severity
  if (effect?.severity) return effect.severity

  return 'UNKNOWN'
}


/**
 * Get source badge label
 */
function getSourceLabel(source) {
  const labels = {
    'verified_database': 'Verified DB',
    '4byte.directory': '4byte.directory',
    'TRUST_PROFILE': 'Trust Profile',
    'LOCAL_REGISTRY': 'Local ABI',
    'unverified': 'Unverified'
  }
  return labels[source] || source
}

export default function ResultsPanel({ result, error, isLoading }) {
  // Loading state
  if (isLoading) {
    return (
      <div className="results-loading">
        <div className="loading-spinner" />
        <p className="loading-text">Decoding calldata...</p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="results-error">
        <div className="error-icon">⚠</div>
        <p className="error-title">Decode Failed</p>
        <p className="error-message">{error}</p>
      </div>
    )
  }

  // Empty state
  if (!result) {
    return (
      <div className="placeholder">
        <p className="placeholder-text">No Results Yet</p>
        <p className="placeholder-hint">Enter calldata and click Analyze</p>
      </div>
    )
  }

  // Success state - render full results
  const { effect, isBatch, batchInfo, trustContext } = result

  // Get computed title and severity
  const titleInfo = getPrimaryTitle(result)
  const severity = getPrimarySeverity(result)

  return (
    <div className="results-panel">
      {/* Header with function signature and severity */}
      <div className="results-header">
        <div className="results-function">
          {result.isDelegatecall && (
            <span className="delegatecall-badge">DELEGATECALL</span>
          )}
          {titleInfo.badge === 'trust-profile' && (
            <span className="verified-badge trust-profile-badge">Trust Profile</span>
          )}
          {titleInfo.badge === 'verified' && (
            <span className="verified-badge">Verified</span>
          )}
          {titleInfo.badge === 'abi-verified' && (
            <span className="verified-badge abi-verified-badge">ABI Verified</span>
          )}
          <span className="function-name">{titleInfo.title}</span>
          {titleInfo.subtitle && (
            <span className="function-signature">{titleInfo.subtitle}</span>
          )}
        </div>
        <SeverityBadge severity={severity} />
      </div>

      {/* Selector info */}
      <div className="selector-row">
        <span className="selector-label">Selector</span>
        <code className="selector-value">{result.selector}</code>
        <span className={`source-badge source-${titleInfo.source.toLowerCase().replace('_', '-')}`}>
          {getSourceLabel(titleInfo.source)}
        </span>
      </div>

      {/* === REORDERED SECTIONS === */}

      {/* 0. DELEGATECALL Warning Card - CRITICAL (shown first if applicable) */}
      {result.isDelegatecall && result.effect?.delegatecallOverride && (
        <div className="delegatecall-warning-card">
          <div className="delegatecall-warning-header">
            <span className="delegatecall-warning-icon">⚠</span>
            <span className="delegatecall-warning-title">Executed via DELEGATECALL</span>
          </div>
          <ul className="delegatecall-warning-list">
            <li>Code executes with your wallet's FULL PERMISSIONS</li>
            <li>Calldata semantics may be misleading</li>
            <li>NOT in trustedDelegateCalls whitelist</li>
            <li>Signing could result in total loss of all assets</li>
          </ul>
          {result.effect?.delegatecallWarnings?.length > 0 && (
            <div className="delegatecall-warnings">
              {result.effect.delegatecallWarnings.map((warning, idx) => (
                <p key={idx} className="delegatecall-warning-item">{warning}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 1. Trust Profile Context - FIRST (always shown) */}
      <TrustContextCard trustContext={trustContext} />

      {/* 2. AI Explanation - SECOND (always shown, with placeholder) */}
      <AIExplanationCard explanation={result.aiExplanation} />

      {/* 3. Parameters - RIGHT AFTER AI Explanation */}
      {result.params && Object.keys(result.params).length > 0 && (
        <ParametersCard
          params={result.params}
          trustedAssets={result.profile?.trustedAssets}
        />
      )}

      {/* 4. Effect Card - consequences, warnings, mitigations (semantic info) */}
      {effect && <EffectCard effect={effect} />}

      {/* 5. Batch Timeline for MultiSend */}
      {isBatch && batchInfo && (
        <BatchTimeline batchInfo={batchInfo} />
      )}

      {/* Timing info */}
      {result._meta && (
        <div className="meta-row">
          <span className="meta-text">
            Decoded in {result._meta.duration}ms
          </span>
        </div>
      )}
    </div>
  )
}
