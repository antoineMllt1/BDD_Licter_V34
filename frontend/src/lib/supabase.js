import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ggmkprimqfgojdptakdh.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnbWtwcmltcWZnb2pkcHRha2RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5OTE3MjIsImV4cCI6MjA5MDU2NzcyMn0.IHsRmnZIatNHMWiZVxjReV7jMf01wXFLw9lrlmk1z40'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function withRetry(fn, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxRetries - 1) throw err
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
    }
  }
}

export async function fetchAll(table, select = '*', options = {}) {
  const { order = 'created_at', ascending = false, limit = 2000, filters = [] } = options

  return withRetry(async () => {
    let query = supabase.from(table).select(select, { count: 'exact' })
    filters.forEach(([col, op, val]) => { query = query.filter(col, op, val) })
    if (order) query = query.order(order, { ascending })
    if (limit) query = query.limit(limit)
    const { data, error, count } = await query
    if (error) throw error
    const rows = data || []
    return { data: rows, count, meta: { total: count, table } }
  })
}

export function selectColumns(table, columns) {
  return fetchAll(table, columns.join(', '))
}

export async function fetchFromTables(tables, options = {}) {
  const results = await Promise.allSettled(
    tables.map(table => fetchAll(table, options.select || '*', options).then(res => ({
      ...res,
      data: res.data.map(row => ({ ...row, _source: table }))
    })))
  )

  const merged = []
  const errors = {}

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      merged.push(...result.value.data)
    } else {
      errors[tables[i]] = result.reason?.message || String(result.reason)
    }
  })

  return { data: merged, errors }
}

export function deduplicateByField(rows, field = 'id') {
  const seen = new Set()
  return rows.filter(row => {
    const val = row[field]
    if (val == null || seen.has(val)) return false
    seen.add(val)
    return true
  })
}
