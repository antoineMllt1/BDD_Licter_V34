import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { supabase } from '../lib/supabase.js'
import KPICard from '../components/KPICard.jsx'
import ChartCard from '../components/ChartCard.jsx'
import DataTable from '../components/DataTable.jsx'
import { SentimentBadge, PlatformBadge, RatingStars } from '../components/StatusBadge.jsx'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const COLORS_PIE = { Positif: '#10B981', Negatif: '#F43F5E', Neutre: '#F59E0B' }
const SENTIMENT_COLORS = { Positive: '#10B981', Neutral: '#F59E0B', Negative: '#F43F5E' }
const CITY_ALIASES = [
  ['Boulogne', 'Boulogne-Billancourt'],
  ['Beaugrenelle', 'Paris'],
  ['Ternes', 'Paris'],
  ['Montparnasse', 'Paris'],
  ['Passy', 'Paris'],
  ['La Defense', 'Paris'],
  ['La Défense', 'Paris'],
  ['Fnac Darty', 'Paris']
]
const CITY_COORDINATES = {
  'Boulogne-Billancourt': [2.24, 48.84],
  Paris: [2.35, 48.86],
  Lille: [3.06, 50.63],
  Amiens: [2.30, 49.89],
  Rouen: [1.09, 49.44],
  Reims: [4.03, 49.26],
  Nancy: [6.18, 48.69],
  Metz: [6.18, 49.12],
  Strasbourg: [7.75, 48.58],
  Caen: [-0.37, 49.18],
  Brest: [-4.49, 48.39],
  Rennes: [-1.68, 48.11],
  'Le Havre': [0.11, 49.49],
  Tours: [0.69, 47.39],
  Nantes: [-1.55, 47.22],
  Angers: [-0.56, 47.47],
  Orleans: [1.91, 47.90],
  Orléans: [1.91, 47.90],
  Dijon: [5.04, 47.32],
  Besancon: [6.02, 47.24],
  Besançon: [6.02, 47.24],
  Poitiers: [0.34, 46.58],
  'La Rochelle': [-1.15, 46.16],
  Limoges: [1.26, 45.83],
  Lyon: [4.84, 45.76],
  'Clermont-Ferrand': [3.09, 45.78],
  Grenoble: [5.72, 45.19],
  'Saint-Etienne': [4.39, 45.44],
  'Saint-Étienne': [4.39, 45.44],
  Bordeaux: [-0.58, 44.84],
  Valence: [4.89, 44.93],
  Avignon: [4.81, 43.95],
  Nimes: [4.36, 43.84],
  Nîmes: [4.36, 43.84],
  Montpellier: [3.88, 43.61],
  Toulouse: [1.44, 43.60],
  Marseille: [5.38, 43.30],
  Toulon: [5.93, 43.12],
  Nice: [7.26, 43.70],
  Cannes: [7.01, 43.55],
  Perpignan: [2.89, 42.69],
  Pau: [-0.37, 43.30],
  Bayonne: [-1.47, 43.49],
  Annecy: [6.13, 45.90],
  Mulhouse: [7.34, 47.75]
}

