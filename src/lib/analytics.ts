import { supabase } from './supabase'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'

export interface AnalyticsFilters {
  dateRange?: {
    start: Date
    end: Date
  }
  imeis?: string[]
  severityLevels?: string[]
  exceptionTypes?: string[]
  ignitionStatus?: 'on' | 'off' | 'all'
  searchQuery?: string
  sortBy?: {
    field: string
    direction: 'asc' | 'desc'
    secondary?: {
      field: string
      direction: 'asc' | 'desc'
    }
  }
}

export interface DeviceAnalytics {
  imei: string
  healthScore: number
  totalExceptions: number
  criticalExceptions: number
  lastActivity: Date | null
  ignitionEvents: number
  avgResponseTime: number
  uptimePercentage: number
  exceptionTrends: Array<{
    date: string
    count: number
    severity: string
  }>
  ignitionPatterns: Array<{
    date: string
    onEvents: number
    offEvents: number
  }>
}

export interface FleetAnalytics {
  totalDevices: number
  healthyDevices: number
  warningDevices: number
  criticalDevices: number
  totalExceptions: number
  avgHealthScore: number
  deviceHealthDistribution: Array<{
    range: string
    count: number
  }>
  activityTimeline: Array<{
    date: string
    activeDevices: number
    exceptions: number
  }>
}

export class AnalyticsService {
  // Advanced filtering for exception logs
  static async filterExceptionLogs(filters: AnalyticsFilters) {
    let query = supabase
      .from('correlation_logs')
      .select('*')
      .order('created_at', { ascending: false })

    // Date range filter
    if (filters.dateRange) {
      query = query
        .gte('created_at', filters.dateRange.start.toISOString())
        .lte('created_at', filters.dateRange.end.toISOString())
    }

    // IMEI filter
    if (filters.imeis && filters.imeis.length > 0) {
      query = query.in('imei', filters.imeis)
    }

    // Search query filter
    if (filters.searchQuery) {
      query = query.or(`exception_type.ilike.%${filters.searchQuery}%,correlation_result.ilike.%${filters.searchQuery}%,imei.ilike.%${filters.searchQuery}%`)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error filtering exception logs:', error)
      return []
    }

    let filteredData = data || []

    // Client-side filtering for complex criteria
    if (filters.severityLevels && filters.severityLevels.length > 0) {
      filteredData = filteredData.filter(log => {
        const severity = this.getSeverityFromExceptionType(log.exception_type)
        return filters.severityLevels!.includes(severity)
      })
    }

    if (filters.exceptionTypes && filters.exceptionTypes.length > 0) {
      filteredData = filteredData.filter(log => 
        filters.exceptionTypes!.includes(log.exception_type || 'unknown')
      )
    }

    // Apply sorting
    if (filters.sortBy) {
      filteredData = this.applySorting(filteredData, filters.sortBy)
    }

    return filteredData
  }

  // Advanced filtering for ignition logs
  static async filterIgnitionLogs(filters: AnalyticsFilters) {
    // This would integrate with Firebase ignition logs
    // For now, return mock data structure
    return []
  }

  // Get device-level analytics
  static async getDeviceAnalytics(imei: string): Promise<DeviceAnalytics> {
    // Get device inventory data
    const { data: deviceData } = await supabase
      .from('device_inventory')
      .select('*')
      .eq('imei', imei)
      .single()

    // Get correlation logs for this device
    const { data: correlationLogs } = await supabase
      .from('correlation_logs')
      .select('*')
      .eq('imei', imei)
      .order('created_at', { ascending: false })

    // Calculate analytics
    const totalExceptions = correlationLogs?.length || 0
    const criticalExceptions = correlationLogs?.filter(log => 
      this.getSeverityFromExceptionType(log.exception_type) === 'critical'
    ).length || 0

    const healthScore = deviceData?.health_score || 50
    const lastActivity = deviceData?.last_seen ? new Date(deviceData.last_seen) : null

    // Generate trends data (last 7 days)
    const exceptionTrends = this.generateExceptionTrends(correlationLogs || [])
    const ignitionPatterns = this.generateIgnitionPatterns(imei)

    return {
      imei,
      healthScore,
      totalExceptions,
      criticalExceptions,
      lastActivity,
      ignitionEvents: 0, // Would be calculated from Firebase ignition logs
      avgResponseTime: 0, // Would be calculated from API response times
      uptimePercentage: Math.max(0, Math.min(100, healthScore * 2)), // Rough calculation
      exceptionTrends,
      ignitionPatterns
    }
  }

