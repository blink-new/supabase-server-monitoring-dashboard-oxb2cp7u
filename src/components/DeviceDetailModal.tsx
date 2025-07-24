import React, { useState, useEffect, useCallback } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'
import { Activity, AlertTriangle, Zap, TrendingUp, Download, RefreshCw } from 'lucide-react'
import { AnalyticsService, DeviceAnalytics } from '@/lib/analytics'
import { format } from 'date-fns'

interface DeviceDetailModalProps {
  isOpen: boolean
  onClose: () => void
  imei: string | null
}

export function DeviceDetailModal({ isOpen, onClose, imei }: DeviceDetailModalProps) {
  const [deviceAnalytics, setDeviceAnalytics] = useState<DeviceAnalytics | null>(null)
  const [loading, setLoading] = useState(false)

  const loadDeviceAnalytics = useCallback(async () => {
    if (!imei) return

    setLoading(true)
    try {
      const analytics = await AnalyticsService.getDeviceAnalytics(imei)
      setDeviceAnalytics(analytics)
    } catch (error) {
      console.error('Error loading device analytics:', error)
    } finally {
      setLoading(false)
    }
  }, [imei])

  useEffect(() => {
    if (isOpen && imei) {
      loadDeviceAnalytics()
    }
  }, [isOpen, imei, loadDeviceAnalytics])

  const handleExportAnalytics = useCallback(async () => {
    if (!deviceAnalytics) return

    const exportData = {
      device: deviceAnalytics,
      exportedAt: new Date().toISOString(),
      exportType: 'device-analytics'
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `device-analytics-${imei}-${format(new Date(), 'yyyy-MM-dd-hhmm-a')}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [deviceAnalytics, imei])

  const getHealthColor = (score: number) => {
    if (score >= 70) return 'text-green-600'
    if (score >= 40) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getHealthBadgeVariant = (score: number): "default" | "secondary" | "destructive" | "outline" => {
    if (score >= 70) return 'default'
    if (score >= 40) return 'secondary'
    return 'destructive'
  }

  const COLORS = ['#10B981', '#F59E0B', '#EF4444', '#6B7280']

  if (!imei) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Device Analytics - {imei}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadDeviceAnalytics}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportAnalytics}
                disabled={!deviceAnalytics}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-lg">Loading device analytics...</span>
          </div>
        ) : deviceAnalytics ? (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
              <TabsTrigger value="ignition">Ignition</TabsTrigger>
              <TabsTrigger value="trends">Trends</TabsTrigger>
              <TabsTrigger value="correlations">Correlations</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Health Score</CardTitle>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${getHealthColor(deviceAnalytics.healthScore)}`}>
                      {deviceAnalytics.healthScore}%
                    </div>
                    <Badge variant={getHealthBadgeVariant(deviceAnalytics.healthScore)} className="mt-2">
                      {deviceAnalytics.healthScore >= 70 ? 'Healthy' : 
                       deviceAnalytics.healthScore >= 40 ? 'Warning' : 'Critical'}
                    </Badge>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Exceptions</CardTitle>
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{deviceAnalytics.totalExceptions}</div>
                    <p className="text-xs text-muted-foreground">
                      {deviceAnalytics.criticalExceptions} critical
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Ignition Events</CardTitle>
                    <Zap className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{deviceAnalytics.ignitionEvents}</div>
                    <p className="text-xs text-muted-foreground">
                      Last 7 days
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Uptime</CardTitle>
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{deviceAnalytics.uptimePercentage.toFixed(1)}%</div>
                    <p className="text-xs text-muted-foreground">
                      {deviceAnalytics.lastActivity ? 
                        `Last seen ${format(deviceAnalytics.lastActivity, 'MMM dd, hh:mm a')}` : 
                        'Never seen'
                      }
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Exception Trends (24h)</CardTitle>
                    <CardDescription>Exception count by severity over time</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={deviceAnalytics.exceptionTrends}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Line 
                          type="monotone" 
                          dataKey="count" 
                          stroke="#2563EB" 
                          strokeWidth={2}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Ignition Patterns (7d)</CardTitle>
                    <CardDescription>ON/OFF events by day</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={deviceAnalytics.ignitionPatterns}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="onEvents" fill="#10B981" name="ON Events" />
                        <Bar dataKey="offEvents" fill="#EF4444" name="OFF Events" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="exceptions" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Exception Distribution</CardTitle>
                  <CardDescription>Breakdown of exceptions by severity</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{deviceAnalytics.criticalExceptions}</div>
                      <div className="text-sm text-muted-foreground">Critical</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-yellow-600">
                        {deviceAnalytics.totalExceptions - deviceAnalytics.criticalExceptions}
                      </div>
                      <div className="text-sm text-muted-foreground">Warning/Info</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {Math.max(0, 100 - deviceAnalytics.totalExceptions)}
                      </div>
                      <div className="text-sm text-muted-foreground">Clean Days</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ignition" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Ignition Activity</CardTitle>
                  <CardDescription>Recent ignition events and patterns</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={deviceAnalytics.ignitionPatterns}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="onEvents" fill="#10B981" name="Ignition ON" />
                      <Bar dataKey="offEvents" fill="#EF4444" name="Ignition OFF" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="trends" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Exception Trends</CardTitle>
                  <CardDescription>Historical exception patterns</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={deviceAnalytics.exceptionTrends}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line 
                        type="monotone" 
                        dataKey="count" 
                        stroke="#2563EB" 
                        strokeWidth={2}
                        dot={{ fill: '#2563EB' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="correlations" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Data Correlations</CardTitle>
                  <CardDescription>Relationships between different metrics</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center p-4 border rounded-lg">
                      <div>
                        <div className="font-medium">Exception vs Health Score</div>
                        <div className="text-sm text-muted-foreground">
                          Correlation between exception frequency and device health
                        </div>
                      </div>
                      <Badge variant="outline">
                        {deviceAnalytics.totalExceptions > 10 ? 'Strong Negative' : 'Weak'}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center p-4 border rounded-lg">
                      <div>
                        <div className="font-medium">Ignition vs Exceptions</div>
                        <div className="text-sm text-muted-foreground">
                          Relationship between ignition activity and exceptions
                        </div>
                      </div>
                      <Badge variant="outline">
                        {deviceAnalytics.ignitionEvents > 5 ? 'Moderate' : 'Low'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-yellow-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium">No Data Available</h3>
              <p className="text-muted-foreground">Unable to load analytics for this device.</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}