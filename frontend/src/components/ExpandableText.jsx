import { useState } from 'react'

function truncateText(value, maxLength = 120) {
  const text = String(value || '').trim()
  if (!text) return { text: '', truncated: false }
  if (text.length <= maxLength) return { text, truncated: false }
  return { text: `${text.slice(0, maxLength).trim()}...`, truncated: true }
}

export default function ExpandableText({ text, maxLength = 120, className = '', empty = '—' }) {
  const [expanded, setExpanded] = useState(false)
  const result = truncateText(text, maxLength)

  if (!result.text) return <span>{empty}</span>

  return (
    <span className={`expandable-text ${expanded ? 'expanded' : ''} ${className}`.trim()}>
      <span className="expandable-text-value">{expanded || !result.truncated ? String(text).trim() : result.text}</span>
      {result.truncated && (
        <button type="button" className="expandable-text-toggle" onClick={() => setExpanded((current) => !current)}>
          {expanded ? 'Voir moins' : 'Voir tout'}
        </button>
      )}
    </span>
  )
}
