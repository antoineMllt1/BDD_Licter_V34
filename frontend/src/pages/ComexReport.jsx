import { useState } from 'react'
import { api } from '../lib/api.js'
import { supabase } from '../lib/supabase.js'

const SECTIONS = [
  { id: 'reputation', label: 'Réputation & Crise', checked: true },
  { id: 'benchmark', label: 'Benchmark Marché', checked: true },
  { id: 'cx', label: 'Expérience Client', checked: true },
  { id: 'recommendations', label: 'Recommandations stratégiques', checked: true },
]

export default function ComexReport() {
  const [config, setConfig] = useState({
    brand: 'Fnac Darty',
    competitor: 'Boulanger',
    dateRange: '12 derniers mois',
    language: 'fr',
    tone: 'corporate',
    sections: SECTIONS.map(s => s.id),
  })
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const toggleSection = (id) => {
    setConfig(c => ({
      ...c,
      sections: c.sections.includes(id) ? c.sections.filter(s => s !== id) : [...c.sections, id]
    }))
  }

  const handleGenerate = async () => {
    setGenerating(true); setError(null); setSuccess(false)
    try {
      const blob = await api.generateComex({ brand: config.brand, dateRange: config.dateRange })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Rapport_COMEX_${config.brand.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setSuccess(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Rapport COMEX</div>
        <div className="page-subtitle">Génération de rapports exécutifs par IA — Claude claude-sonnet-4-6</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24 }}>
        {/* Config Panel */}
        <div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">⚙ Configuration du rapport</div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div className="form-group">
                <label className="form-label">Marque analysée</label>
                <input className="form-input" value={config.brand} onChange={e => setConfig(c => ({ ...c, brand: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Concurrent principal</label>
                <input className="form-input" value={config.competitor} onChange={e => setConfig(c => ({ ...c, competitor: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Période d'analyse</label>
                <select className="form-select" value={config.dateRange} onChange={e => setConfig(c => ({ ...c, dateRange: e.target.value }))}>
                  <option>3 derniers mois</option>
                  <option>6 derniers mois</option>
                  <option>12 derniers mois</option>
                  <option>Tout l'historique</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Ton du rapport</label>
                <select className="form-select" value={config.tone} onChange={e => setConfig(c => ({ ...c, tone: e.target.value }))}>
                  <option value="corporate">Corporate / Direction générale</option>
                  <option value="consulting">Consulting / McKinsey style</option>
                  <option value="executive">Executive summary focus</option>
                </select>
              </div>

              <div className="divider" />

              <div className="form-group">
                <label className="form-label">Sections à inclure</label>
                {SECTIONS.map(s => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={config.sections.includes(s.id)}
                      onChange={() => toggleSection(s.id)}
                      style={{ accentColor: 'var(--primary)', width: 14, height: 14 }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--text)' }}>{s.label}</span>
                  </label>
                ))}
              </div>

              <div className="divider" />

              <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 14, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text)' }}>Prérequis :</strong> ANTHROPIC_API_KEY doit être configuré dans <code>backend/.env</code>.<br />
                Utilise le modèle <strong>claude-sonnet-4-6</strong> avec ~2500 tokens.
              </div>

              <button
                className="btn btn-primary btn-lg"
                onClick={handleGenerate}
                disabled={generating}
                style={{ width: '100%' }}
              >
                {generating
                  ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Génération en cours…</>
                  : '◻ Générer le rapport PDF'}
              </button>

              {error && (
                <div style={{ marginTop: 10, background: 'var(--negative-light)', border: '1px solid #F8BBD9', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 12, color: 'var(--negative)' }}>
                  ✗ {error}
                  {(error.includes('ANTHROPIC') || error.includes('anthropic')) && (
                    <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>
                      Vérifiez ANTHROPIC_API_KEY dans backend/.env
                    </div>
                  )}
                </div>
              )}

              {success && (
                <div style={{ marginTop: 10, background: 'var(--positive-light)', border: '1px solid #B2E8D8', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 12, color: 'var(--positive)', fontWeight: 500 }}>
                  ✓ PDF généré et téléchargé avec succès !
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Preview Panel */}
        <div>
          <div className="card" style={{ height: '100%' }}>
            <div className="card-header">
              <div className="card-title">◻ Aperçu du rapport</div>
            </div>
            <div style={{ padding: '20px', height: 'calc(100% - 53px)', display: 'flex', flexDirection: 'column' }}>
              {generating ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                    Analyse des données Supabase…<br />
                    <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>Génération du rapport par Claude claude-sonnet-4-6</span>
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1 }}>
                  {/* Mock PDF Preview */}
                  <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,.08)' }}>
                    <div style={{ background: 'var(--primary)', padding: '24px 28px', color: 'white' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>RAPPORT COMEX</div>
                      <div style={{ fontSize: 14, opacity: 0.85 }}>Brand & Market Intelligence</div>
                      <div style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>{config.brand} — {config.dateRange}</div>
                    </div>
                    <div style={{ padding: '20px 28px' }}>
                      {[
                        { title: '01 — Résumé Exécutif', lines: 3 },
                        { title: '02 — Réputation & Crise', lines: 5 },
                        { title: '03 — Benchmark Marché', lines: 4 },
                        { title: '04 — Expérience Client', lines: 4 },
                        { title: '05 — Recommandations', lines: 5 },
                      ].filter(s => {
                        const id = s.title.split(' ')[2]?.toLowerCase()
                        return config.sections.some(sec => s.title.toLowerCase().includes(sec.split('_')[0]))
                      }).map((section, i) => (
                        <div key={i} style={{ marginBottom: 16 }}>
                          <div style={{ background: 'var(--primary-light)', padding: '6px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--primary)', marginBottom: 8 }}>{section.title}</div>
                          {Array.from({ length: section.lines }).map((_, j) => (
                            <div key={j} style={{ height: 8, background: 'var(--border)', borderRadius: 4, marginBottom: 5, width: j === section.lines - 1 ? '60%' : '100%' }} />
                          ))}
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: '10px 28px 14px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-light)', textAlign: 'center' }}>
                      Licter Brand Intelligence — Confidentiel — Powered by Claude AI
                    </div>
                  </div>

                  <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--primary-light)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: 4 }}>Ce rapport contiendra :</div>
                    <ul style={{ color: 'var(--text)', paddingLeft: 16, lineHeight: 1.7 }}>
                      {config.sections.includes('reputation') && <li>Analyse de réputation avec score de crise et KPIs</li>}
                      {config.sections.includes('benchmark') && <li>Share of Voice & comparaison Fnac vs {config.competitor}</li>}
                      {config.sections.includes('cx') && <li>Audit expérience client — top irritants & enchantements</li>}
                      {config.sections.includes('recommendations') && <li>5 recommandations stratégiques actionnables</li>}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
