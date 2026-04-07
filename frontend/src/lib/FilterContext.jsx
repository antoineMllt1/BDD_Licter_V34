import { createContext, useContext, useState } from 'react'

const FilterContext = createContext()

const PERIOD_OPTIONS = [
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '90d', label: '90 jours' },
  { value: 'all', label: 'Tout' },
]

const PLATFORM_OPTIONS = [
  { value: 'all', label: 'Toutes' },
  { value: 'Google Reviews', label: 'Google Reviews' },
  { value: 'Trustpilot', label: 'Trustpilot' },
  { value: 'Twitter/X', label: 'Twitter/X' },
  { value: 'Reputation', label: 'Reputation' },
  { value: 'Benchmark', label: 'Benchmark' },
  { value: 'CX', label: 'CX' },
  { value: 'Review', label: 'Review' },
]

const SENTIMENT_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'Positive', label: 'Positif' },
  { value: 'Negative', label: 'Negatif' },
  { value: 'Neutral', label: 'Neutre' },
]

const SEVERITY_OPTIONS = [
  { value: 'all', label: 'Toutes' },
  { value: 'critical', label: 'Critique' },
  { value: 'high', label: 'Haute' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'low', label: 'Basse' },
]

export function FilterProvider({ children }) {
  const [filters, setFilters] = useState({
    period: '30d',
    platform: 'all',
    sentiment: 'all',
    severity: 'all',
    brand: 'all',
    city: 'all',
    category: 'all',
  })

  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const getDateCutoff = () => {
    if (filters.period === 'all') return null
    const days = parseInt(filters.period)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return cutoff.toISOString()
  }

  const platformMatches = (rowPlatform, selectedPlatform) => {
    const normalizedRow = String(rowPlatform || '').trim().toLowerCase()
    const normalizedSelected = String(selectedPlatform || '').trim().toLowerCase()

    if (normalizedSelected === 'twitter/x') {
      return ['twitter/x', 'twitter', 'x'].includes(normalizedRow)
    }

    return normalizedRow === normalizedSelected
  }

  const applyFilters = (rows) => {
    let filtered = rows
    const cutoff = getDateCutoff()
    if (cutoff) filtered = filtered.filter(r => r.date >= cutoff)
    if (filters.platform !== 'all') filtered = filtered.filter(r => platformMatches(r.platform, filters.platform))
    if (filters.sentiment !== 'all') filtered = filtered.filter(r => (r.sentiment || r.sentiment_detected) === filters.sentiment)
    if (filters.severity !== 'all') filtered = filtered.filter(r => r.severity === filters.severity)
    if (filters.city !== 'all') filtered = filtered.filter(r => (r.store_city || r.storeCity) === filters.city)
    if (filters.category !== 'all') filtered = filtered.filter(r => r.category === filters.category)
    return filtered
  }

  return (
    <FilterContext.Provider value={{ filters, updateFilter, applyFilters, getDateCutoff, PERIOD_OPTIONS, PLATFORM_OPTIONS, SENTIMENT_OPTIONS, SEVERITY_OPTIONS }}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilters() {
  return useContext(FilterContext)
}

function FilterSelectChip({ label, value, onChange, options, active = false }) {
  return (
    <label className={`filter-chip ${active ? 'active' : ''}`}>
      <span className="filter-chip-label">{label}</span>
      <select value={value} onChange={onChange} aria-label={label}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function GlobalFiltersBar() {
  const { filters, updateFilter, PERIOD_OPTIONS, PLATFORM_OPTIONS, SENTIMENT_OPTIONS, SEVERITY_OPTIONS } = useFilters()
  const activePeriodLabel = PERIOD_OPTIONS.find((option) => option.value === filters.period)?.label || 'Fenetre active'

  return (
    <div className="filters-bar">
      <div className="filters-bar-summary">
        <span className="filter-label">Lecture active</span>
        <strong>{activePeriodLabel}</strong>
      </div>

      <FilterSelectChip
        label="Periode"
        value={filters.period}
        onChange={(event) => updateFilter('period', event.target.value)}
        options={PERIOD_OPTIONS}
        active
      />

      <FilterSelectChip
        label="Source"
        value={filters.platform}
        onChange={(event) => updateFilter('platform', event.target.value)}
        options={PLATFORM_OPTIONS}
      />

      <FilterSelectChip
        label="Sentiment"
        value={filters.sentiment}
        onChange={(event) => updateFilter('sentiment', event.target.value)}
        options={SENTIMENT_OPTIONS}
      />

      <FilterSelectChip
        label="Criticite"
        value={filters.severity}
        onChange={(event) => updateFilter('severity', event.target.value)}
        options={SEVERITY_OPTIONS}
      />
    </div>
  )
}
