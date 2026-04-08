import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'

const SECTIONS = [
  {
    id: 'executive',
    label: 'Accueil COMEX',
    sources: ['reputation', 'benchmark', 'cx'],
    summary: 'Synthese executive, arbitrages et 3 decisions a retenir.',
  },
  {
    id: 'war_room',
    label: 'War Room',
    sources: ['reputation'],
    summary: 'Lecture separee social traction et avis/reputation.',
  },
  {
    id: 'battle_matrix',
    label: 'Battle Matrix',
    sources: ['benchmark'],
    summary: 'Position concurrentielle, dimensions gagnees/perdues et white spaces.',
  },
  {
    id: 'voice_of_customer',
    label: 'Voix du Client',
    sources: ['cx'],
    summary: 'Irritants, parcours, magasins, categories et preuves verbatim.',
  },
  {
    id: 'action_center',
    label: 'Action Center',
    sources: ['reputation', 'benchmark', 'cx'],
    summary: 'Priorites, owners suggeres, urgence et impact business.',
  },
]

const DATA_PRESETS = [
  { value: 'all', label: 'Cockpit complet', sources: ['reputation', 'benchmark', 'cx'] },
  { value: 'brand360', label: 'War Room + Voix du Client', sources: ['reputation', 'cx'] },
  { value: 'market', label: 'War Room + Battle Matrix', sources: ['reputation', 'benchmark'] },
  { value: 'customer', label: 'Voix du Client seule', sources: ['cx'] },
  { value: 'reputation', label: 'War Room seule', sources: ['reputation'] },
  { value: 'benchmark', label: 'Battle Matrix seule', sources: ['benchmark'] },
]

const DETAIL_LEVELS = [
  { value: 'synthesis', label: 'Synthese executive' },
  { value: 'standard', label: 'Standard' },
  { value: 'deep', label: 'Approfondi' },
]

const DATA_VOLUME = [
  { value: 'light', label: 'Rapide - 250 lignes/base' },
  { value: 'standard', label: 'Standard - 500 lignes/base' },
  { value: 'deep', label: 'Approfondi - 1500 lignes/base' },
]

const FOCUS_OPTIONS = [
  { value: 'balanced', label: 'Equilibre cockpit' },
  { value: 'risk', label: 'Risque et crise' },
  { value: 'growth', label: 'Marche et croissance' },
  { value: 'operations', label: 'Execution et operations' },
]

const TONE_OPTIONS = [
  { value: 'corporate', label: 'Corporate / Direction generale' },
  { value: 'consulting', label: 'Consulting / Board memo' },
  { value: 'executive', label: 'Executive summary' },
]

function getPreset(value) {
  return DATA_PRESETS.find((preset) => preset.value === value) || DATA_PRESETS[0]
}

function isSectionAvailable(section, activeSources) {
  return section.sources.some((source) => activeSources.includes(source))
}

function formatComexErrorMessage(message) {
  const text = String(message || '').trim()
  const normalized = text.toLowerCase()

  if (!text) return 'Erreur generation PDF'

  if (
    normalized.includes('overloaded_error') ||
    normalized.includes('529') ||
    normalized.includes('temporairement surcharge')
  ) {
    return 'Anthropic est temporairement surcharge. Relancez la generation du memo dans quelques secondes.'
  }

  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return 'La generation du memo a pris trop de temps. Relancez la generation.'
  }

  return text
}