  // Get fleet-wide analytics
  static async getFleetAnalytics(): Promise<FleetAnalytics> {
    // Get all devices
    const { data: devices } = await supabase
      .from('device_inventory')
      .select('*')

    // Get all correlation logs
    const { data: correlationLogs } = await supabase
      .from('correlation_logs')
      .select('*')
      .order('created_at', { ascending: false })

    const totalDevices = devices?.length || 0
    const totalExceptions = correlationLogs?.length || 0

    // Calculate health distribution
    const healthyDevices = devices?.filter(d => d.health_score >= 70).length || 0
    const warningDevices = devices?.filter(d => d.health_score >= 40 && d.health_score < 70).length || 0
    const criticalDevices = devices?.filter(d => d.health_score < 40).length || 0

    const avgHealthScore = devices?.reduce((sum, d) => sum + d.health_score, 0) / totalDevices || 0

    // Generate distribution data
    const deviceHealthDistribution = [
      { range: '90-100%', count: devices?.filter(d => d.health_score >= 90).length || 0 },
      { range: '70-89%', count: devices?.filter(d => d.health_score >= 70 && d.health_score < 90).length || 0 },
      { range: '50-69%', count: devices?.filter(d => d.health_score >= 50 && d.health_score < 70).length || 0 },
      { range: '30-49%', count: devices?.filter(d => d.health_score >= 30 && d.health_score < 50).length || 0 },
      { range: '0-29%', count: devices?.filter(d => d.health_score < 30).length || 0 }
    ]

    // Generate activity timeline (last 7 days)
    const activityTimeline = this.generateActivityTimeline(devices || [], correlationLogs || [])

    return {
      totalDevices,
      healthyDevices,
      warningDevices,
      criticalDevices,
      totalExceptions,
      avgHealthScore,
      deviceHealthDistribution,
      activityTimeline
    }
  }

  // Helper methods
  private static getSeverityFromExceptionType(exceptionType: string | null): string {
    if (!exceptionType) return 'unknown'
    
    const type = exceptionType.toLowerCase()
    if (type.includes('critical') || type.includes('server down') || type.includes('offline')) {
      return 'critical'
    } else if (type.includes('warning') || type.includes('degraded') || type.includes('retry')) {
      return 'warning'
    } else {
      return 'info'
    }
  }

  private static applySorting(data: any[], sortConfig: NonNullable<AnalyticsFilters['sortBy']>) {
    return data.sort((a, b) => {
      // Primary sort
      const primaryResult = this.compareValues(a[sortConfig.field], b[sortConfig.field], sortConfig.direction)
      
      if (primaryResult !== 0) {
        return primaryResult
      }

      // Secondary sort if primary values are equal
      if (sortConfig.secondary) {
        return this.compareValues(
          a[sortConfig.secondary.field], 
          b[sortConfig.secondary.field], 
          sortConfig.secondary.direction
        )
      }

      return 0
    })
  }

  private static compareValues(a: any, b: any, direction: 'asc' | 'desc'): number {
    if (a === b) return 0
    
    let result = 0
    if (a === null || a === undefined) {
      result = 1
    } else if (b === null || b === undefined) {
      result = -1
    } else if (typeof a === 'string' && typeof b === 'string') {
      result = a.localeCompare(b)
    } else if (a instanceof Date && b instanceof Date) {
      result = a.getTime() - b.getTime()
    } else {
      result = a < b ? -1 : 1
    }

    return direction === 'desc' ? -result : result
  }

  private static generateExceptionTrends(logs: any[]): Array<{date: string, count: number, severity: string}> {
    const trends: Array<{date: string, count: number, severity: string}> = []
    
    for (let i = 6; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd')
      const dayLogs = logs.filter(log => 
        format(new Date(log.created_at), 'yyyy-MM-dd') === date
      )
      
      const criticalCount = dayLogs.filter(log => 
        this.getSeverityFromExceptionType(log.exception_type) === 'critical'
      ).length
      
      const warningCount = dayLogs.filter(log => 
        this.getSeverityFromExceptionType(log.exception_type) === 'warning'
      ).length
      
      const infoCount = dayLogs.filter(log => 
        this.getSeverityFromExceptionType(log.exception_type) === 'info'
      ).length

      if (criticalCount > 0) trends.push({ date, count: criticalCount, severity: 'critical' })
      if (warningCount > 0) trends.push({ date, count: warningCount, severity: 'warning' })
      if (infoCount > 0) trends.push({ date, count: infoCount, severity: 'info' })
    }
    
    return trends
  }

  private static generateIgnitionPatterns(imei: string): Array<{date: string, onEvents: number, offEvents: number}> {
    // This would integrate with Firebase ignition logs
    // For now, return mock data
    const patterns: Array<{date: string, onEvents: number, offEvents: number}> = []
    
    for (let i = 6; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd')
      patterns.push({
        date,
        onEvents: Math.floor(Math.random() * 5),
        offEvents: Math.floor(Math.random() * 5)
      })
    }
    
    return patterns
  }

