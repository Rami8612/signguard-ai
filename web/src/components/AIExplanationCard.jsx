/**
 * Simple Markdown to HTML converter for AI explanations
 * Handles: ## headers, **bold**, - bullet points, line breaks
 */
function renderMarkdown(text) {
  if (!text) return null

  const lines = text.split('\n')
  const elements = []
  let currentList = []
  let key = 0

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${key++}`} className="ai-list">
          {currentList.map((item, i) => (
            <li key={i}>{formatInlineMarkdown(item)}</li>
          ))}
        </ul>
      )
      currentList = []
    }
  }

  const formatInlineMarkdown = (line) => {
    // Handle **bold** and `code`
    const parts = []
    let remaining = line
    let partKey = 0

    while (remaining.length > 0) {
      // Check for **bold**
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/)
      // Check for `code`
      const codeMatch = remaining.match(/`([^`]+)`/)

      if (boldMatch && (!codeMatch || boldMatch.index < codeMatch.index)) {
        if (boldMatch.index > 0) {
          parts.push(<span key={partKey++}>{remaining.slice(0, boldMatch.index)}</span>)
        }
        parts.push(<strong key={partKey++}>{boldMatch[1]}</strong>)
        remaining = remaining.slice(boldMatch.index + boldMatch[0].length)
      } else if (codeMatch) {
        if (codeMatch.index > 0) {
          parts.push(<span key={partKey++}>{remaining.slice(0, codeMatch.index)}</span>)
        }
        parts.push(<code key={partKey++} className="ai-code">{codeMatch[1]}</code>)
        remaining = remaining.slice(codeMatch.index + codeMatch[0].length)
      } else {
        parts.push(<span key={partKey++}>{remaining}</span>)
        break
      }
    }

    return parts.length > 0 ? parts : line
  }

  for (const line of lines) {
    const trimmed = line.trim()

    // Empty line - flush list and add spacing
    if (!trimmed) {
      flushList()
      continue
    }

    // ## Header
    if (trimmed.startsWith('## ')) {
      flushList()
      const headerText = trimmed.slice(3)
      elements.push(
        <h3 key={`h-${key++}`} className="ai-header">
          {formatInlineMarkdown(headerText)}
        </h3>
      )
      continue
    }

    // - Bullet point
    if (trimmed.startsWith('- ')) {
      currentList.push(trimmed.slice(2))
      continue
    }

    // Regular paragraph
    flushList()
    elements.push(
      <p key={`p-${key++}`} className="ai-paragraph">
        {formatInlineMarkdown(trimmed)}
      </p>
    )
  }

  // Flush any remaining list
  flushList()

  return elements
}

export default function AIExplanationCard({ explanation, isLoading }) {
  // Loading state
  if (isLoading) {
    return (
      <div className="ai-card ai-card-loading">
        <div className="ai-card-header">
          <span className="ai-card-icon">✦</span>
          <h4 className="card-title">AI Explanation</h4>
          <span className="ai-status-badge loading">Generating...</span>
        </div>
        <div className="ai-loading-state">
          <div className="ai-loading-pulse" />
          <p className="ai-loading-text">Analyzing transaction...</p>
        </div>
      </div>
    )
  }

  // No explanation available
  if (!explanation) {
    return (
      <div className="ai-card ai-card-empty">
        <div className="ai-card-header">
          <span className="ai-card-icon">✦</span>
          <h4 className="card-title">AI Explanation</h4>
        </div>
        <div className="ai-empty-state">
          <p className="ai-empty-text">AI explanation unavailable</p>
          <p className="ai-empty-hint">Configure OPENROUTER_API_KEY for AI-powered analysis</p>
        </div>
      </div>
    )
  }

  // Has explanation
  return (
    <div className="ai-card ai-card-active">
      <div className="ai-card-header">
        <span className="ai-card-icon">✦</span>
        <h4 className="card-title">AI Explanation</h4>
        <span className="ai-status-badge active">AI Generated</span>
      </div>
      <div className="ai-content ai-markdown">
        {renderMarkdown(explanation)}
      </div>
    </div>
  )
}
