import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { GlobalFiltersBar } from '../lib/FilterContext.jsx'
import { useStrategicDashboardData } from '../lib/strategicData.js'
import ChartCard from '../components/ChartCard.jsx'
import DataTable from '../components/DataTable.jsx'
import { RatingStars } from '../components/StatusBadge.jsx'
import {
  EvidenceFeed,
  PriorityStack,
  SignalCard,
  StrategicHero,
  StrategicSection,
} from '../components/StrategicUI.jsx'

function markerColorFromRisk(riskScore) {
  if (riskScore >= 70) return '#F43F5E'
  if (riskScore >= 45) return '#F59E0B'
  return '#10B981'
}

function toneFromValue(value, highThreshold, mediumThreshold) {
  if (value >= highThreshold) return 'critical'
  if (value >= mediumThreshold) return 'warning'
  return 'neutral'
}

function getStoreLogoSrc(store) {
  const name = `${store?.store || ''}`.toLowerCase()
  if (store?.side === 'competitor' || name.includes('boulanger')) return '/boulanger_logo.png'
  if (name.includes('darty')) return '/darty_logo.png'
  return '/Fnac_logo.png'
}

function getStoreBrandLabel(store) {
  return store?.side === 'competitor' ? 'Boulanger' : 'Fnac Darty'
}

