import React from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, TrendingUp, TrendingDown, Activity } from 'lucide-react'

interface ChartData {
  name: string
  value: number
  timestamp?: string
  severity?: string
  count?: number
  health?: number
  exceptions?: number
  ignitions?: number
}

interface InteractiveChartsProps {
  data: ChartData[]
  title: string
  type: 'line' | 'bar' | 'pie' | 'area'
  height?: number
  showExport?: boolean
  onDataPointClick?: (data: any) => void
}

const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4']

export const InteractiveCharts: React.FC<InteractiveChartsProps> = ({
  data,
  title,
  type,
  height = 300,
  showExport = true,
  onDataPointClick
}) => {
  const exportData = () => {
    const csvContent = "data:text/csv;charset=utf-8," + 
      Object.keys(data[0] || {}).join(",") + "\n" +
      data.map(row => Object.values(row).join(",")).join("\n")
    
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `${title.replace(/\s+/g, '_')}_chart_data.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const renderChart = () => {
    const commonProps = {
      data,
      height,
      onClick: onDataPointClick
    }

    switch (type) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <LineChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#2563EB" 
                strokeWidth={2}
                dot={{ fill: '#2563EB', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#2563EB', strokeWidth: 2 }}
              />
              {data[0]?.health !== undefined && (
                <Line 
                  type="monotone" 
                  dataKey="health" 
                  stroke="#10B981" 
                  strokeWidth={2}
                  dot={{ fill: '#10B981', strokeWidth: 2, r: 4 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#2563EB" />
              {data[0]?.exceptions !== undefined && (
                <Bar dataKey="exceptions" fill="#EF4444" />
              )}
              {data[0]?.ignitions !== undefined && (
                <Bar dataKey="ignitions" fill="#10B981" />
              )}
            </BarChart>
          </ResponsiveContainer>
        )

      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        )

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <AreaChart {...commonProps}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="#2563EB" 
                fill="#2563EB" 
                fillOpacity={0.3}
              />
              {data[0]?.health !== undefined && (
                <Area 
                  type="monotone" 
                  dataKey="health" 
                  stroke="#10B981" 
                  fill="#10B981" 
                  fillOpacity={0.3}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        )

      default:
        return null
    }
  }

  const getTrendIndicator = () => {
    if (data.length < 2) return null
    
    const firstValue = data[0]?.value || 0
    const lastValue = data[data.length - 1]?.value || 0
    const trend = lastValue - firstValue
    
    if (trend > 0) {
      return <TrendingUp className="h-4 w-4 text-green-500" />
    } else if (trend < 0) {
      return <TrendingDown className="h-4 w-4 text-red-500" />
    } else {
      return <Activity className="h-4 w-4 text-gray-500" />
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center space-x-2">
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          {getTrendIndicator()}
        </div>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="text-xs">
            {data.length} points
          </Badge>
          {showExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={exportData}
              className="h-8 px-2"
            >
              <Download className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          renderChart()
        ) : (
          <div className="flex items-center justify-center h-[200px] text-gray-500">
            No data available for visualization
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Specialized chart components
export const ExceptionTrendChart: React.FC<{
  exceptions: any[]
  onPointClick?: (data: any) => void
}> = ({ exceptions, onPointClick }) => {
  const chartData = exceptions.reduce((acc: any[], exception) => {
    const date = new Date(exception.timestamp).toLocaleDateString()
    const existing = acc.find(item => item.name === date)
    
    if (existing) {
      existing.value += 1
      if (exception.main?.toLowerCase().includes('critical')) {
        existing.critical = (existing.critical || 0) + 1
      }
    } else {
      acc.push({
        name: date,
        value: 1,
        critical: exception.main?.toLowerCase().includes('critical') ? 1 : 0
      })
    }
    
    return acc
  }, [])

  return (
    <InteractiveCharts
      data={chartData}
      title="Exception Trends"
      type="area"
      height={250}
      onDataPointClick={onPointClick}
    />
  )
}

export const DeviceHealthChart: React.FC<{
  devices: any[]
  onPointClick?: (data: any) => void
}> = ({ devices, onPointClick }) => {
  const chartData = devices.map(device => ({
    name: device.imei?.slice(-4) || 'Unknown',
    value: device.health_score || 50,
    exceptions: device.exception_count || 0,
    ignitions: device.ignition_count || 0
  }))

  return (
    <InteractiveCharts
      data={chartData}
      title="Device Health Scores"
      type="bar"
      height={250}
      onDataPointClick={onPointClick}
    />
  )
}

export const SeverityDistributionChart: React.FC<{
  exceptions: any[]
  onPointClick?: (data: any) => void
}> = ({ exceptions, onPointClick }) => {
  const severityCount = exceptions.reduce((acc: any, exception) => {
    const severity = exception.main?.toLowerCase().includes('critical') ? 'Critical' :
                    exception.main?.toLowerCase().includes('warning') ? 'Warning' : 'Info'
    acc[severity] = (acc[severity] || 0) + 1
    return acc
  }, {})

  const chartData = Object.entries(severityCount).map(([name, value]) => ({
    name,
    value: value as number
  }))

  return (
    <InteractiveCharts
      data={chartData}
      title="Exception Severity Distribution"
      type="pie"
      height={250}
      onDataPointClick={onPointClick}
    />
  )
}