import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ggmkprimqfgojdptakdh.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdnbWtwcmltcWZnb2pkcHRha2RoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5OTE3MjIsImV4cCI6MjA5MDU2NzcyMn0.IHsRmnZIatNHMWiZVxjReV7jMf01wXFLw9lrlmk1z40'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export async function fetchAll(table, select = '*', options = {}) {
  const { order = 'created_at', ascending = false, limit = 2000, filters = [] } = options
  let query = supabase.from(table).select(select, { count: 'exact' })
  filters.forEach(([col, op, val]) => { query = query.filter(col, op, val) })
  if (order) query = query.order(order, { ascending })
  if (limit) query = query.limit(limit)
  const { data, error, count } = await query
  if (error) throw error
  return { data: data || [], count }
}