export default function ComexReport() {
  const [config, setConfig] = useState({
    brand: 'Fnac Darty',
    competitor: 'Boulanger',
    dateRange: '12 derniers mois',
    tone: 'corporate',
    dataPreset: 'all',
    detailLevel: 'standard',
    dataVolume: 'standard',
    focus: 'balanced',
    includeAppendix: 'yes',
    sections: SECTIONS.map((section) => section.id),
  })
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const selectedPreset = useMemo(() => getPreset(config.dataPreset), [config.dataPreset])
  const activeSources = selectedPreset.sources

  const availableSections = useMemo(
    () => SECTIONS.filter((section) => isSectionAvailable(section, activeSources)),
    [activeSources]
  )

  useEffect(() => {
    setConfig((current) => {
      const nextSections = current.sections.filter((sectionId) =>
        availableSections.some((section) => section.id === sectionId)
      )
      const fallbackSections = availableSections.map((section) => section.id)
      return {
        ...current,
        sections: nextSections.length > 0 ? nextSections : fallbackSections,
      }
    })
  }, [availableSections])

  const toggleSection = (id) => {
    setConfig((current) => {
      const exists = current.sections.includes(id)
      return {
        ...current,
        sections: exists
          ? current.sections.filter((sectionId) => sectionId !== id)
          : [...current.sections, id],
      }
    })
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setError(null)
    setSuccess(false)

    try {
      const payload = {
        ...config,
        dataSources: activeSources,
        sections: config.sections.filter((sectionId) => availableSections.some((section) => section.id === sectionId)),
        includeAppendix: config.includeAppendix === 'yes',
      }

      const blob = await api.generateComex(payload)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Rapport_COMEX_${config.brand.replace(/\s/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      setSuccess(true)
    } catch (err) {
      setError(formatComexErrorMessage(err.message))
    } finally {
      setGenerating(false)
    }
  }

  const previewSections = availableSections.filter((section) => config.sections.includes(section.id))

  return (
    <div>
      <section className="strategic-hero">
        <div className="strategic-hero-copy">
          <div className="strategic-eyebrow">Export COMEX / PDF</div>
          <h1 className="strategic-title">Generer un memo Fnac Darty, pas un PDF generique.</h1>
          <p className="strategic-summary">
            Anthropic ecrit la trame, la synthese et les preuves courtes. Le backend rend ensuite un memo
            board-ready au code visuel Fnac Darty.
          </p>

          <div className="editorial-grid">
            <div className="editorial-card">
              <div className="editorial-label">Ce que fait Anthropic</div>
              <div className="editorial-text">
                Claude structure le memo en JSON: cover, synthese, sections, decisions et annexe. Le texte n est plus plaque dans un template brut.
              </div>
            </div>
            <div className="editorial-card accent">
              <div className="editorial-label">Rendu PDF</div>
              <div className="editorial-text">
                Palette Fnac/Darty, logos, cover memo, sections plus nettes et preuves plus visibles. <code>ANTHROPIC_API_KEY</code> doit etre configure dans <code>backend/.env</code>.
              </div>
            </div>
          </div>
        </div>

        <div className="hero-stat-panel">
          <div className="hero-stat-card">
            <div className="hero-stat-label">Architecture</div>
            <div className="hero-stat-value">{previewSections.length}</div>
            <div className="hero-stat-sub">blocs actifs dans l export</div>
          </div>
          <div className="hero-stat-card">
            <div className="hero-stat-label">Preset</div>
            <div className="hero-stat-value" style={{ fontSize: 18 }}>{selectedPreset.label}</div>
            <div className="hero-stat-sub">perimetre des donnees incluses</div>
          </div>
          <div className="hero-stat-card">
            <div className="hero-stat-label">Detail</div>
            <div className="hero-stat-value" style={{ fontSize: 18 }}>
              {DETAIL_LEVELS.find((option) => option.value === config.detailLevel)?.label}
            </div>
            <div className="hero-stat-sub">niveau de profondeur redactionnelle</div>
          </div>
          <div className="hero-stat-card">
            <div className="hero-stat-label">Angle</div>
            <div className="hero-stat-value" style={{ fontSize: 18 }}>
              {FOCUS_OPTIONS.find((option) => option.value === config.focus)?.label}
            </div>
            <div className="hero-stat-sub">priorite d interpretation du memo</div>
          </div>
        </div>
      </section>

      <div className="report-config">
        <div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Configuration du memo</div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div className="form-group">
                <label className="form-label">Marque analysee</label>
                <input className="form-input" value={config.brand} onChange={(e) => setConfig((current) => ({ ...current, brand: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Concurrent principal</label>
                <input className="form-input" value={config.competitor} onChange={(e) => setConfig((current) => ({ ...current, competitor: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Periode d analyse</label>
                <select className="form-select" value={config.dateRange} onChange={(e) => setConfig((current) => ({ ...current, dateRange: e.target.value }))}>
                  <option>3 derniers mois</option>
                  <option>6 derniers mois</option>
                  <option>12 derniers mois</option>
                  <option>Tout l historique</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Perimetre des bases</label>
                <select className="form-select" value={config.dataPreset} onChange={(e) => setConfig((current) => ({ ...current, dataPreset: e.target.value }))}>
                  {DATA_PRESETS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Ton du rapport</label>
                <select className="form-select" value={config.tone} onChange={(e) => setConfig((current) => ({ ...current, tone: e.target.value }))}>
                  {TONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Niveau de detail</label>
                <select className="form-select" value={config.detailLevel} onChange={(e) => setConfig((current) => ({ ...current, detailLevel: e.target.value }))}>
                  {DETAIL_LEVELS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Volume de donnees</label>
                <select className="form-select" value={config.dataVolume} onChange={(e) => setConfig((current) => ({ ...current, dataVolume: e.target.value }))}>
                  {DATA_VOLUME.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Angle prioritaire</label>
                <select className="form-select" value={config.focus} onChange={(e) => setConfig((current) => ({ ...current, focus: e.target.value }))}>
                  {FOCUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Annexe donnees</label>
                <select className="form-select" value={config.includeAppendix} onChange={(e) => setConfig((current) => ({ ...current, includeAppendix: e.target.value }))}>
                  <option value="yes">Oui - sources et volumes</option>
                  <option value="no">Non - memo court</option>
                </select>
              </div>

              <div className="divider" />

              <div className="form-group">
                <label className="form-label">Blocs a inclure</label>
                <div className="battle-pocket-list">
                  {SECTIONS.map((section) => {
                    const isAvailable = availableSections.some((item) => item.id === section.id)
                    return (
                      <label
                        key={section.id}
                        className="battle-pocket-item"
                        style={{ cursor: isAvailable ? 'pointer' : 'not-allowed', opacity: isAvailable ? 1 : 0.45 }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <input
                            type="checkbox"
                            disabled={!isAvailable}
                            checked={config.sections.includes(section.id)}
                            onChange={() => toggleSection(section.id)}
                            style={{ accentColor: 'var(--primary)', width: 14, height: 14, marginTop: 2 }}
                          />
                          <div>
                            <strong style={{ display: 'block', fontSize: 13, color: 'var(--text)', marginBottom: 3 }}>{section.label}</strong>
                            <span>{section.summary}</span>
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              <button className="btn btn-primary btn-lg" onClick={handleGenerate} disabled={generating} style={{ width: '100%', marginTop: 10 }}>
                {generating
                  ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Generation en cours...</>
                  : 'Generer le memo PDF'}
              </button>

              {error && (
                <div style={{ marginTop: 10, background: 'var(--negative-light)', border: '1px solid #F8BBD9', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 12, color: 'var(--negative)' }}>
                  {error}
                  {(error.includes('ANTHROPIC') || error.includes('anthropic')) && (
                    <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}>
                      Verifiez `ANTHROPIC_API_KEY` dans `backend/.env`
                    </div>
                  )}
                </div>
              )}

              {success && (
                <div style={{ marginTop: 10, background: 'var(--positive-light)', border: '1px solid #B2E8D8', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 12, color: 'var(--positive)', fontWeight: 500 }}>
                  PDF genere et telecharge avec succes.
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="card" style={{ height: '100%' }}>
            <div className="card-header">
              <div className="card-title">Apercu du memo</div>
            </div>
            <div style={{ padding: '20px', height: 'calc(100% - 53px)', display: 'flex', flexDirection: 'column' }}>
              {generating ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                    Lecture des bases Supabase...<br />
                    <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>Anthropic structure le memo pendant que le PDF se compose</span>
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1 }}>
                  <div style={{ background: '#fffaf0', border: '1px solid #181410', borderRadius: 18, overflow: 'hidden', boxShadow: '0 18px 40px rgba(17, 17, 17, 0.08)' }}>
                    <div style={{ background: '#ffd200', padding: '20px 24px 22px', color: '#111111', position: 'relative' }}>
                      <div style={{ position: 'absolute', top: 0, right: 0, width: 18, height: '100%', background: '#e30613' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                        <img src="/Fnac_logo.png" alt="Fnac" style={{ width: 52, height: 52, objectFit: 'contain' }} />
                        <img src="/darty_logo.png" alt="Darty" style={{ width: 40, height: 40, objectFit: 'contain' }} />
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 8 }}>Memo COMEX / PDF</div>
                      <div style={{ fontSize: 28, lineHeight: 1.02, fontWeight: 800, maxWidth: 360 }}>Memo Fnac Darty aligne sur le cockpit.</div>
                      <div style={{ fontSize: 13, marginTop: 10, maxWidth: 360, color: '#2b241c' }}>{config.brand} vs {config.competitor} - {config.dateRange}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                        <span style={{ border: '1px solid #111111', borderRadius: 999, padding: '5px 10px', fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.78)' }}>{selectedPreset.label}</span>
                        <span style={{ border: '1px solid #111111', borderRadius: 999, padding: '5px 10px', fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.78)' }}>{DETAIL_LEVELS.find((option) => option.value === config.detailLevel)?.label}</span>
                      </div>
                    </div>

                    <div style={{ padding: '18px 22px 20px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 16 }}>
                        {[
                          { label: 'Tension', value: 'Board' },
                          { label: 'SOV', value: 'Market' },
                          { label: 'CX', value: 'Stores' },
                          { label: 'Actions', value: 'Owners' },
                        ].map((item, index) => (
                          <div key={item.label} style={{ border: `1px solid ${index === 0 ? '#111111' : '#ddd2c0'}`, background: index === 0 ? '#fff1a8' : '#fffdf8', borderRadius: 12, padding: '10px 10px 12px' }}>
                            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6f6558', marginBottom: 6 }}>{item.label}</div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#111111' }}>{item.value}</div>
                          </div>
                        ))}
                      </div>

                      <div style={{ border: '1px solid #ddd2c0', borderRadius: 16, overflow: 'hidden', background: '#fffdf8' }}>
                        <div style={{ background: '#111111', color: '#ffd200', padding: '10px 14px', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                          Preview du memo
                        </div>
                        <div style={{ padding: '14px' }}>
                          {previewSections.map((section, index) => (
                            <div key={section.id} style={{ padding: '12px 0', borderBottom: index === previewSections.length - 1 ? 'none' : '1px solid #efe6d8' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 5 }}>
                                <div style={{ fontSize: 12, fontWeight: 800, color: '#111111' }}>{String(index + 1).padStart(2, '0')} - {section.label}</div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: '#e30613', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Claude + data</div>
                              </div>
                              <div style={{ fontSize: 12, color: '#5a5145', lineHeight: 1.45 }}>{section.summary}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div style={{ padding: '10px 22px 14px', borderTop: '1px solid #ddd2c0', fontSize: 10, color: '#6f6558', textAlign: 'center', background: '#fff6e6' }}>
                      Memo COMEX confidentiel - copywriting Anthropic, rendu PDF Licter
                    </div>
                  </div>

                  <div className="battle-pocket-card" style={{ marginTop: 16 }}>
                    <div className="battle-pocket-title">Parametres du memo</div>
                    <div className="stack-list">
                      <div className="compact-metric-row">
                        <span>Perimetre des bases</span>
                        <strong>{selectedPreset.label}</strong>
                      </div>
                      <div className="compact-metric-row">
                        <span>Angle prioritaire</span>
                        <strong>{FOCUS_OPTIONS.find((option) => option.value === config.focus)?.label}</strong>
                      </div>
                      <div className="compact-metric-row">
                        <span>Niveau de detail</span>
                        <strong>{DETAIL_LEVELS.find((option) => option.value === config.detailLevel)?.label}</strong>
                      </div>
                      <div className="compact-metric-row">
                        <span>Volume analyse</span>
                        <strong>{DATA_VOLUME.find((option) => option.value === config.dataVolume)?.label}</strong>
                      </div>
                      <div className="compact-metric-row">
                        <span>Annexe</span>
                        <strong>{config.includeAppendix === 'yes' ? 'Incluse' : 'Non incluse'}</strong>
                      </div>
                    </div>
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
