import { useState } from 'react'
import { Link } from 'react-router-dom'
import ExpandableText from './ExpandableText.jsx'
import InfoTooltip from './InfoTooltip.jsx'

function compactText(value, maxWords = 10) {
  const text = String(value || '').trim()
  if (!text) return ''

  const firstSentence = text.split(/[.!?]/)[0]?.trim() || text
  const words = firstSentence.split(/\s+/).filter(Boolean)

  if (words.length <= maxWords) return { text: firstSentence, truncated: false }
  return { text: `${words.slice(0, maxWords).join(' ')}...`, truncated: true }
}

function HeroPill({ label, value, maxWords }) {
  const [expanded, setExpanded] = useState(false)
  const compact = compactText(value, maxWords)
  const displayValue = expanded || !compact.truncated ? String(value || '').trim() : compact.text

  return (
    <button
      type="button"
      className={`hero-pill ${expanded ? 'expanded' : ''} ${compact.truncated ? 'clickable' : ''}`}
      onClick={() => compact.truncated && setExpanded((current) => !current)}
      aria-expanded={expanded}
    >
      <span>{label}</span>
      <strong>{displayValue}</strong>
      {compact.truncated && <em>{expanded ? 'Voir moins' : 'Voir tout'}</em>}
    </button>
  )
}

export function StrategicHero({ eyebrow, title, summary, whyItMatters, whatNow, actions = [], stats = [] }) {
  const heroPills = [
    whyItMatters ? { label: 'Enjeu', value: whyItMatters, maxWords: 6 } : null,
    whatNow ? { label: 'Priorite', value: whatNow, maxWords: 7 } : null,
  ].filter(Boolean)

  return (
    <section className="strategic-hero">
      <div className="strategic-hero-copy">
        {eyebrow && <div className="strategic-eyebrow">{eyebrow}</div>}
        <h1 className="strategic-title">{title}</h1>
        {summary && (
          <p className="hero-highlight-text">{summary}</p>
        )}

        <div className="hero-pill-row">
          {heroPills.map((pill) => (
            <HeroPill key={pill.label} label={pill.label} value={pill.value} maxWords={pill.maxWords} />
          ))}
        </div>

        {actions.length > 0 && (
          <div className="strategic-actions">
            {actions.map((action) => (
              action.to ? (
                <Link key={action.label} to={action.to} className={`btn ${action.kind === 'ghost' ? 'btn-ghost' : action.kind === 'secondary' ? 'btn-secondary' : 'btn-primary'}`}>
                  {action.label}
                </Link>
              ) : (
                <button key={action.label} className={`btn ${action.kind === 'ghost' ? 'btn-ghost' : action.kind === 'secondary' ? 'btn-secondary' : 'btn-primary'}`} onClick={action.onClick}>
                  {action.label}
                </button>
              )
            ))}
          </div>
        )}
      </div>

      {stats.length > 0 && (
        <div className="hero-stat-panel">
          {stats.map((stat) => (
            <div key={stat.label} className="hero-stat-card">
              <div className="hero-stat-head">
                <div className="hero-stat-label">{stat.label}</div>
                <InfoTooltip text={stat.info} label={stat.label} />
              </div>
              <div className="hero-stat-value">{stat.value}</div>
              {stat.sub && <div className="hero-stat-sub">{stat.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function StrategicSection({ title, subtitle, actions, children }) {
  return (
    <section className="strategic-section">
      <div className="strategic-section-head">
        <div className="strategic-section-copy">
          <h2 className="strategic-section-title">{title}</h2>
          {subtitle && <div className="strategic-section-subtitle">{subtitle}</div>}
        </div>
        {actions && <div className="strategic-section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  )
}

export function SignalCard({ label, value, note, tone = 'neutral', info }) {
  return (
    <div className={`signal-card ${tone}`}>
      <div className="signal-label-row">
        <div className="signal-label">{label}</div>
        <InfoTooltip text={info} label={label} />
      </div>
      <div className="signal-value">{value}</div>
      {note && <div className="signal-note">{note}</div>}
    </div>
  )
}

export function EvidenceFeed({ title, items, emptyMessage = 'Aucune preuve disponible.' }) {
  return (
    <div className="evidence-card">
      <div className="evidence-title">{title}</div>
      {items?.length ? (
        <div className="evidence-list">
          {items.slice(0, 3).map((item, index) => (
            <div key={item.id || index} className="evidence-item">
              <div className="evidence-quote">
                <ExpandableText text={`"${String(item.text || '').trim()}"`} maxLength={170} />
              </div>
              {(item.source || item.date) && (
                <div className="evidence-meta">
                  {item.source && <span>{item.source}</span>}
                  {item.date && <span>{new Date(item.date).toLocaleDateString('fr-FR')}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="evidence-empty">{emptyMessage}</div>
      )}
    </div>
  )
}

export function PriorityStack({ items, emptyMessage = 'Aucune action prioritaire.' }) {
  return (
    <div className="priority-stack">
      {items?.length ? items.map((item) => (
        <div key={item.id} className="priority-item">
          <div className="priority-topline">
            <span className={`badge badge-severity-${item.severity || 'medium'}`}>{item.severity || 'medium'}</span>
            <span className="priority-owner">{item.owner}</span>
          </div>
          <div className="priority-label">{item.label}</div>
          <div className="priority-meta">
            <span>{item.count} preuves</span>
            <span>{item.impact || 'Impact a clarifier'}</span>
            <span>{item.side === 'competitor' ? 'Boulanger' : 'Fnac Darty'}</span>
          </div>
        </div>
      )) : <div className="evidence-empty">{emptyMessage}</div>}
    </div>
  )
}
