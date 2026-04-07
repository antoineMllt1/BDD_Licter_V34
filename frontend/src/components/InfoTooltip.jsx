export default function InfoTooltip({ text, label = 'Explication' }) {
  if (!text) return null

  return (
    <span className="info-tooltip-wrap">
      <button
        type="button"
        className="info-tooltip"
        aria-label={`${label}: ${text}`}
      >
        i
      </button>
      <span className="info-tooltip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  )
}
