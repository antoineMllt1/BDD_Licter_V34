export function normalizeSentiment(value) {
  if (!value) return null
  const normalized = String(value).trim().toLowerCase()
  if (normalized === 'positive') return 'Positive'
  if (normalized === 'negative') return 'Negative'
  if (normalized === 'neutral') return 'Neutral'
  return null
}

export function buildUnifiedReputationDataset(rep = [], bench = [], cx = []) {
  const benchmarkBrandRows = bench.filter(
    row => row.entity_analyzed === 'Fnac Darty' || row.target_brand_vs_competitor === 'Brand'
  )

  return [
    ...rep.map(row => ({
      ...row,
      source_table: 'reputation_crise',
      sentiment: normalizeSentiment(row.sentiment)
    })),
    ...benchmarkBrandRows.map(row => ({
      ...row,
      source_table: 'benchmark_marche',
      brand: row.entity_analyzed || 'Fnac Darty',
      post_type: row.topic || 'Benchmark',
      sentiment: normalizeSentiment(row.sentiment_detected),
      likes: row.likes || 0,
      share_count: row.share_count || 0
    })),
    ...cx.map(row => ({
      ...row,
      source_table: 'voix_client_cx',
      brand: row.brand || 'Fnac Darty',
      post_type: row.category || 'Avis client',
      sentiment: normalizeSentiment(row.sentiment),
      likes: row.likes || 0,
      share_count: row.share_count || 0
    }))
  ].filter(row => row.sentiment)
}
