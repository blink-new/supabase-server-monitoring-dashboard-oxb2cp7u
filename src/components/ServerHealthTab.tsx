import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { CheckCircle, XCircle, AlertTriangle, Clock, TrendingUp, TrendingDown } from 'lucide-react'
import { supabase, ServerHealthCheck } from '@/lib/supabase'
import { format, subHours, subDays } from 'date-fns'

export default function ServerHealthTab() {
  const [healthChecks, setHealthChecks] = useState<ServerHealthCheck[]>([])
  const [chartData, setChartData] = useState<any[]>([])
  const [uptimeStats, setUptimeStats] = useState({
    last24h: 0,
    last7d: 0,
    last30d: 0
  })
  const [isLoading, setIsLoading] = useState(true)

  const calculateUptimeStats = useCallback(async () => {
    const now = new Date()
    
    // Calculate uptime for different periods
    const periods = [
      { key: 'last24h', hours: 24 },
      { key: 'last7d', hours: 24 * 7 },
      { key: 'last30d', hours: 24 * 30 }
    ]

    const stats: any = {}

    for (const period of periods) {
      const startTime = subHours(now, period.hours)
      
      const { data: periodChecks } = await supabase
        .from('server_health_checks')
        .select('status')
        .gte('timestamp', startTime.toISOString())
        .order('timestamp', { ascending: false })

      if (periodChecks && periodChecks.length > 0) {
        const upChecks = periodChecks.filter(check => check.status === 'up').length
        const uptime = (upChecks / periodChecks.length) * 100
        stats[period.key] = Math.round(uptime * 100) / 100
      } else {
        stats[period.key] = 0
      }
    }

    setUptimeStats(stats)
  }, [])

  const fetchHealthData = useCallback(async () => {
    setIsLoading(true)
    try {
      // Fetch recent health checks
      const { data: recentChecks } = await supabase
        .from('server_health_checks')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(50)

      if (recentChecks) {
        setHealthChecks(recentChecks)
        
        // Prepare chart data (last 24 hours)
        const last24Hours = recentChecks
          .filter(check => new Date(check.timestamp) > subHours(new Date(), 24))
          .reverse()
          .map(check => ({
            time: format(new Date(check.timestamp), 'hh:mm a'),
            responseTime: check.response_time_ms || 0,
            status: check.status
          }))
        
        setChartData(last24Hours)
        
        // Calculate uptime statistics
        await calculateUptimeStats()
      }
    } catch (error) {
      console.error('Error fetching health data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [calculateUptimeStats])

  useEffect(() => {
    fetchHealthData()
    
    // Set up real-time subscription
    const subscription = supabase
      .channel('health_tab_updates')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'server_health_checks' },
        () => {
          fetchHealthData()
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [fetchHealthData])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'up': return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'degraded': return <AlertTriangle className="h-4 w-4 text-yellow-600" />
      case 'down': return <XCircle className="h-4 w-4 text-red-600" />
      default: return <Clock className="h-4 w-4 text-gray-600" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'up': return 'bg-green-100 text-green-800 border-green-200'
      case 'degraded': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'down': return 'bg-red-100 text-red-800 border-red-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getUptimeColor = (uptime: number) => {
    if (uptime >= 99) return 'text-green-600'
    if (uptime >= 95) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getUptimeIcon = (uptime: number) => {
    if (uptime >= 99) return <TrendingUp className="h-4 w-4 text-green-600" />
    return <TrendingDown className="h-4 w-4 text-red-600" />
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardHeader className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Uptime Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">24 Hour Uptime</CardTitle>
            {getUptimeIcon(uptimeStats.last24h)}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getUptimeColor(uptimeStats.last24h)}`}>
              {uptimeStats.last24h}%
            </div>
            <p className="text-xs text-muted-foreground">
              Last 24 hours
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">7 Day Uptime</CardTitle>
            {getUptimeIcon(uptimeStats.last7d)}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getUptimeColor(uptimeStats.last7d)}`}>
              {uptimeStats.last7d}%
            </div>
            <p className="text-xs text-muted-foreground">
              Last 7 days
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">30 Day Uptime</CardTitle>
            {getUptimeIcon(uptimeStats.last30d)}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getUptimeColor(uptimeStats.last30d)}`}>
              {uptimeStats.last30d}%
            </div>
            <p className="text-xs text-muted-foreground">
              Last 30 days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Response Time Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Response Time (Last 24 Hours)</CardTitle>
          <CardDescription>
            Server response times over the past 24 hours
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 12 }}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Response Time (ms)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip 
                  formatter={(value: any, name: string) => [
                    `${value}ms`, 
                    'Response Time'
                  ]}
                  labelFormatter={(label) => `Time: ${label}`}
                />
                <Line 
                  type="monotone" 
                  dataKey="responseTime" 
                  stroke="#2563EB" 
                  strokeWidth={2}
                  dot={{ fill: '#2563EB', strokeWidth: 2, r: 3 }}
                  activeDot={{ r: 5, stroke: '#2563EB', strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Recent Health Checks */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Health Checks</CardTitle>
          <CardDescription>
            Latest 50 server health check results
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Response Time</TableHead>
                <TableHead>HTTP Status</TableHead>
                <TableHead>Error Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {healthChecks.map((check) => (
                <TableRow key={check.id}>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(check.status)}
                      <Badge 
                        variant="outline" 
                        className={getStatusColor(check.status)}
                      >
                        {check.status.toUpperCase()}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {format(new Date(check.timestamp), 'MMM dd, hh:mm:ss a')}
                  </TableCell>
                  <TableCell>
                    {check.response_time_ms ? (
                      <span className={
                        check.response_time_ms > 5000 ? 'text-red-600' :
                        check.response_time_ms > 2000 ? 'text-yellow-600' :
                        'text-green-600'
                      }>
                        {check.response_time_ms}ms
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge 
                      variant={check.http_status_code === 200 ? "default" : "destructive"}
                    >
                      {check.http_status_code || 'N/A'}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {check.error_message ? (
                      <span className="text-red-600 text-sm">
                        {check.error_message}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}