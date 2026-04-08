import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { useStrategicDashboardData } from '../lib/strategicData.js'

const MINI_PROMPTS = [
  { label: 'Actions à prendre maintenant', prompt: 'Quelles sont les actions prioritaires à prendre maintenant en fonction des données actuelles ?' },
  { label: 'Principaux irritants clients', prompt: 'Quels sont les principaux irritants clients identifiés dans les données ?' },
  { label: 'Que signifie ce score ?', prompt: 'Comment interpréter le score de réputation actuel et ce qu\'il implique concrètement ?' },
  { label: 'Nous vs Boulanger', prompt: 'Comment se positionne Fnac Darty face à Boulanger sur les données actuelles ?' },
  { label: 'Sujets qui buzzent', prompt: 'Quels sont les sujets ou thèmes qui génèrent le plus d\'engagement ou de réactions en ce moment ?' },
  { label: 'Risques à surveiller', prompt: 'Y a-t-il des signaux de crise ou des risques à surveiller en priorité ?' },
]

function compact(arr, n = 5) {
  return (arr ?? []).slice(0, n)
}

function nonEmpty(val) {
  if (val === null || val === undefined) return false
  if (typeof val === 'number') return val !== 0
  if (Array.isArray(val)) return val.length > 0
  if (typeof val === 'object') return Object.keys(val).length > 0
  return Boolean(val)
}

function strip(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => nonEmpty(v)))
}

function buildContext(data) {
  if (!data) return null
  const { executiveSnapshot, warRoomModel, battleModel, cxModel, actionModel, storeModel, coverageModel } = data

  const ctx = {}

  // --- EXECUTIVE SNAPSHOT ---
  const snap = executiveSnapshot
  if (snap) {
    ctx.snapshot = strip({
      brandHealthScore: snap.brandHealth?.score,
      avgRating: snap.brandHealth?.avgRating,
      negativeRate: snap.brandHealth?.negativeRate,
      reviewVolume: snap.brandHealth?.reviewVolume,
      crisisLevel: snap.crisis?.level,
      crisisBacklog: snap.crisis?.backlog,
      sovFnacDarty: snap.market?.sovBrand,
      sovBoulanger: snap.market?.sovCompetitor,
      sentimentDelta: snap.market?.sentimentDelta,
      weakestMarketDimension: snap.market?.weakestDimension,
      editorial: snap.editorial,
    })
  }

  // --- WAR ROOM (Social + Reputation) ---
  const wr = warRoomModel
  if (wr) {
    const social = strip({
      totalSocialMentions: wr.social?.total,
      negativeSocialMentions: wr.social?.negativeTotal,
      totalEngagement: wr.social?.engagement,
      verifiedAuthors: wr.social?.verifiedAuthors,
      topRiskPosts: compact(wr.social?.topRiskPosts, 3).map(p => ({
        text: p.text?.slice(0, 120),
        platform: p.platform,
        engagement: p.engagement,
        sentiment: p.sentiment,
      })),
      competitorBuzz: compact(wr.social?.competitorBuzz, 3).map(p => ({
        text: p.text?.slice(0, 100),
        platform: p.platform,
        engagement: p.engagement,
      })),
    })

    const rep = strip({
      totalReputationCases: wr.reviewReputation?.total,
      negativeReputation: wr.reviewReputation?.negativeRows?.length,
      severeReputation: wr.reviewReputation?.severeRows?.length,
      backlogWithoutResponse: wr.reviewReputation?.backlog?.length,
      severeRate: wr.reviewReputation?.severeRate,
      topPlatforms: compact(wr.reviewReputation?.platforms, 3).map(p => ({ name: p.name, count: p.value, severeCount: p.severeCount })),
    })

    const signals = compact(wr.signals, 4).map(s => ({ title: s.title, value: s.value, severity: s.severity, note: s.note }))

    if (Object.keys(social).length) ctx.warRoom = { crisisLevel: wr.crisisLevel, signals, social, reputation: rep }
  }

  // --- BATTLE MATRIX (Benchmark vs Boulanger) ---
  const bm = battleModel
  if (bm) {
    ctx.battleMatrix = strip({
      sovFnacDarty: bm.sovBrand,
      sovBoulanger: bm.sovCompetitor,
      sentimentDelta: bm.sentimentDelta,
      dimensionsWon: compact(bm.attack, 4).map(d => ({ label: d.label, delta: d.delta })),
      dimensionsLost: compact(bm.defend, 4).map(d => ({ label: d.label, delta: d.delta })),
      whiteSpaces: compact(bm.whiteSpaces, 3).map(d => d.label),
      totalDimensions: bm.dimensions?.length,
    })
  }

  // --- VOIX DU CLIENT (CX) ---
  const cx = cxModel?.brand
  const cxComp = cxModel?.competitor
  if (cx) {
    ctx.voixClient = strip({
      fnacDarty: strip({
        totalAvis: cx.summary?.total,
        avgRating: cx.summary?.avgRating,
        negativeRate: cx.summary?.negativeRate,
        positiveRate: cx.summary?.positiveRate,
        topIrritants: compact(cx.frictions, 5).map(f => ({
          label: f.label,
          count: f.count,
          severity: f.severity,
          journeyStep: f.journeyLabel,
        })),
        topSatisfactions: compact(cx.delights, 4).map(d => ({ label: d.label, count: d.count })),
        parcoursCritiques: compact(cx.journey, 4).map(j => ({
          step: j.label,
          total: j.total,
          negative: j.negative,
          critical: j.critical,
        })),
        verbatimsRecents: compact(cx.recentQuotes, 3).map(q => ({ text: q.text, sentiment: q.sentiment, source: q.source })),
      }),
      boulanger: cxComp ? strip({
        totalAvis: cxComp.summary?.total,
        avgRating: cxComp.summary?.avgRating,
        negativeRate: cxComp.summary?.negativeRate,
        topIrritants: compact(cxComp.frictions, 3).map(f => ({ label: f.label, count: f.count })),
      }) : undefined,
    })
  }

  // --- ACTION CENTER ---
  const am = actionModel
  if (am) {
    ctx.actionCenter = strip({
      actionsUrgentes: compact(am.now, 6).map(a => ({
        label: a.label,
        urgency: a.urgency,
        severity: a.severity,
        owner: a.owner,
        count: a.count,
        impact: a.impact,
      })),
      actionsDifferables: compact(am.later, 4).map(a => ({ label: a.label, owner: a.owner })),
      top3: compact(am.top3, 3).map(a => ({ label: a.label, owner: a.owner, urgency: a.urgency, count: a.count })),
    })
  }

  // --- MAGASINS ---
  const sm = storeModel
  if (sm) {
    ctx.magasins = strip({
      noteReseauFnacDarty: sm.network?.summary?.networkRating,
      tauxNegatifReseau: sm.network?.summary?.networkNegativeRate,
      backlogReseau: sm.network?.summary?.reviewBacklog,
      nombreMagasins: sm.network?.summary?.coveredStores,
      magasinsArisque: compact(sm.atRiskStores, 4).map(s => ({
        store: s.store,
        city: s.city,
        avgRating: s.avgRating,
        negRate: s.negRate,
        topIssue: s.topIssue,
        riskScore: s.riskScore,
      })),
      magasinsChampions: compact(sm.championStores, 3).map(s => ({ store: s.store, city: s.city, avgRating: s.avgRating })),
      villesAConquerir: compact(sm.defendCities, 3).map(c => ({ city: c.city, brandRating: c.brandRating, boulangerRating: c.competitorRating })),
    })
  }

  // --- COUVERTURE DONNÉES ---
  if (coverageModel) {
    ctx.couvertureDonnees = strip({
      totalLignes: coverageModel.totalRows,
      tauxEnrichissementIA: coverageModel.aiCoverage,
      derniereDonnee: coverageModel.latestAt,
      sources: coverageModel.sources?.map(s => ({ source: s.key, count: s.count })),
    })
  }

  return Object.keys(ctx).length ? ctx : null
}

