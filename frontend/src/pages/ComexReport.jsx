import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'

const SECTIONS = [
  { id: 'reputation', label: 'Reputation & Crise', source: 'reputation' },
  { id: 'benchmark', label: 'Benchmark Marche', source: 'benchmark' },
  { id: 'cx', label: 'Experience Client', source: 'cx' },
  { id: 'recommendations', label: 'Recommandations strategiques', source: 'any' }
]

const DATA_PRESETS = [
  { value: 'all', label: 'Toutes les bases', sources: ['reputation', 'benchmark', 'cx'] },
  { value: 'brand360', label: 'Reputation + CX', sources: ['reputation', 'cx'] },
  { value: 'market', label: 'Reputation + Benchmark', sources: ['reputation', 'benchmark'] },
  { value: 'customer', label: 'CX uniquement', sources: ['cx'] },
  { value: 'reputation', label: 'Reputation uniquement', sources: ['reputation'] },
  { value: 'benchmark', label: 'Benchmark uniquement', sources: ['benchmark'] }
]

const DETAIL_LEVELS = [
  { value: 'synthesis', label: 'Synthese executive' },
  { value: 'standard', label: 'Standard' },
  { value: 'deep', label: 'Approfondi' }
]

const DATA_VOLUME = [
  { value: 'light', label: 'Rapide - 250 lignes/base' },
  { value: 'standard', label: 'Standard - 500 lignes/base' },
  { value: 'deep', label: 'Approfondi - 1500 lignes/base' }
]

const FOCUS_OPTIONS = [
  { value: 'balanced', label: 'Equilibre' },
  { value: 'risk', label: 'Risque & crise' },
  { value: 'growth', label: 'Croissance & marche' },
  { value: 'operations', label: 'Operations & execution' }
]

const TONE_OPTIONS = [
  { value: 'corporate', label: 'Corporate / Direction generale' },
  { value: 'consulting', label: 'Consulting / Board memo' },
  { value: 'executive', label: 'Executive summary' }
]