  private static generateActivityTimeline(devices: any[], logs: any[]): Array<{date: string, activeDevices: number, exceptions: number}> {
    const timeline: Array<{date: string, activeDevices: number, exceptions: number}> = []
    
    for (let i = 6; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd')
      const dayLogs = logs.filter(log => 
        format(new Date(log.created_at), 'yyyy-MM-dd') === date
      )
      
      const activeDevices = new Set(dayLogs.map(log => log.imei)).size
      const exceptions = dayLogs.length
      
      timeline.push({
        date,
        activeDevices,
        exceptions
      })
    }
    
    return timeline
  }

  // Device comparison methods
  static async compareDevices(imeis: string[], timeRange: string = '7d') {
    try {
      const devices = await Promise.all(
        imeis.map(async (imei) => {
          const analytics = await this.getDeviceAnalytics(imei)
          return {
            imei,
            name: analytics.imei,
            healthScore: analytics.healthScore,
            exceptionCount: analytics.totalExceptions,
            ignitionEvents: analytics.ignitionEvents,
            lastActivity: analytics.lastActivity?.toISOString() || new Date().toISOString()
          }
        })
      )

      // Generate time series data for comparison
      const timeSeriesData = await this.generateTimeSeriesComparison(imeis, timeRange)
      
      // Generate correlation data
      const correlationData = await this.generateCorrelationAnalysis(imeis)

      return {
        devices,
        timeSeriesData,
        correlationData,
        performanceMetrics: this.calculatePerformanceMetrics(devices)
      }
    } catch (error) {
      console.error('Error comparing devices:', error)
      throw error
    }
  }

  private static async generateTimeSeriesComparison(imeis: string[], timeRange: string) {
    // Generate mock time series data for comparison
    const days = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90
    const data = []

    for (let i = days; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      
      const dataPoint: any = {
        timestamp: date.toISOString().split('T')[0]
      }

      imeis.forEach(imei => {
        // Generate realistic health scores with some variation
        const baseHealth = 50 + Math.random() * 40
        const variation = (Math.random() - 0.5) * 20
        dataPoint[`health_${imei}`] = Math.max(0, Math.min(100, baseHealth + variation))
        
        // Generate exception counts
        dataPoint[`exceptions_${imei}`] = Math.floor(Math.random() * 5)
        
        // Generate ignition events
        dataPoint[`ignition_${imei}`] = Math.floor(Math.random() * 3)
      })

      data.push(dataPoint)
    }

    return data
  }

  private static async generateCorrelationAnalysis(imeis: string[]) {
    const correlations = [
      {
        title: 'Exception Frequency vs Health Score',
        description: 'Devices with more exceptions tend to have lower health scores',
        strength: 0.85,
        devices: imeis
      },
      {
        title: 'Ignition Activity vs Exception Rate',
        description: 'Higher ignition activity correlates with increased exception frequency',
        strength: 0.72,
        devices: imeis
      },
      {
        title: 'Time-based Exception Patterns',
        description: 'Similar exception patterns observed across multiple devices',
        strength: 0.68,
        devices: imeis
      }
    ]

    return correlations
  }

  private static calculatePerformanceMetrics(devices: any[]) {
    const totalExceptions = devices.reduce((sum, device) => sum + device.exceptionCount, 0)
    const avgHealthScore = devices.reduce((sum, device) => sum + device.healthScore, 0) / devices.length
    const totalIgnitionEvents = devices.reduce((sum, device) => sum + device.ignitionEvents, 0)

    return {
      totalExceptions,
      avgHealthScore: Math.round(avgHealthScore),
      totalIgnitionEvents,
      deviceCount: devices.length
    }
  }

  static async getDeviceList() {
    try {
      const { data: devices, error } = await supabase
        .from('device_inventory')
        .select('*')
        .order('last_seen', { ascending: false })

      if (error) throw error

      return devices || []
    } catch (error) {
      console.error('Error fetching device list:', error)
      return []
    }
  }

  // Export functionality
  static async exportFilteredData(filters: AnalyticsFilters, dataType: 'exceptions' | 'ignition' | 'devices') {
    let data: any[] = []
    let filename = ''

    switch (dataType) {
      case 'exceptions': {
        data = await this.filterExceptionLogs(filters)
        filename = `exception-logs-${format(new Date(), 'yyyy-MM-dd-hhmm-a')}.json`
        break
      }
      case 'ignition': {
        data = await this.filterIgnitionLogs(filters)
        filename = `ignition-logs-${format(new Date(), 'yyyy-MM-dd-hhmm-a')}.json`
        break
      }
      case 'devices': {
        const { data: devices } = await supabase.from('device_inventory').select('*')
        data = devices || []
        filename = `device-inventory-${format(new Date(), 'yyyy-MM-dd-hhmm-a')}.json`
        break
      }
    }

    // Create and download file
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    return data.length
  }
}