export default function ChatBot() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Bonjour ! Je suis votre assistant Fnac Darty Intelligence. Posez-moi une question sur vos données ou cliquez sur un raccourci ci-dessous.' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const dashboardData = useStrategicDashboardData()

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open, messages])

  async function sendMessage(text) {
    const userText = (text || input).trim()
    if (!userText || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: userText }])
    setLoading(true)

    try {
      const context = buildContext(dashboardData)
      const { reply } = await api.chat({ message: userText, context })
      setMessages(prev => [...prev, { role: 'assistant', text: reply }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Désolé, une erreur est survenue. Réessayez dans un instant.' }])
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function renderMessageLine(line, key) {
    // Bullet lines: • or - at start
    const isBullet = /^[•\-]\s/.test(line)
    const text = isBullet ? line.replace(/^[•\-]\s/, '') : line

    // Parse **bold**
    const parts = text.split(/\*\*(.+?)\*\*/g)
    const content = parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i}>{part}</strong> : part
    )

    if (isBullet) {
      return <div key={key} className="chatbot-bullet">{content}</div>
    }
    return <div key={key} className="chatbot-line">{content}</div>
  }

  return (
    <>
      {/* Floating button */}
      <button
        className="chatbot-fab"
        onClick={() => setOpen(v => !v)}
        aria-label="Ouvrir l'assistant"
        title="Assistant IA"
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="chatbot-panel">
          <div className="chatbot-header">
            <div className="chatbot-header-info">
              <div className="chatbot-avatar">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
                </svg>
              </div>
              <div>
                <div className="chatbot-title">Assistant Intelligence</div>
                <div className="chatbot-subtitle">Connecté à vos données</div>
              </div>
            </div>
            <button className="chatbot-close" onClick={() => setOpen(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="chatbot-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chatbot-message chatbot-message--${msg.role}`}>
                {msg.text.split('\n').filter(l => l.trim() !== '').map((line, j) => renderMessageLine(line, j))}
              </div>
            ))}
            {loading && (
              <div className="chatbot-message chatbot-message--assistant chatbot-message--loading">
                <span className="chatbot-dot" />
                <span className="chatbot-dot" />
                <span className="chatbot-dot" />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Mini prompts */}
          <div className="chatbot-prompts">
            {MINI_PROMPTS.map((p) => (
              <button
                key={p.label}
                className="chatbot-prompt-btn"
                onClick={() => sendMessage(p.prompt)}
                disabled={loading}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="chatbot-input-row">
            <textarea
              ref={inputRef}
              className="chatbot-input"
              placeholder="Posez votre question..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              disabled={loading}
            />
            <button
              className="chatbot-send"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              aria-label="Envoyer"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
