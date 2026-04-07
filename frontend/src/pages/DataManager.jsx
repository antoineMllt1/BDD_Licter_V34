import { useState, useRef, useCallback } from 'react'
import Papa from 'papaparse'
import { supabase } from '../lib/supabase.js'

const TABLES = [
  { value: 'scraping_brand', label: 'Scraping Marque', color: 'var(--primary)' },
  { value: 'scraping_competitor', label: 'Scraping Concurrents', color: '#F97316' },
  { value: 'reputation_crise', label: 'Réputation & Crise', color: 'var(--negative)' },
  { value: 'benchmark_marche', label: 'Benchmark Marché', color: 'var(--blue)' },
  { value: 'voix_client_cx', label: 'Expérience Client', color: 'var(--neutral)' },
]

function UploadZone({ onFile }) {
  const [drag, setDrag] = useState(false)
  const inputRef = useRef()

  const handleDrop = (e) => {
    e.preventDefault(); setDrag(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.name.endsWith('.csv')) onFile(file)
  }

  return (
    <div
      className={`upload-zone ${drag ? 'drag-over' : ''}`}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <div className="upload-zone-icon">↑</div>
      <div className="upload-zone-text">Glissez un fichier CSV ici ou cliquez pour sélectionner</div>
      <div className="upload-zone-sub">Format CSV uniquement — encodage UTF-8 recommandé</div>
      <input ref={inputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </div>
  )
}

export default function DataManager() {
  const [selectedTable, setSelectedTable] = useState('voix_client_cx')
  const [preview, setPreview] = useState(null)
  const [csvFile, setCsvFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [exporting, setExporting] = useState(null)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState({})

  const loadStats = useCallback(async () => {
    const results = await Promise.all(
      TABLES.map(t => supabase.from(t.value).select('*', { count: 'exact', head: true }))
    )
    const s = {}
    TABLES.forEach((t, i) => { s[t.value] = results[i].count || 0 })
    setStats(s)
  }, [])

  useState(() => { loadStats() }, [])

  const handleFile = (file) => {
    setCsvFile(file); setImportResult(null); setError(null)
    Papa.parse(file, {
      header: true, skipEmptyLines: true, preview: 5,
      complete: (res) => setPreview({ headers: res.meta.fields, rows: res.data, total: null }),
    })
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => setPreview(p => ({ ...p, total: res.data.length, allData: res.data })),
    })
  }

  const handleImport = async () => {
    if (!preview?.allData) return
    setImporting(true); setError(null); setImportResult(null)
    try {
      const rows = preview.allData.map(row => {
        const clean = {}
        Object.entries(row).forEach(([k, v]) => {
          if (v !== '' && v !== null && v !== undefined) clean[k] = v
        })
        return clean
      })

      let inserted = 0, skipped = 0
      const CHUNK = 100
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK)
        const { data, error: err } = await supabase
          .from(selectedTable)
          .upsert(chunk, { onConflict: 'review_id', ignoreDuplicates: true })
          .select('id')
        if (err) throw err
        inserted += (data?.length || 0)
        skipped += chunk.length - (data?.length || 0)
      }

      setImportResult({ inserted, skipped, total: rows.length })
      loadStats()
    } catch (err) {
      setError(err.message)
    } finally {
      setImporting(false)
    }
  }

  const handleExport = async (table) => {
    setExporting(table)
    try {
      const { data } = await supabase.from(table).select('*').order('created_at', { ascending: false }).limit(5000)
      if (!data?.length) return
      const csv = Papa.unparse(data)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${table}_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } finally {
      setExporting(null)
    }
  }

  const clearImport = () => { setCsvFile(null); setPreview(null); setImportResult(null); setError(null) }

  return (
    <div>
      {/* Export Section */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">↓ Export CSV</div>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {TABLES.map(t => (
            <div key={t.value} style={{ flex: 1, minWidth: 200, background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '14px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', marginBottom: 2 }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(stats[t.value] || 0).toLocaleString('fr-FR')} enregistrements</div>
                </div>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color, marginTop: 4 }} />
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleExport(t.value)}
                disabled={exporting === t.value}
                style={{ width: '100%' }}
              >
                {exporting === t.value ? '↻ Export…' : `↓ Exporter ${t.label.split(' ')[0]}`}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Import Section */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">↑ Import CSV → Supabase</div>
          {csvFile && <button className="btn btn-ghost btn-sm" onClick={clearImport}>✕ Réinitialiser</button>}
        </div>
        <div style={{ padding: '16px 20px' }}>
          <div className="form-group">
            <label className="form-label">Table cible</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TABLES.map(t => (
                <button
                  key={t.value}
                  onClick={() => setSelectedTable(t.value)}
                  className={`btn btn-sm ${selectedTable === t.value ? 'btn-primary' : 'btn-ghost'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {!csvFile ? (
            <UploadZone onFile={handleFile} />
          ) : (
            <div>
              <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12 }}>
                  <span style={{ fontWeight: 600 }}>📄 {csvFile.name}</span>
                  <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{preview?.total ? `${preview.total.toLocaleString()} lignes` : '…'}</span>
                  {preview?.headers && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{preview.headers.length} colonnes</span>}
                </div>
                <button className="btn btn-ghost btn-sm" onClick={clearImport}>✕</button>
              </div>

              {preview?.headers && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Colonnes détectées</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {preview.headers.map(h => <span key={h} className="badge badge-primary" style={{ fontSize: 10 }}>{h}</span>)}
                  </div>
                </div>
              )}

              {preview?.rows?.length > 0 && (
                <div style={{ marginBottom: 16, overflowX: 'auto' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Aperçu (5 premières lignes)</div>
                  <table className="data-table">
                    <thead>
                      <tr>{preview.headers.slice(0, 8).map(h => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 5).map((row, i) => (
                        <tr key={i}>
                          {preview.headers.slice(0, 8).map(h => (
                            <td key={h}><span className="text-truncate" style={{ maxWidth: 120 }}>{row[h] || '—'}</span></td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {importResult ? (
                <div style={{ background: 'var(--positive-light)', border: '1px solid #B2E8D8', borderRadius: 'var(--radius-sm)', padding: '12px 16px', fontSize: 13 }}>
                  <div style={{ fontWeight: 600, color: 'var(--positive)', marginBottom: 4 }}>✓ Import terminé</div>
                  <div style={{ color: 'var(--text)', fontSize: 12 }}>
                    {importResult.inserted} insérés · {importResult.skipped} doublons ignorés · {importResult.total} traités
                  </div>
                </div>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handleImport}
                  disabled={importing || !preview?.allData}
                >
                  {importing ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />Import en cours…</> : `↑ Importer dans ${TABLES.find(t => t.value === selectedTable)?.label}`}
                </button>
              )}

              {error && (
                <div style={{ marginTop: 10, background: 'var(--negative-light)', border: '1px solid #F8BBD9', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 12, color: 'var(--negative)' }}>
                  ✗ {error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