function escapeHtml(value) {
  return `${value ?? ''}`
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function createPopupHtml(store) {
  const score = store.side === 'competitor'
    ? `${store.avgRating !== null ? `${store.avgRating}/5` : 'n/a'} | ${store.reviewCount} avis`
    : `${store.riskScore}/100 | ${store.reviewCount} avis`

  return `
    <div class="store-popup">
      <div class="store-popup-head">
        <img src="${escapeHtml(getStoreLogoSrc(store))}" alt="${escapeHtml(getStoreBrandLabel(store))}" />
        <div>
          <div class="store-popup-title">${escapeHtml(store.store)}</div>
          <div class="store-popup-subtitle">${escapeHtml(store.city)}</div>
        </div>
      </div>
      <div class="store-popup-meta">${escapeHtml(score)}</div>
    </div>
  `
}

function createStoreMarkerIcon(store, selected) {
  const ring = store.side === 'competitor' ? '#F97316' : markerColorFromRisk(store.riskScore)
  const size = selected ? 46 : 38

  return L.divIcon({
    className: 'store-leaflet-icon-wrap',
    html: `
      <div class="store-leaflet-marker ${selected ? 'selected' : ''} ${store.side || 'brand'}" style="--marker-ring:${ring}; width:${size}px; height:${size}px;">
        <img src="${getStoreLogoSrc(store)}" alt="${getStoreBrandLabel(store)}" />
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}

function spreadMapPoints(points) {
  const grouped = new Map()

  points.forEach((point) => {
    const key = point.coordinates.map((value) => Number(value).toFixed(5)).join(':')
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(point)
  })

  return Array.from(grouped.values()).flatMap((group) => {
    if (group.length === 1) {
      return group.map((point) => ({
        ...point,
        displayCoordinates: point.coordinates,
        overlapCount: 1,
      }))
    }

    return group.map((point, index) => {
      const [longitude, latitude] = point.coordinates
      const angle = (Math.PI * 2 * index) / group.length
      const radiusMeters = Math.min(180 + (group.length * 35), 420)
      const latOffset = (radiusMeters / 111320) * Math.sin(angle)
      const lngOffset = (radiusMeters / (111320 * Math.max(Math.cos((latitude * Math.PI) / 180), 0.25))) * Math.cos(angle)

      return {
        ...point,
        displayCoordinates: [longitude + lngOffset, latitude + latOffset],
        overlapCount: group.length,
      }
    })
  })
}

function StoresLoading() {
  return (
    <div className="strategic-hero loading-wrap">
      <div className="spinner" />
      <div className="loading-text">Assemblage de la vue magasins...</div>
    </div>
  )
}

function LeafletStoreMap({ brandStores, competitorStores, mode, selectedStoreKey, onSelect }) {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const resizeObserverRef = useRef(null)

  const points = useMemo(() => {
    const brand = mode === 'competitor'
      ? []
      : brandStores
        .filter((store) => Array.isArray(store.coordinates))
        .map((store) => ({ ...store, side: 'brand', selectedKey: `brand:${store.storeKey}` }))

    const competitor = mode === 'brand'
      ? []
      : competitorStores
        .filter((store) => Array.isArray(store.coordinates))
        .map((store) => ({ ...store, side: 'competitor', selectedKey: `competitor:${store.storeKey}` }))

    return spreadMapPoints([...brand, ...competitor])
  }, [brandStores, competitorStores, mode])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: true,
    }).setView([46.4, 2.2], 5.5)

    L.control.zoom({ position: 'topright' }).addTo(map)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    const layer = L.layerGroup().addTo(map)
    mapRef.current = map
    layerRef.current = layer

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize(false)
    })
    resizeObserver.observe(mapContainerRef.current)
    resizeObserverRef.current = resizeObserver

    setTimeout(() => map.invalidateSize(false), 80)

    return () => {
      resizeObserverRef.current?.disconnect()
      layer.clearLayers()
      map.remove()
      mapRef.current = null
      layerRef.current = null
      resizeObserverRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return

    layer.clearLayers()

    if (!points.length) {
      map.setView([46.4, 2.2], 5.5)
      return
    }

    const latLngs = []

    points.forEach((store) => {
      const [longitude, latitude] = store.displayCoordinates || store.coordinates
      const latLng = [latitude, longitude]
      latLngs.push(latLng)
      const isSelected = selectedStoreKey === store.selectedKey

      const marker = L.marker(latLng, {
        icon: createStoreMarkerIcon(store, isSelected),
      })

      marker.bindPopup(createPopupHtml(store), { closeButton: false, offset: [0, -10] })
      marker.on('click', () => onSelect(store.selectedKey))
      if (isSelected) marker.openPopup()
      marker.addTo(layer)
    })

    const selectedPoint = points.find((store) => store.selectedKey === selectedStoreKey)

    if (selectedPoint) {
      const [longitude, latitude] = selectedPoint.displayCoordinates || selectedPoint.coordinates
      map.flyTo([latitude, longitude], 11, { duration: 0.8 })
    } else if (latLngs.length === 1) {
      map.setView(latLngs[0], 10)
    } else {
      map.fitBounds(latLngs, { padding: [36, 36], maxZoom: 9 })
    }

    requestAnimationFrame(() => map.invalidateSize(false))
  }, [points, selectedStoreKey, onSelect])

  if (!points.length) {
    return <div className="evidence-empty">Aucun magasin Google Reviews geolocalise sur la periode selectionnee.</div>
  }

  return (
    <div className="store-map-shell">
      <div ref={mapContainerRef} className="store-map-canvas" />
      <div className="store-map-legend">
        <span><i style={{ background: '#10B981' }} /> stable</span>
        <span><i style={{ background: '#F59E0B' }} /> sous tension</span>
        <span><i style={{ background: '#F43F5E' }} /> a rattraper</span>
        {mode !== 'brand' && <span><i className="legend-competitor-dot" /> Boulanger</span>}
      </div>
    </div>
  )
}

function StoreMapSelector({ stores, selectedStoreKey, onSelect }) {
  const displayLimit = 6
  const [expanded, setExpanded] = useState(false)

  const orderedStores = useMemo(() => (
    stores.slice().sort((left, right) => {
      if (left.selectedKey === selectedStoreKey) return -1
      if (right.selectedKey === selectedStoreKey) return 1
      return left.city.localeCompare(right.city) || left.store.localeCompare(right.store)
    })
  ), [stores, selectedStoreKey])

  const visibleStores = expanded ? orderedStores : orderedStores.slice(0, displayLimit)
  const hiddenCount = Math.max(0, orderedStores.length - displayLimit)

  if (!stores.length) return null

  return (
    <div className="store-map-selector">
      <div className="store-map-selector-head">
        <div>
          <div className="editorial-label">Acces direct</div>
          <div className="store-map-selector-title">Magasins visibles sur la carte.</div>
          <div className="store-map-selector-note">Cliquez pour centrer la carte et ouvrir la fiche.</div>
        </div>
        <span className="badge badge-primary">{stores.length} visibles</span>
      </div>

      <div className="store-map-selector-list">
        {visibleStores.map((store) => (
          <button
            key={store.selectedKey}
            type="button"
            className={`store-mini-chip ${selectedStoreKey === store.selectedKey ? 'active' : ''}`}
            onClick={() => onSelect(store.selectedKey)}
          >
            <img src={getStoreLogoSrc(store)} alt={getStoreBrandLabel(store)} />
            <span className="store-mini-chip-copy">
              <strong>{store.store}</strong>
              <span>{store.city} | {store.reviewCount} avis | {store.avgRating !== null ? `${store.avgRating}/5` : 'n/a'}</span>
            </span>
          </button>
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          type="button"
          className="btn btn-ghost btn-sm store-map-selector-toggle"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Voir moins' : `Voir plus (${hiddenCount})`}
        </button>
      )}
    </div>
  )
}

function StoreDetailPanel({ store, cityBenchmark }) {
  if (!store) {
    return (
        <div className="battle-pocket-card">
          <div className="battle-pocket-title">Fiche magasin</div>
          <div className="evidence-empty">
            Selectionnez un magasin pour voir son risque, son irritant dominant et l action recommandee.
          </div>
        </div>
    )
  }

  return (
    <div className="store-detail-card">
      <div className="store-detail-head">
        <div>
          <div className="store-detail-brand">
            <img src={getStoreLogoSrc(store)} alt={getStoreBrandLabel(store)} />
            <span>{getStoreBrandLabel(store)}</span>
          </div>
          <div className="store-detail-title">{store.store}</div>
          <div className="store-detail-subtitle">{store.city}</div>
          {store.address && <div className="store-detail-address">{store.address}</div>}
        </div>
        <span className={`badge ${store.riskScore >= 70 ? 'badge-critical' : store.riskScore >= 45 ? 'badge-orange' : 'badge-positive'}`}>
          risque {store.riskScore}/100
        </span>
      </div>

      <div className="store-detail-metrics">
        <div className="store-detail-metric">
          <span>Avis</span>
          <strong>{store.reviewCount}</strong>
        </div>
        <div className="store-detail-metric">
          <span>Negative rate</span>
          <strong>{store.negRate}%</strong>
        </div>
        <div className="store-detail-metric">
          <span>Note moyenne</span>
          <strong>{store.avgRating !== null ? `${store.avgRating}/5` : 'n/a'}</strong>
        </div>
        <div className="store-detail-metric">
          <span>Backlog</span>
          <strong>{store.negativeBacklog}</strong>
        </div>
      </div>

      <div className="store-detail-issue">
        <div className="editorial-label">Irritant dominant</div>
        <div className="store-detail-issue-text">{store.topIssue}</div>
      </div>

      <div className="store-detail-activation">
        <div className="editorial-label">Activation recommandee</div>
        {store.activation ? (
          <>
            <div className="store-detail-activation-label">{store.activation.label}</div>
            <div className="store-detail-activation-meta">
              <span>{store.activation.owner}</span>
              <span>{store.activation.impact}</span>
            </div>
          </>
        ) : (
          <>
            <div className="store-detail-activation-label">Lecture benchmark locale</div>
            <div className="store-detail-activation-meta">
              <span>Boulanger</span>
              <span>point de comparaison concurrent</span>
            </div>
          </>
        )}
      </div>

      {cityBenchmark && cityBenchmark.brandStores > 0 && cityBenchmark.competitorStores > 0 && (
        <div className="store-detail-issue">
          <div className="editorial-label">Benchmark de ville</div>
          <div className="store-detail-issue-text">
            Fnac Darty {cityBenchmark.brandRating || 'n/a'}/5 vs Boulanger {cityBenchmark.competitorRating || 'n/a'}/5
          </div>
        </div>
      )}

      <EvidenceFeed title="Preuves locales" items={store.evidence} emptyMessage="Pas de verbatim exploitable pour ce magasin." />
    </div>
  )
}

export default function Stores() {
  const { loading, error, storeModel, storeModelAllTime } = useStrategicDashboardData()
  const [selectedStoreKey, setSelectedStoreKey] = useState(null)
  const [mapMode, setMapMode] = useState('brand')
  const [coverageScope, setCoverageScope] = useState('all')
  const [localSearch, setLocalSearch] = useState('')
  const [cityFilter, setCityFilter] = useState('all')
  const [riskFilter, setRiskFilter] = useState('all')

  const activeStoreModel = coverageScope === 'all' ? storeModelAllTime : storeModel

  const cityOptions = useMemo(
    () => [...new Set(activeStoreModel?.stores?.map((store) => store.city).filter(Boolean) || [])].sort((left, right) => left.localeCompare(right)),
    [activeStoreModel]
  )

  const visibleStores = useMemo(() => {
    const query = localSearch.trim().toLowerCase()
    return (activeStoreModel?.stores || []).filter((store) => {
      if (cityFilter !== 'all' && store.city !== cityFilter) return false
      if (riskFilter === 'critical' && store.riskScore < 70) return false
      if (riskFilter === 'warning' && (store.riskScore < 45 || store.riskScore >= 70)) return false
      if (riskFilter === 'stable' && store.riskScore >= 45) return false
      if (query) {
        const haystack = `${store.store} ${store.city} ${store.topIssue}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [activeStoreModel, localSearch, cityFilter, riskFilter])

  const visibleCompetitorStores = useMemo(() => {
    const query = localSearch.trim().toLowerCase()
    return (activeStoreModel?.competitorNetwork?.stores || []).filter((store) => {
      if (cityFilter !== 'all' && store.city !== cityFilter) return false
      if (query) {
        const haystack = `${store.store} ${store.city} ${store.topIssue}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [activeStoreModel, localSearch, cityFilter])

  const visibleCityHotspots = useMemo(() => {
    const grouped = {}
    visibleStores.forEach((store) => {
      if (!grouped[store.city]) grouped[store.city] = { city: store.city, stores: 0, reviews: 0, avgRisk: 0, negativeRate: 0 }
      grouped[store.city].stores += 1
      grouped[store.city].reviews += store.reviewCount
      grouped[store.city].avgRisk += store.riskScore
      grouped[store.city].negativeRate += store.negRate
    })

    return Object.values(grouped)
      .map((city) => ({
        ...city,
        avgRisk: Math.round(city.avgRisk / city.stores),
        negativeRate: Math.round(city.negativeRate / city.stores),
      }))
      .sort((left, right) => right.avgRisk - left.avgRisk || right.reviews - left.reviews)
  }, [visibleStores])

  const visibleActivations = useMemo(() => {
    const visibleIds = new Set(visibleStores.map((store) => store.id))
    return (activeStoreModel?.activations || []).filter((item) => visibleIds.has(item.id.replace(/^store-/, '')))
  }, [activeStoreModel, visibleStores])

  const visibleCityComparison = useMemo(() => {
    const query = localSearch.trim().toLowerCase()
    return (activeStoreModel?.cityComparison || []).filter((city) => {
      if (cityFilter !== 'all' && city.city !== cityFilter) return false
      if (query && !city.city.toLowerCase().includes(query)) return false
      return true
    })
  }, [activeStoreModel, cityFilter, localSearch])

  const visibleSummary = useMemo(() => {
    const rated = visibleStores.filter((store) => store.avgRating !== null)
    const totalReviews = visibleStores.reduce((sum, store) => sum + store.reviewCount, 0)
    return {
      coveredStores: visibleStores.length,
      mappedStores: visibleStores.filter((store) => Array.isArray(store.coordinates)).length,
      coveredCities: new Set(visibleStores.map((store) => store.city)).size,
      networkRating: rated.length
        ? Number((rated.reduce((sum, store) => sum + store.avgRating, 0) / rated.length).toFixed(1))
        : null,
      networkNegativeRate: totalReviews
        ? Math.round((visibleStores.reduce((sum, store) => sum + store.negative, 0) / totalReviews) * 100)
        : 0,
      atRiskStores: visibleStores.filter((store) => store.riskScore >= 55).length,
      backlog: visibleStores.reduce((sum, store) => sum + store.negativeBacklog, 0),
      totalReviews,
    }
  }, [visibleStores])

  const competitorVisibleSummary = useMemo(() => {
    const rated = visibleCompetitorStores.filter((store) => store.avgRating !== null)
    return {
      coveredStores: visibleCompetitorStores.length,
      networkRating: rated.length
        ? Number((rated.reduce((sum, store) => sum + store.avgRating, 0) / rated.length).toFixed(1))
        : null,
    }
  }, [visibleCompetitorStores])

  useEffect(() => {
    if (!visibleStores.length) {
      setSelectedStoreKey(null)
      return
    }

    const [, currentKey] = selectedStoreKey?.includes(':') ? selectedStoreKey.split(':') : ['brand', selectedStoreKey]
    const stillVisible = currentKey && (
      visibleStores.some((store) => store.storeKey === currentKey)
      || visibleCompetitorStores.some((store) => store.storeKey === currentKey)
    )

    if (stillVisible) return
    setSelectedStoreKey(`brand:${visibleStores[0].storeKey}`)
  }, [visibleStores, visibleCompetitorStores, selectedStoreKey])

  const selectedStore = useMemo(() => {
    if (!selectedStoreKey) return null
    const [side, key] = selectedStoreKey.includes(':') ? selectedStoreKey.split(':') : ['brand', selectedStoreKey]
    const source = side === 'competitor' ? visibleCompetitorStores : visibleStores
    return source.find((store) => store.storeKey === key) || null
  }, [selectedStoreKey, visibleStores, visibleCompetitorStores])

  const selectedStoreBenchmark = useMemo(
    () => (selectedStore ? (activeStoreModel?.cityComparison || []).find((entry) => entry.city === selectedStore.city) || null : null),
    [selectedStore, activeStoreModel]
  )

  if (loading) return <StoresLoading />

  if (error) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div className="empty-text">Impossible de charger la vue magasins</div>
        <div className="empty-sub">{error}</div>
      </div>
    )
  }

  const summary = activeStoreModel.summary
  const allTimeSummary = storeModelAllTime.summary
  const windowSummary = storeModel.summary
  const riskRanking = visibleStores.slice(0, 8).map((store) => ({
    name: store.store.length > 24 ? `${store.store.slice(0, 24)}...` : store.store,
    risk: store.riskScore,
  }))
  const cityHotspots = visibleCityHotspots.slice(0, 8).map((city) => ({
    name: city.city,
    avgRisk: city.avgRisk,
  }))
  const cityComparisonChart = visibleCityComparison
    .filter((city) => city.brandStores > 0 && city.competitorStores > 0)
    .slice(0, 8)
    .map((city) => ({ name: city.city, delta: city.delta }))
  const visibleOverlapCities = visibleCityComparison.filter((city) => city.brandStores > 0 && city.competitorStores > 0)
  const mapSelectableStores = [
    ...(mapMode === 'competitor'
      ? []
      : visibleStores.map((store) => ({ ...store, side: 'brand', selectedKey: `brand:${store.storeKey}` }))),
    ...(mapMode === 'brand'
      ? []
      : visibleCompetitorStores.map((store) => ({ ...store, side: 'competitor', selectedKey: `competitor:${store.storeKey}` }))),
  ].sort((left, right) => left.city.localeCompare(right.city) || left.store.localeCompare(right.store))
  const defendCities = visibleCityComparison.filter((city) => city.leader === 'competitor' && city.brandStores > 0 && city.competitorStores > 0).slice(0, 5)
  const leadCities = visibleCityComparison.filter((city) => city.leader === 'brand' && city.brandStores > 0 && city.competitorStores > 0).slice(0, 5)

  const tableColumns = [
    {
      key: 'store',
      label: 'Magasin',
      render: (value, row) => (
        <div className="store-table-title">
          <img src={getStoreLogoSrc(row)} alt={getStoreBrandLabel(row)} />
          <span>{value}</span>
        </div>
      ),
    },
    { key: 'city', label: 'Ville' },
    { key: 'avgRating', label: 'Note', render: (value) => <RatingStars value={value} /> },
    { key: 'reviewCount', label: 'Avis' },
    { key: 'negRate', label: 'Negatif', render: (value) => `${value}%` },
    { key: 'riskScore', label: 'Risque', render: (value) => <span className={`badge ${value >= 70 ? 'badge-critical' : value >= 45 ? 'badge-orange' : 'badge-positive'}`}>{value}/100</span> },
    { key: 'topIssue', label: 'Top issue', truncate: true },
  ]

  return (
    <div>
      <StrategicHero
        eyebrow="Pilotage magasins"
        title="Voir ou le reseau decroche, ville par ville."
        summary={
          summary.highestRisk
            ? `${summary.highestRisk.store} ressort comme point de tension prioritaire. Supabase contient ${allTimeSummary.coveredStores} magasins Google Reviews au total, dont ${windowSummary.coveredStores} seulement dans la fenetre active des filtres globaux.`
            : `Supabase contient ${allTimeSummary.coveredStores} magasins Google Reviews au total, mais la fenetre active n en remonte que ${windowSummary.coveredStores}.`
        }
        whyItMatters="Les irritants ne sont pas uniformes. Certains magasins tirent le reseau vers le bas, d autres peuvent servir de reference."
        whatNow={
          summary.highestRisk
            ? `Priorite immediate: lancer ${summary.highestRisk.activation.label.toLowerCase()} et absorber ${summary.reviewBacklog} avis negatifs sans reponse a l echelle du reseau.`
            : 'Priorite immediate: densifier la couverture Google Reviews sur les points de vente.'
        }
        actions={[
          { label: 'Voir les clients', to: '/voix-du-client' },
          { label: 'Voir les actions', to: '/action-center', kind: 'secondary' },
          { label: 'Lancer la collecte', to: '/scraping', kind: 'ghost' },
        ]}
        stats={[
          { label: 'Magasins couverts', value: visibleSummary.coveredStores.toLocaleString('fr-FR'), sub: `${visibleSummary.coveredCities} villes | ${visibleSummary.mappedStores} geolocalises` },
          { label: 'Note reseau', value: visibleSummary.networkRating !== null ? `${visibleSummary.networkRating}/5` : 'n/a', sub: `${visibleSummary.totalReviews} avis Google Reviews` },
          { label: 'Magasins a risque', value: visibleSummary.atRiskStores.toLocaleString('fr-FR'), sub: 'points de vente a rattraper' },
          { label: 'Backlog local', value: visibleSummary.backlog.toLocaleString('fr-FR'), sub: `${allTimeSummary.coveredStores} magasins en base | ${windowSummary.coveredStores} en fenetre active` },
        ]}
      />

      <GlobalFiltersBar />

      <div className="filters-bar filters-bar-local">
        <span className="filter-label">Magasins</span>
        <input
          className="form-input store-local-search"
          placeholder="Rechercher un magasin, une ville ou un top issue"
          value={localSearch}
          onChange={(event) => setLocalSearch(event.target.value)}
        />

        <div className="filter-chip">
          <select value={coverageScope} onChange={(event) => setCoverageScope(event.target.value)}>
            <option value="all">Historique complet</option>
            <option value="filtered">Fenetre active</option>
          </select>
        </div>

        <div className="filter-chip">
          <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
            <option value="all">Toutes les villes</option>
            {cityOptions.map((city) => <option key={city} value={city}>{city}</option>)}
          </select>
        </div>

        <div className="filter-chip">
          <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
            <option value="all">Tous les risques</option>
            <option value="critical">A rattraper</option>
            <option value="warning">Sous tension</option>
            <option value="stable">Stables</option>
          </select>
        </div>

        <div className="filter-chip">
          <select value={mapMode} onChange={(event) => setMapMode(event.target.value)}>
            <option value="brand">Carte Fnac Darty</option>
            <option value="both">Carte comparee</option>
            <option value="competitor">Carte Boulanger</option>
          </select>
        </div>
      </div>

      <StrategicSection
        title="Reseau Google Reviews"
        subtitle="Couverture, hotspots, backlog, magasins a traiter."
      >
        <div className="editorial-card" style={{ marginBottom: 18 }}>
          <div className="editorial-label">Lecture Supabase</div>
          <div className="editorial-text">
            {`Base complete: ${allTimeSummary.coveredStores} magasins geolocalises. `}
            {`Fenetre active: ${windowSummary.coveredStores} magasins visibles.`}
          </div>
        </div>

        <div className="signal-grid" style={{ marginBottom: 18 }}>
          <SignalCard label="Source active" value="Google Reviews" note={`scope: ${coverageScope === 'all' ? 'historique complet' : 'fenetre active'}`} tone="neutral" />
          <SignalCard label="Magasins en base" value={allTimeSummary.coveredStores} note="stores Google Reviews presents dans Supabase" tone="neutral" />
          <SignalCard label="Magasins fenetre active" value={windowSummary.coveredStores} note="stores visibles avec les filtres globaux" tone="neutral" />
          <SignalCard label="Negative rate reseau" value={`${visibleSummary.networkNegativeRate}%`} note="part negative sur le reseau visible" tone={toneFromValue(visibleSummary.networkNegativeRate, 40, 25)} />
          <SignalCard label="Magasins a rattraper" value={visibleSummary.atRiskStores} note="score de risque >= 55" tone={toneFromValue(visibleSummary.atRiskStores, 6, 3)} />
          <SignalCard label="Magasins vitrines" value={activeStoreModel.championStores.filter((store) => cityFilter === 'all' || store.city === cityFilter).length} note="notes elevees et faible pression negative" tone="neutral" />
        </div>

        <div className="strategic-grid-2">
          <ChartCard title="Carte reseau magasins" icon="MAP" meta={`${visibleSummary.mappedStores} points geolocalises | ${coverageScope === 'all' ? 'historique complet' : 'fenetre active'}`}>
            <div className="store-map-stack">
              <LeafletStoreMap
                brandStores={visibleStores}
                competitorStores={visibleCompetitorStores}
                mode={mapMode}
                selectedStoreKey={selectedStoreKey}
                onSelect={(storeKey) => setSelectedStoreKey((current) => (current === storeKey ? null : storeKey))}
              />
              <StoreMapSelector
                stores={mapSelectableStores}
                selectedStoreKey={selectedStoreKey}
                onSelect={setSelectedStoreKey}
              />
            </div>
          </ChartCard>

          <StoreDetailPanel store={selectedStore} cityBenchmark={selectedStoreBenchmark} />
        </div>
      </StrategicSection>

      <StrategicSection
        title="Benchmark local Fnac Darty vs Boulanger"
        subtitle="Ou defendre et ou accelerer, ville par ville."
      >
        <div className="signal-grid" style={{ marginBottom: 18 }}>
          <SignalCard label="Villes comparables" value={visibleOverlapCities.length} note="presence marque et concurrent" tone="neutral" />
          <SignalCard label="Note reseau Fnac Darty" value={visibleSummary.networkRating !== null ? `${visibleSummary.networkRating}/5` : 'n/a'} note={`${visibleSummary.coveredStores} points visibles`} tone="neutral" />
          <SignalCard label="Note reseau Boulanger" value={competitorVisibleSummary.networkRating !== null ? `${competitorVisibleSummary.networkRating}/5` : 'n/a'} note={`${competitorVisibleSummary.coveredStores} points visibles`} tone="neutral" />
          <SignalCard label="Ville a reprendre" value={defendCities[0]?.city || 'n/a'} note={defendCities[0] ? `${defendCities[0].delta} pts de delta local` : 'pas de ville clairement en retard'} tone={defendCities[0] ? 'warning' : 'neutral'} />
        </div>

        <div className="strategic-grid-2">
          <ChartCard title="Delta local par ville" icon="CITY" meta="positif = avantage Fnac Darty">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={cityComparisonChart} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="delta" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <div className="battle-pocket-grid">
            <div className="battle-pocket-card">
              <div className="battle-pocket-title">Villes a defendre</div>
              <div className="battle-pocket-list">
                {defendCities.map((city) => (
                  <div key={city.city} className="battle-pocket-item">
                    <strong>{city.city}</strong>
                    <span>Fnac Darty {city.brandRating || 'n/a'}/5 vs Boulanger {city.competitorRating || 'n/a'}/5</span>
                  </div>
                ))}
                {defendCities.length === 0 && <div className="evidence-empty">Aucune ville nettement perdue dans le benchmark local.</div>}
              </div>
            </div>

            <div className="battle-pocket-card">
              <div className="battle-pocket-title">Villes en avance</div>
              <div className="battle-pocket-list">
                {leadCities.map((city) => (
                  <div key={city.city} className="battle-pocket-item">
                    <strong>{city.city}</strong>
                    <span>Fnac Darty {city.brandRating || 'n/a'}/5 vs Boulanger {city.competitorRating || 'n/a'}/5</span>
                  </div>
                ))}
                {leadCities.length === 0 && <div className="evidence-empty">Aucune ville clairement en avance sur la periode.</div>}
              </div>
            </div>
          </div>
        </div>
      </StrategicSection>

      <StrategicSection
        title="KPI locaux et hotspots"
        subtitle="Les magasins a redresser et les villes les plus exposees."
      >
        <div className="strategic-grid-2">
          <ChartCard title="Classement risque magasin" icon="RISK" meta="top 8">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={riskRanking} layout="vertical" barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="risk" fill="#F43F5E" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Hotspots par ville" icon="CITY" meta="risque moyen local">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={cityHotspots} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="avgRisk" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </StrategicSection>

      <StrategicSection
        title="Activations recommandees"
        subtitle="Les actions locales a lancer et les points de vente a copier."
        actions={<Link to="/action-center" className="btn btn-ghost btn-sm">Envoyer aux actions</Link>}
      >
        <div className="strategic-grid-2">
          <PriorityStack items={visibleActivations} emptyMessage="Aucune activation magasin sur la periode." />
          <div className="battle-pocket-card">
              <div className="battle-pocket-title">Magasins vitrines a repliquer</div>
              <div className="battle-pocket-list">
                {activeStoreModel.championStores
                  .filter((store) => cityFilter === 'all' || store.city === cityFilter)
                  .slice(0, 5)
                  .map((store) => (
                  <div key={store.id} className="battle-pocket-item store-pocket-item">
                    <div className="store-pocket-head">
                      <img src={getStoreLogoSrc(store)} alt={getStoreBrandLabel(store)} />
                      <strong>{store.store}</strong>
                    </div>
                    <span>{store.city} | {store.avgRating}/5 | {store.reviewCount} avis</span>
                  </div>
                ))}
              {activeStoreModel.championStores.length === 0 && <div className="evidence-empty">Pas encore de magasin vitrine clairement etabli sur la periode.</div>}
            </div>
          </div>
        </div>
      </StrategicSection>

      <StrategicSection
        title="Classement magasins"
        subtitle="Comparer vite et ouvrir la fiche locale."
      >
        <div className="card">
          <DataTable
            columns={tableColumns}
            rows={visibleStores.slice(0, 20)}
            rowKey="id"
            onRowClick={(row) => setSelectedStoreKey(`brand:${row.storeKey}`)}
            emptyMessage="Aucun magasin visible sur la periode selectionnee."
          />
        </div>
      </StrategicSection>
    </div>
  )
}
