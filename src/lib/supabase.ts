import { createClient } from '@supabase/supabase-js'

// Robust environment variable handling with guaranteed fallbacks
const SUPABASE_URL = 'https://jfgeroddcxmnwsjpnllk.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmZ2Vyb2RkY3htbndzanBubGxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMDcwMjYsImV4cCI6MjA2ODg4MzAyNn0.rxx9aHXFLxN4m-EJPEdFV27qBKsVCGjSR0T0F_CEBrg'

// Try to get environment variables, but always fall back to hardcoded values
let supabaseUrl: string
let supabaseAnonKey: string

try {
  supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || SUPABASE_URL
  supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || SUPABASE_ANON_KEY
} catch (error) {
  // If there's any issue accessing import.meta.env, use hardcoded values
  console.warn('Using fallback Supabase configuration:', error)
  supabaseUrl = SUPABASE_URL
  supabaseAnonKey = SUPABASE_ANON_KEY
}

// Validate that we have the required values
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase configuration error - using defaults')
  supabaseUrl = SUPABASE_URL
  supabaseAnonKey = SUPABASE_ANON_KEY
}

console.log('Supabase initialized:', {
  url: supabaseUrl,
  hasKey: !!supabaseAnonKey,
  keyLength: supabaseAnonKey?.length || 0
})

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export interface ServerHealthCheck {
  id: string
  timestamp: string
  status: 'up' | 'down' | 'degraded'
  response_time_ms: number | null
  http_status_code: number | null
  error_message: string | null
  created_at: string
}

export interface DeviceActivitySnapshot {
  id: string
  timestamp: string
  total_devices: number
  active_devices: number
  inactive_devices: number
  activity_summary: any
  created_at: string
}

export interface ServerPerformanceMetric {
  id: string
  timestamp: string
  endpoint: string
  response_time_ms: number | null
  success_rate: number | null
  performance_score: number | null
  created_at: string
}

export interface MonitoringAlert {
  id: string
  alert_type: 'server_down' | 'performance_degraded' | 'device_offline'
  severity: 'critical' | 'high' | 'medium' | 'low'
  message: string
  acknowledged: boolean
  acknowledged_by: string | null
  acknowledged_at: string | null
  resolved: boolean
  created_at: string
}