function resolveCityName(text) {
  const raw = `${text || ''}`.trim()
  if (!raw || /fnac\.com/i.test(raw)) return null
  const aliasMatch = CITY_ALIASES.find(([alias]) => new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(raw))
  const resolvedText = aliasMatch ? `${raw} ${aliasMatch[1]}` : raw

  return Object.keys(CITY_COORDINATES)
    .sort((left, right) => right.length - left.length)
    .find(city => new RegExp(city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(resolvedText)) || null
}

function getStoreLabel(row) {
  return row.store_name || `${row.location || ''}`.split(' — ')[0].trim() || '—'
}

function getStoreCityName(row) {
  return row.store_city || resolveCityName([row.store_name, row.store_address, row.location].filter(Boolean).join(' '))
}

function toFiniteNumber(value) {
  const parsed = Number(`${value ?? ''}`.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function parseCoordinatesFromSourceUrl(sourceUrl) {
  const raw = `${sourceUrl || ''}`.trim()
  if (!raw) return null

  const dataMatch = raw.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (dataMatch) {
    const latitude = toFiniteNumber(dataMatch[1])
    const longitude = toFiniteNumber(dataMatch[2])
    if (latitude !== null && longitude !== null) return [longitude, latitude]
  }

  const atMatch = raw.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)
  if (atMatch) {
    const latitude = toFiniteNumber(atMatch[1])
    const longitude = toFiniteNumber(atMatch[2])
    if (latitude !== null && longitude !== null) return [longitude, latitude]
  }

  return null
}

function getStoreCoordinates(row, city) {
  const longitude = toFiniteNumber(row.store_longitude ?? row.longitude ?? row.lng ?? row.lon)
  const latitude = toFiniteNumber(row.store_latitude ?? row.latitude ?? row.lat)
  if (longitude !== null && latitude !== null) return [longitude, latitude]

  const sourceUrlCoordinates = parseCoordinatesFromSourceUrl(row.source_url)
  if (sourceUrlCoordinates) return sourceUrlCoordinates

  return city ? CITY_COORDINATES[city] || null : null
}

function getStoreLogo(storeName) {
  const normalized = `${storeName || ''}`.toLowerCase()
  if (normalized.includes('boulanger')) return { src: '/boulanger_logo.png', alt: 'Boulanger', bg: '#FFFFFF' }
  if (normalized.includes('darty')) return { src: '/darty_logo.png', alt: 'Darty', bg: '#101935' }
  return { src: '/Fnac_logo.png', alt: 'Fnac', bg: '#101935' }
}

function getStoreComments(rows) {
  return rows
    .filter(row => row.text)
    .sort((left, right) => `${right.date || ''}`.localeCompare(`${left.date || ''}`))
    .slice(0, 5)
}

function FranceStoreMap({ stores, selectedStoreKey, onSelect }) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          carto: {
            type: 'raster',
            tiles: [
              'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png'
            ],
            tileSize: 256,
            attribution: 'CartoDB'
          }
        },
        layers: [
          {
            id: 'carto',
            type: 'raster',
            source: 'carto'
          }
        ]
      },
      center: [2.2, 46.4],
      zoom: 5.2,
      minZoom: 4.5,
      maxZoom: 14
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map
    map.on('load', () => setMapReady(true))

    return () => {
      markersRef.current.forEach(marker => marker.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    markersRef.current.forEach(marker => marker.remove())
    markersRef.current = []

    stores.forEach(store => {
      const isSelected = selectedStoreKey === store.storeKey
      const fill = store.negRate >= 0.6 ? '#F43F5E' : store.negRate >= 0.35 ? '#F59E0B' : '#10B981'
      const markerElement = document.createElement('div')
      markerElement.style.width = isSelected ? '22px' : '16px'
      markerElement.style.height = isSelected ? '22px' : '16px'
      markerElement.style.borderRadius = '999px'
      markerElement.style.background = fill
      markerElement.style.border = isSelected ? '3px solid #fff' : '2px solid #fff'
      markerElement.style.boxSizing = 'border-box'
      markerElement.style.boxShadow = isSelected ? `0 0 0 5px ${fill}30, 0 2px 8px rgba(0,0,0,.15)` : `0 2px 6px rgba(0,0,0,.12)`
      markerElement.style.cursor = 'pointer'
      markerElement.style.pointerEvents = 'auto'
      markerElement.style.transition = 'all 180ms ease'
      markerElement.addEventListener('click', event => {
        event.preventDefault()
        onSelect(store.storeKey)
      })

      const popup = new maplibregl.Popup({ offset: 18, closeButton: false })
        .setHTML(`
          <div style="font-family: 'DM Sans', sans-serif; min-width: 180px;">
            <div style="font-weight:700; color:#1E1B3A; margin-bottom:4px;">${store.store}</div>
            <div style="font-size:12px; color:#8B8AA0; margin-bottom:8px;">${store.city}</div>
            <div style="display:flex; justify-content:space-between; font-size:12px; color:#1E1B3A;">
              <span>${store.total} avis</span>
              <span style="font-weight:700; color:${fill};">${Math.round(store.negRate * 100)}% neg.</span>
            </div>
          </div>
        `)

      const marker = new maplibregl.Marker({ element: markerElement, anchor: 'center' })
        .setLngLat(store.coordinates)
        .setPopup(popup)
        .addTo(map)

      markersRef.current.push(marker)
    })
  }, [stores, selectedStoreKey, onSelect])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !stores.length) return

    if (!selectedStoreKey) {
      map.flyTo({ center: [2.2, 46.4], zoom: 4.9, duration: 800, essential: true })
      return
    }

    const selected = stores.find(store => store.storeKey === selectedStoreKey)
    if (!selected) return
    map.flyTo({ center: selected.coordinates, zoom: 8.2, duration: 900, essential: true })
  }, [stores, selectedStoreKey])

  if (!stores.length) {
    return <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '12px 0' }}>Aucun magasin Google Reviews géolocalisé pour l’instant.</div>
  }

  return (
    <div style={{ position: 'relative', height: 480, borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--bg)' }}>
      <div ref={mapContainerRef} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', left: 14, bottom: 14, display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.92)', boxShadow: 'var(--shadow)' }}>
        {['Positive', 'Neutral', 'Negative'].map(key => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: SENTIMENT_COLORS[key] }} />
            {key === 'Positive' ? 'Faible risque' : key === 'Neutral' ? 'Mixte' : 'À surveiller'}
          </div>
        ))}
      </div>
    </div>
  )
}

