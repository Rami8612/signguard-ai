import { useState } from 'react'
import SeverityBadge from './SeverityBadge'

export default function BatchTimeline({ batchInfo }) {
  const [expandedIndex, setExpandedIndex] = useState(null)

  if (!batchInfo || !batchInfo.calls) return null

  const { calls, batchSummary, callCount } = batchInfo

  return (
    <div className="batch-timeline">
      {/* Batch header */}
      <div className="batch-header">
        <h4 className="card-title">
          Batch Transaction
          <span className="batch-count">{callCount} calls</span>
        </h4>
        {batchSummary && (
          <div className="batch-summary">
            <SummaryBadge label="OK" count={batchSummary.counts?.OK} type="ok" />
            <SummaryBadge label="WARN" count={batchSummary.counts?.WARN} type="warn" />
            <SummaryBadge label="DANGER" count={batchSummary.counts?.DANGER} type="danger" />
            <SummaryBadge label="?" count={batchSummary.counts?.UNKNOWN} type="unknown" />
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="timeline">
        {calls.map((call, index) => (
          <TimelineItem
            key={index}
            call={call}
            index={index}
            isExpanded={expandedIndex === index}
            onToggle={() => setExpandedIndex(expandedIndex === index ? null : index)}
          />
        ))}
      </div>
    </div>
  )
}

function SummaryBadge({ label, count, type }) {
  if (!count) return null

  return (
    <span className={`summary-badge summary-${type}`}>
      {count} {label}
    </span>
  )
}

function TimelineItem({ call, index, isExpanded, onToggle }) {
  const { operationLabel, to, value, analysis } = call
  const severity = analysis?.severity || 'UNKNOWN'
  const category = analysis?.category || 'UNKNOWN'
  const isDelegateCall = operationLabel === 'DELEGATECALL'

  return (
    <div className={`timeline-item timeline-${category.toLowerCase()}`}>
      <div className="timeline-marker">
        <span className="timeline-index">{index + 1}</span>
      </div>

      <div className="timeline-content">
        <button className="timeline-header" onClick={onToggle}>
          <div className="timeline-main">
            {isDelegateCall && (
              <span className="delegatecall-badge">DELEGATECALL</span>
            )}
            <span className="timeline-function">
              {analysis?.functionName || 'Unknown'}
            </span>
            <code className="timeline-target">{truncateAddress(to)}</code>
            {value && value !== '0' && (
              <span className="timeline-value">{formatEth(value)} ETH</span>
            )}
          </div>
          <div className="timeline-status">
            <SeverityBadge severity={severity} size="sm" />
            <span className={`expand-icon ${isExpanded ? 'expanded' : ''}`}>▼</span>
          </div>
        </button>

        {isExpanded && analysis && (
          <div className="timeline-details">
            {analysis.signature && (
              <div className="detail-row">
                <span className="detail-label">Signature</span>
                <code className="detail-value">{analysis.signature}</code>
              </div>
            )}
            {analysis.summary && (
              <div className="detail-row">
                <span className="detail-label">Summary</span>
                <span className="detail-value">{analysis.summary}</span>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-label">Target</span>
              <code className="detail-value">{to}</code>
            </div>
            {analysis.selector && (
              <div className="detail-row">
                <span className="detail-label">Selector</span>
                <code className="detail-value">{analysis.selector}</code>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function truncateAddress(addr) {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

function formatEth(weiStr) {
  try {
    const wei = BigInt(weiStr)
    const eth = Number(wei) / 1e18
    if (eth === 0) return '0'
    if (eth < 0.0001) return '<0.0001'
    return eth.toFixed(4)
  } catch {
    return weiStr
  }
}
