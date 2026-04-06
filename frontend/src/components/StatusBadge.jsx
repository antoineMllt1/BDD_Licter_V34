export function SentimentBadge({ value }) {
  if (!value) return <span className="badge" style={{ background: 'var(--border)', color: 'var(--text-muted)' }}>-</span>
  const map = {
    Positive: 'badge-positive',
    Negative: 'badge-negative',
    Neutral: 'badge-neutral',
  }
  const labels = { Positive: 'Positif', Negative: 'Negatif', Neutral: 'Neutre' }
  return <span className={`badge ${map[value] || 'badge-primary'}`}>{labels[value] || value}</span>
}

export function PlatformBadge({ value }) {
  const icons = { Twitter: 'X', 'Twitter/X': 'X', Trustpilot: 'T', 'Google Reviews': 'G', Reddit: 'R', TikTok: 'T', Instagram: 'I' }
  return (
    <span className="badge badge-primary" style={{ gap: 5 }}>
      <span>{icons[value] || '.'}</span>
      {value}
    </span>
  )
}

export function StatusBadge({ status }) {
  const map = {
    running: { cls: 'badge-neutral', label: 'En cours', dot: 'running' },
    completed: { cls: 'badge-positive', label: 'Termine', dot: 'active' },
    error: { cls: 'badge-negative', label: 'Erreur', dot: 'error' },
    active: { cls: 'badge-positive', label: 'Actif', dot: 'active' },
    inactive: { cls: '', label: 'Inactif', dot: 'inactive' },
  }
  const cfg = map[status?.toLowerCase()] || { cls: '', label: status, dot: 'inactive' }
  return (
    <span className={`badge ${cfg.cls}`}>
      <span className={`status-dot ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export function RatingStars({ value, max = 5 }) {
  if (!value) return <span className="text-muted">-</span>
  const n = Math.round(Number(value))
  return (
    <span style={{ color: n >= 4 ? 'var(--positive)' : n <= 2 ? 'var(--negative)' : 'var(--neutral)', fontWeight: 600, fontSize: 12 }}>
      {'*'.repeat(n)}{'-'.repeat(max - n)} {Number(value).toFixed(1)}
    </span>
  )
}