function StorePanel({ store }) {
  if (!store) {
    return (
      <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius)', padding: 18, background: 'var(--surface-alt)' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Fiche magasin</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Cliquez sur un point de la carte ou sur un magasin du classement pour afficher son détail.</div>
      </div>
    )
  }

  const sentimentBars = [
    { label: 'Positifs', value: store.positive, color: 'var(--positive)' },
    { label: 'Neutres', value: store.neutral, color: 'var(--neutral)' },
    { label: 'Négatifs', value: store.negative, color: 'var(--negative)' }
  ]

  return (
    <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius)', padding: 18, background: 'linear-gradient(180deg, #FFFFFF 0%, #FBFAFF 100%)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{store.store}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{store.city}</div>
          {store.address && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{store.address}</div>}
        </div>
        <span className="badge" style={{ background: '#EEF6FF', color: '#5B9CF6' }}>Google Reviews</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 16 }}>
        <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-alt)' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Avis</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{store.total}</div>
        </div>
        <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-alt)' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Négatifs</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--negative)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{Math.round(store.negRate * 100)}%</div>
        </div>
        <div style={{ padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-alt)' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>Note moy.</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{store.avgRating ? `${store.avgRating}/5` : '—'}</div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {sentimentBars.map(item => (
          <div key={item.label} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
              <span style={{ color: 'var(--text)', fontWeight: 700 }}>{item.value}</span>
            </div>
            <div style={{ width: '100%', height: 8, borderRadius: 999, background: 'var(--border-light)' }}>
              <div style={{ width: `${store.total ? Math.round((item.value / store.total) * 100) : 0}%`, height: '100%', borderRadius: 999, background: item.color }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ScrapingBrand() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selectedStoreKey, setSelectedStoreKey] = useState(null)
  const [showStoreComments, setShowStoreComments] = useState(false)
  const [selectedRow, setSelectedRow] = useState(null)

  const handleSelectStore = storeKey => {
    setSelectedRow(null)
    setSelectedStoreKey(current => current === storeKey ? null : storeKey)
  }

  const handleSelectRow = row => {
    if (row.platform === 'Google Reviews') {
      const city = getStoreCityName(row)
      const store = getStoreLabel(row)
      const targetKey = `${store}-${city}`
      setSelectedRow(row)
      setSelectedStoreKey(current => current === targetKey ? null : targetKey)
      return
    }

    setSelectedRow(current => current?.review_id === row.review_id ? null : row)
  }

  useEffect(() => {
    supabase.from('scraping_brand').select('*').order('date', { ascending: false }).limit(2000)
      .then(({ data: rows }) => {
        setData(rows || [])
        setLoading(false)
      })
  }, [])

  const stats = useMemo(() => {
    const neg = data.filter(row => row.sentiment === 'Negative').length
    const pos = data.filter(row => row.sentiment === 'Positive').length
    const neu = data.filter(row => row.sentiment === 'Neutral').length
    const rated = data.filter(row => row.rating)
    const avg = rated.length > 0 ? rated.reduce((sum, row) => sum + Number(row.rating), 0) / rated.length : 0
    const crisisScore = data.length > 0 ? Math.round((neg / data.length) * 100) : 0
    return { neg, pos, neu, crisisScore, avg: avg.toFixed(2), rated: rated.length, total: data.length }
  }, [data])

  const volumeByDay = useMemo(() => {
    const byDay = {}
    data.forEach(row => {
      if (!row.date) return
      const day = row.date.slice(0, 10)
      if (!byDay[day]) byDay[day] = { date: day, Positive: 0, Negative: 0, Neutral: 0 }
      if (row.sentiment) byDay[day][row.sentiment] += 1
    })
    return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).slice(-60)
  }, [data])

  const platformData = useMemo(() => {
    const byPlatform = {}
    data.forEach(row => {
      if (!row.platform) return
      byPlatform[row.platform] = (byPlatform[row.platform] || 0) + 1
    })
    return Object.entries(byPlatform).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  }, [data])

  const sentimentPie = useMemo(() => [
    { name: 'Positif', value: stats.pos },
    { name: 'Negatif', value: stats.neg },
    { name: 'Neutre', value: stats.neu }
  ].filter(entry => entry.value > 0), [stats])

  const categoryData = useMemo(() => {
    const categories = {}
    data.forEach(row => {
      if (!row.category) return
      if (!categories[row.category]) categories[row.category] = { name: row.category, total: 0, pos: 0, neg: 0 }
      categories[row.category].total += 1
      if (row.sentiment === 'Positive') categories[row.category].pos += 1
      if (row.sentiment === 'Negative') categories[row.category].neg += 1
    })
    return Object.values(categories).sort((a, b) => b.total - a.total)
  }, [data])

  const ratingTrend = useMemo(() => {
    const byMonth = {}
    data.forEach(row => {
      if (!row.date || !row.rating) return
      const month = row.date.slice(0, 7)
      if (!byMonth[month]) byMonth[month] = { month, sum: 0, count: 0 }
      byMonth[month].sum += Number(row.rating)
      byMonth[month].count += 1
    })
    return Object.values(byMonth)
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(month => ({ month: month.month, avg: parseFloat((month.sum / month.count).toFixed(2)) }))
  }, [data])

  const storeInsights = useMemo(() => {
    const stores = {}

    data
      .filter(row => row.platform === 'Google Reviews')
      .forEach(row => {
        const city = getStoreCityName(row)
        const coordinates = getStoreCoordinates(row, city)
        if (!coordinates) return

        const store = getStoreLabel(row) || city || 'Magasin'
        const resolvedCity = city || store
        const key = `${store}-${resolvedCity}`
        if (!stores[key]) {
          stores[key] = {
            storeKey: key,
            store,
            city: resolvedCity,
            coordinates,
            address: row.store_address || null,
            total: 0,
            positive: 0,
            negative: 0,
            neutral: 0,
            ratings: [],
            comments: []
          }
        }

        stores[key].total += 1
        if (row.sentiment === 'Positive') stores[key].positive += 1
        if (row.sentiment === 'Negative') stores[key].negative += 1
        if (row.sentiment === 'Neutral') stores[key].neutral += 1
        if (row.rating) stores[key].ratings.push(Number(row.rating))
        stores[key].comments.push(row)
      })

    const points = Object.values(stores)
      .map(store => ({
        ...store,
        negRate: store.total > 0 ? store.negative / store.total : 0,
        avgRating: store.ratings.length ? (store.ratings.reduce((sum, rating) => sum + rating, 0) / store.ratings.length).toFixed(1) : null,
        comments: getStoreComments(store.comments)
      }))
      .sort((a, b) => {
        if (b.negRate !== a.negRate) return b.negRate - a.negRate
        return b.total - a.total
      })

    return {
      stores: points,
      coveredCities: new Set(points.map(point => point.city)).size,
      coveredStores: points.length,
      mostCritical: points[0] || null
    }
  }, [data])

  useEffect(() => {
    if (!storeInsights.stores.length) return
    if (selectedStoreKey && storeInsights.stores.some(store => store.storeKey === selectedStoreKey)) return
    setSelectedStoreKey(null)
  }, [storeInsights, selectedStoreKey])

  useEffect(() => {
    setShowStoreComments(false)
  }, [selectedStoreKey])

  const selectedStore = useMemo(
    () => storeInsights.stores.find(store => store.storeKey === selectedStoreKey) || null,
    [selectedStoreKey, storeInsights]
  )

  const filtered = useMemo(() => {
    if (filter === 'all') return data
    const targetSentiment = filter.charAt(0).toUpperCase() + filter.slice(1)
    return data.filter(row => row.sentiment === targetSentiment)
  }, [data, filter])

  const tableColumns = [
    { key: 'date', label: 'Date', width: 100, render: value => value ? new Date(value).toLocaleDateString('fr-FR') : '—' },
    { key: 'platform', label: 'Plateforme', render: value => <PlatformBadge value={value} /> },
    { key: 'store_name', label: 'Magasin', render: (_, row) => getStoreLabel(row) },
    { key: 'store_city', label: 'Ville', render: (_, row) => row.store_city || getStoreCityName(row) || '—' },
    { key: 'category', label: 'Categorie', render: value => value ? <span className="badge badge-blue">{value}</span> : '—' },
    { key: 'text', label: 'Texte', truncate: true },
    { key: 'rating', label: 'Note', render: value => <RatingStars value={value} /> },
    { key: 'sentiment', label: 'Sentiment', render: value => <SentimentBadge value={value} /> }
  ]

  if (loading) return (
    <div>
      <div className="kpi-grid">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton skeleton-kpi" style={{ height: 96, borderRadius: 'var(--radius)' }} />
        ))}
      </div>
      <div className="skeleton skeleton-chart" style={{ height: 260, borderRadius: 'var(--radius)', marginBottom: 20 }} />
      <div className="skeleton skeleton-chart" style={{ height: 220, borderRadius: 'var(--radius)', marginBottom: 20 }} />
      <div className="skeleton" style={{ height: 320, borderRadius: 'var(--radius)' }} />
    </div>
  )

  return (
    <div>
      {stats.total === 0 ? (
        <div className="card">
          <div className="empty-state" style={{ padding: 72, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ opacity: 0.35 }}>
              <circle cx="24" cy="24" r="20" stroke="var(--text-muted)" strokeWidth="2" />
              <path d="M16 24h16M24 16v16" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Aucune donnée Google Reviews disponible</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 360, textAlign: 'center', lineHeight: 1.6 }}>Lancez un scraping depuis le Hub Scraping avec la destination <strong>scraping_brand</strong> pour alimenter ce tableau de bord.</div>
          </div>
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            {[
              { label: 'Mentions Scrapées', value: stats.total.toLocaleString(), sub: 'base scraping marque', icon: '◉', color: 'primary' },
              { label: 'Score de Crise', value: `${stats.crisisScore}%`, sub: `${stats.neg} négatives`, icon: '⚠', color: stats.crisisScore > 50 ? 'negative' : stats.crisisScore > 30 ? 'neutral' : 'positive' },
              { label: 'Note Moyenne', value: stats.rated > 0 ? `${stats.avg}/5` : '—', sub: `${stats.rated} notes`, icon: '★', color: 'neutral' },
              { label: 'Avis Positifs', value: stats.pos, sub: `${stats.total > 0 ? Math.round((stats.pos / stats.total) * 100) : 0}%`, icon: '↑', color: 'positive' },
              { label: 'Magasins Couverts', value: storeInsights.coveredStores || '—', sub: `${storeInsights.coveredCities} villes via Google Reviews`, icon: '⌖', color: 'blue' },
              { label: 'Magasin le plus fragile', value: storeInsights.mostCritical?.store || '—', sub: storeInsights.mostCritical ? `${Math.round(storeInsights.mostCritical.negRate * 100)}% négatifs` : 'en attente de localisation', icon: '◎', color: storeInsights.mostCritical?.negRate > 0.5 ? 'negative' : 'neutral' }
            ].map((kpi, index) => (
              <div key={kpi.label} className="fade-in-up" style={{ animationDelay: `${index * 80}ms` }}>
                <KPICard
                  label={kpi.label}
                  value={kpi.value}
                  sub={kpi.sub}
                  icon={kpi.icon}
                  color={kpi.color}
                  valueStyle={{ fontSize: 30, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
                />
              </div>
            ))}
          </div>

          <div className="grid-2" style={{ marginBottom: 20 }}>
            <ChartCard title="Volume par sentiment" icon="◔" meta="60 derniers jours">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={volumeByDay} barSize={6}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={value => value.slice(5)} interval={6} />
                  <YAxis tick={{ fontSize: 10 }} width={28} />
                  <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #ECEEF6', borderRadius: 8, fontSize: 12, color: '#1E1B3A' }} />
                  <Bar dataKey="Positive" stackId="a" fill="#10B981" name="Positif" />
                  <Bar dataKey="Neutral" stackId="a" fill="#F59E0B" name="Neutre" />
                  <Bar dataKey="Negative" stackId="a" fill="#F43F5E" name="Négatif" radius={[3, 3, 0, 0]} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ChartCard title="Sentiment" icon="◐">
                <ResponsiveContainer width="100%" height={130}>
                  <PieChart>
                    <Pie data={sentimentPie} cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={3} dataKey="value">
                      {sentimentPie.map(entry => <Cell key={entry.name} fill={COLORS_PIE[entry.name] || '#aaa'} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #ECEEF6', borderRadius: 8, fontSize: 12, color: '#1E1B3A' }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Plateformes" icon="◈">
                <div style={{ padding: '0 0 8px' }}>
                  {platformData.slice(0, 5).map(platform => (
                    <div key={platform.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid var(--border-light)', fontSize: 12 }}>
                      <span style={{ fontWeight: 500 }}>{platform.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{platform.value} <span style={{ fontSize: 10 }}>({Math.round((platform.value / stats.total) * 100)}%)</span></span>
                    </div>
                  ))}
                </div>
              </ChartCard>
            </div>
          </div>

          {ratingTrend.length > 0 && (
            <div className="grid-2" style={{ marginBottom: 20 }}>
              <ChartCard title="Évolution de la note" icon="★">
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={ratingTrend}>
                    <defs>
                      <linearGradient id="ratingGradSB" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--positive)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--positive)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} tickFormatter={value => value.slice(2)} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} width={28} />
                    <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #ECEEF6', borderRadius: 8, fontSize: 12, color: '#1E1B3A' }} formatter={value => [`${value}/5`, 'Note moyenne']} />
                    <Area type="monotone" dataKey="avg" stroke="var(--positive)" strokeWidth={2} fill="url(#ratingGradSB)" name="Note" />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Par catégorie" icon="◻">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={categoryData.slice(0, 8)} layout="vertical" barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #ECEEF6', borderRadius: 8, fontSize: 12, color: '#1E1B3A' }} />
                    <Bar dataKey="pos" fill="var(--positive)" name="Positifs" stackId="a" />
                    <Bar dataKey="neg" fill="var(--negative)" name="Négatifs" stackId="a" radius={[0, 3, 3, 0]} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

          <div className="grid-2" style={{ marginBottom: 20, alignItems: 'start' }}>
            <ChartCard title="Carte France — réseau magasins" icon="⌖" meta={`${storeInsights.coveredStores} magasins Google Reviews`}>
              <FranceStoreMap stores={storeInsights.stores} selectedStoreKey={selectedStoreKey} onSelect={handleSelectStore} />
            </ChartCard>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <StorePanel store={selectedStore} />
              {selectedStore && (
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div className="card-header">
                    <div className="card-title">Commentaires magasin</div>
                    <button className={`btn btn-sm ${showStoreComments ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setShowStoreComments(value => !value)}>
                      {showStoreComments ? 'Masquer' : `Voir ${selectedStore.comments.length}`}
                    </button>
                  </div>
                  {showStoreComments && (
                    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 520, overflowY: 'auto' }}>
                      {selectedStore.comments.map(comment => (
                        <div key={comment.review_id} style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', background: 'var(--surface)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{comment.review_date_original || (comment.date ? new Date(comment.date).toLocaleDateString('fr-FR') : '—')}</span>
                            <SentimentBadge value={comment.sentiment} />
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.55 }}>{comment.text}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {selectedRow && selectedRow.platform !== 'Google Reviews' && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-header">
                <div className="card-title">Détail de la donnée</div>
                <button className="btn btn-sm btn-ghost" onClick={() => setSelectedRow(null)}>Fermer</button>
              </div>
              <div style={{ padding: 16, display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <PlatformBadge value={selectedRow.platform} />
                  <SentimentBadge value={selectedRow.sentiment} />
                  {selectedRow.category && <span className="badge badge-blue">{selectedRow.category}</span>}
                  {selectedRow.rating ? <RatingStars value={selectedRow.rating} /> : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Pas de note</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {selectedRow.date ? new Date(selectedRow.date).toLocaleString('fr-FR') : 'Date inconnue'}
                  {selectedRow.brand ? ` • ${selectedRow.brand}` : ''}
                  {selectedRow.store_name ? ` • ${selectedRow.store_name}` : ''}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.65 }}>{selectedRow.text || 'Aucun texte'}</div>
                {selectedRow.source_url && (
                  <a href={selectedRow.source_url} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ width: 'fit-content' }}>
                    Ouvrir la source
                  </a>
                )}
              </div>
            </div>
          )}

          <ChartCard title="Classement magasins" icon="◎" meta="Google Reviews uniquement">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {storeInsights.stores.slice(0, 8).map(store => (
                  <button
                    key={store.storeKey}
                    type="button"
                    onClick={() => handleSelectStore(store.storeKey)}
                    className="btn btn-ghost"
                  style={{
                    justifyContent: 'space-between',
                    padding: 0,
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    borderColor: selectedStoreKey === store.storeKey ? 'var(--primary-mid)' : 'var(--border)'
                  }}
                >
                  <div style={{ width: '100%', padding: '12px 14px', textAlign: 'left', background: selectedStoreKey === store.storeKey ? 'var(--primary-light)' : 'var(--surface-alt)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{store.store}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{store.city}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                      <span>{store.total} avis</span>
                      <span style={{ color: store.negRate > 0.5 ? 'var(--negative)' : 'var(--text-muted)', fontWeight: 700 }}>{Math.round(store.negRate * 100)}% négatifs</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ChartCard>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header">
              <div className="card-title">◉ Données scrapées</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['all', 'negative', 'positive', 'neutral'].map(currentFilter => (
                  <button key={currentFilter} onClick={() => setFilter(currentFilter)} className={`btn btn-sm ${filter === currentFilter ? 'btn-primary' : 'btn-ghost'}`}>
                    {currentFilter === 'all' ? 'Tout' : currentFilter.charAt(0).toUpperCase() + currentFilter.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <DataTable columns={tableColumns} rows={filtered.slice(0, 50)} emptyMessage="Aucune donnée" onRowClick={handleSelectRow} rowKey="review_id" />
            {filtered.length > 50 && (
              <div style={{ padding: '10px 20px', fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border-light)' }}>
                Affichage 50/{filtered.length}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