function getPreset(value) {
  return DATA_PRESETS.find(preset => preset.value === value) || DATA_PRESETS[0]
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
    sections: SECTIONS.map(section => section.id)
  })
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const selectedPreset = useMemo(() => getPreset(config.dataPreset), [config.dataPreset])
  const activeSources = selectedPreset.sources

  const availableSections = useMemo(
    () => SECTIONS.filter(section => section.source === 'any' || activeSources.includes(section.source)),
    [activeSources]
  )

  useEffect(() => {
    setConfig(current => {
      const nextSections = current.sections.filter(sectionId =>
        availableSections.some(section => section.id === sectionId)
      )
      const fallbackSections = availableSections.map(section => section.id)
      return {
        ...current,
        sections: nextSections.length > 0 ? nextSections : fallbackSections
      }
    })
  }, [availableSections])

  const toggleSection = (id) => {
    setConfig(current => {
      const exists = current.sections.includes(id)
      return {
        ...current,
        sections: exists ? current.sections.filter(sectionId => sectionId !== id) : [...current.sections, id]
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
        sections: config.sections.filter(sectionId => availableSections.some(section => section.id === sectionId)),
        includeAppendix: config.includeAppendix === 'yes'
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
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const previewSections = availableSections.filter(section => config.sections.includes(section.id))

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Rapport COMEX</div>
        <div className="page-subtitle">Generation de rapports executives par IA - Claude claude-sonnet-4-6</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 24 }}>
        <div>
          <div className="card">
            <div className="card-header">
              <div className="card-title">Configuration du rapport</div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div className="form-group">
                <label className="form-label">Marque analysee</label>
                <input className="form-input" value={config.brand} onChange={e => setConfig(c => ({ ...c, brand: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Concurrent principal</label>
                <input className="form-input" value={config.competitor} onChange={e => setConfig(c => ({ ...c, competitor: e.target.value }))} />
              </div>

              <div className="form-group">
                <label className="form-label">Periode d'analyse</label>
                <select className="form-select" value={config.dateRange} onChange={e => setConfig(c => ({ ...c, dateRange: e.target.value }))}>
                  <option>3 derniers mois</option>
                  <option>6 derniers mois</option>
                  <option>12 derniers mois</option>
                  <option>Tout l'historique</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Bases integrees</label>
                <select className="form-select" value={config.dataPreset} onChange={e => setConfig(c => ({ ...c, dataPreset: e.target.value }))}>
                  {DATA_PRESETS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Ton du rapport</label>
                <select className="form-select" value={config.tone} onChange={e => setConfig(c => ({ ...c, tone: e.target.value }))}>
                  {TONE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Niveau de detail</label>
                <select className="form-select" value={config.detailLevel} onChange={e => setConfig(c => ({ ...c, detailLevel: e.target.value }))}>
                  {DETAIL_LEVELS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Volume de donnees</label>
                <select className="form-select" value={config.dataVolume} onChange={e => setConfig(c => ({ ...c, dataVolume: e.target.value }))}>
                  {DATA_VOLUME.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Angle prioritaire</label>
                <select className="form-select" value={config.focus} onChange={e => setConfig(c => ({ ...c, focus: e.target.value }))}>
                  {FOCUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Annexe donnees</label>
                <select className="form-select" value={config.includeAppendix} onChange={e => setConfig(c => ({ ...c, includeAppendix: e.target.value }))}>
                  <option value="yes">Oui - inclure les sources et volumes</option>
                  <option value="no">Non - rapport court uniquement</option>
                </select>
              </div>

              <div className="divider" />

              <div className="form-group">
                <label className="form-label">Sections a inclure</label>
                {SECTIONS.map(section => {
                  const isAvailable = availableSections.some(item => item.id === section.id)
                  return (
                    <label key={section.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, cursor: isAvailable ? 'pointer' : 'not-allowed', opacity: isAvailable ? 1 : 0.45 }}>
                      <input
                        type="checkbox"
                        disabled={!isAvailable}
                        checked={config.sections.includes(section.id)}
                        onChange={() => toggleSection(section.id)}
                        style={{ accentColor: 'var(--primary)', width: 14, height: 14 }}
                      />
                      <span style={{ fontSize: 12, color: 'var(--text)' }}>{section.label}</span>
                    </label>
                  )
                })}
              </div>

              <div className="divider" />

              <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', marginBottom: 14, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--text)' }}>Prerequis :</strong> `ANTHROPIC_API_KEY` doit etre configure dans <code>backend/.env</code>.<br />
                Le rapport utilisera uniquement les bases et sections selectionnees ci-dessus.
              </div>

              <button className="btn btn-primary btn-lg" onClick={handleGenerate} disabled={generating} style={{ width: '100%' }}>
                {generating
                  ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />Generation en cours...</>
                  : 'Generer le rapport PDF'}
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
              <div className="card-title">Apercu du rapport</div>
            </div>
            <div style={{ padding: '20px', height: 'calc(100% - 53px)', display: 'flex', flexDirection: 'column' }}>
              {generating ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4 }} />
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                    Analyse des donnees Supabase...<br />
                    <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>Generation du rapport par Claude claude-sonnet-4-6</span>
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1 }}>
                  <div style={{ background: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,.08)' }}>
                    <div style={{ background: 'var(--primary)', padding: '24px 28px', color: 'white' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>RAPPORT COMEX</div>
                      <div style={{ fontSize: 14, opacity: 0.85 }}>Brand & Market Intelligence</div>
                      <div style={{ fontSize: 12, marginTop: 8, opacity: 0.7 }}>{config.brand} - {config.dateRange}</div>
                    </div>
                    <div style={{ padding: '20px 28px' }}>
                      {previewSections.map((section, index) => (
                        <div key={section.id} style={{ marginBottom: 16 }}>
                          <div style={{ background: 'var(--primary-light)', padding: '6px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, color: 'var(--primary)', marginBottom: 8 }}>
                            {String(index + 1).padStart(2, '0')} - {section.label}
                          </div>
                          {Array.from({ length: section.id === 'recommendations' ? 5 : 4 }).map((_, row) => (
                            <div key={row} style={{ height: 8, background: 'var(--border)', borderRadius: 4, marginBottom: 5, width: row === 3 ? '60%' : '100%' }} />
                          ))}
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: '10px 28px 14px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-light)', textAlign: 'center' }}>
                      Licter Brand Intelligence - Confidentiel - Powered by Claude AI
                    </div>
                  </div>

                  <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--primary-light)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: 4 }}>Ce rapport contiendra :</div>
                    <ul style={{ color: 'var(--text)', paddingLeft: 16, lineHeight: 1.7 }}>
                      <li>Bases integrees : {selectedPreset.label}</li>
                      <li>Angle prioritaire : {FOCUS_OPTIONS.find(option => option.value === config.focus)?.label}</li>
                      <li>Niveau de detail : {DETAIL_LEVELS.find(option => option.value === config.detailLevel)?.label}</li>
                      <li>Volume de donnees : {DATA_VOLUME.find(option => option.value === config.dataVolume)?.label}</li>
                      <li>Sections actives : {previewSections.map(section => section.label).join(', ')}</li>
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
