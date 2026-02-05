export default function SeverityBadge({ severity, size = 'md' }) {
  const level = severity?.toUpperCase() || 'UNKNOWN'

  return (
    <span className={`severity-badge severity-${level.toLowerCase()} severity-${size}`}>
      {level === 'CRITICAL' && <span className="severity-pulse" />}
      {level}
    </span>
  )
}
