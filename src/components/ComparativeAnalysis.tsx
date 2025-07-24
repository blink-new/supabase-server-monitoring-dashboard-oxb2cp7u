import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, Activity, Zap, Clock } from 'lucide-react';
import { analyticsService } from '@/lib/analytics';

interface ComparisonDevice {
  imei: string;
  name: string;
  healthScore: number;
  exceptionCount: number;
  ignitionEvents: number;
  lastActivity: string;
}

interface ComparisonData {
  devices: ComparisonDevice[];
  timeSeriesData: any[];
  correlationData: any[];
  performanceMetrics: any;
}

export function ComparativeAnalysis() {
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
  const [timeRange, setTimeRange] = useState('7d');
  const [comparisonType, setComparisonType] = useState('health');
  const [loading, setLoading] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<ComparisonDevice[]>([]);

  const loadAvailableDevices = useCallback(async () => {
    try {
      const devices = await analyticsService.getDeviceList();
      const deviceData = await Promise.all(
        devices.map(async (device) => {
          const analytics = await analyticsService.getDeviceAnalytics(device.imei);
          return {
            imei: device.imei,
            name: device.name || device.imei,
            healthScore: analytics.healthScore,
            exceptionCount: analytics.exceptionCount,
            ignitionEvents: analytics.ignitionEvents,
            lastActivity: analytics.lastActivity
          };
        })
      );
      setAvailableDevices(deviceData);
    } catch (error) {
      console.error('Error loading devices:', error);
    }
  }, []);

  const loadComparisonData = useCallback(async () => {
    if (selectedDevices.length < 2) return;
    
    setLoading(true);
    try {
      const comparisonResults = await analyticsService.compareDevices(selectedDevices, timeRange);
      setComparisonData(comparisonResults);
    } catch (error) {
      console.error('Error loading comparison data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedDevices, timeRange]);

  useEffect(() => {
    loadAvailableDevices();
  }, [loadAvailableDevices]);

  useEffect(() => {
    loadComparisonData();
  }, [loadComparisonData]);

  const handleDeviceToggle = (imei: string) => {
    setSelectedDevices(prev => 
      prev.includes(imei) 
        ? prev.filter(id => id !== imei)
        : [...prev, imei].slice(0, 4) // Limit to 4 devices for comparison
    );
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  return (
    <div className="space-y-6">
      {/* Device Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Device Selection for Comparison
          </CardTitle>
          <CardDescription>
            Select 2-4 devices to compare their performance, health, and activity patterns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableDevices.map((device) => (
              <div
                key={device.imei}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedDevices.includes(device.imei)
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => handleDeviceToggle(device.imei)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{device.name}</h4>
                  <Badge variant={selectedDevices.includes(device.imei) ? 'default' : 'outline'}>
                    {selectedDevices.includes(device.imei) ? 'Selected' : 'Select'}
                  </Badge>
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                  <div className="flex justify-between">
                    <span>Health Score:</span>
                    <span className={getHealthColor(device.healthScore)}>
                      {device.healthScore}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Exceptions:</span>
                    <span>{device.exceptionCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ignition Events:</span>
                    <span>{device.ignitionEvents}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedDevices.length > 0 && (
            <div className="mt-4 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Selected Devices:</span>
                <Badge variant="secondary">{selectedDevices.length}/4</Badge>
              </div>
              <div className="flex gap-2">
                <Select value={timeRange} onValueChange={setTimeRange}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">Last 24h</SelectItem>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                    <SelectItem value="90d">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  onClick={loadComparisonData}
                  disabled={selectedDevices.length < 2 || loading}
                >
                  {loading ? 'Comparing...' : 'Compare Devices'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comparison Results */}
      {comparisonData && selectedDevices.length >= 2 && (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="health">Health Trends</TabsTrigger>
            <TabsTrigger value="exceptions">Exceptions</TabsTrigger>
            <TabsTrigger value="ignition">Ignition</TabsTrigger>
            <TabsTrigger value="correlation">Correlation</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {comparisonData.devices.map((device, index) => (
                <Card key={device.imei}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{device.name}</CardTitle>
                    <CardDescription>{device.imei}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Health Score</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${getHealthColor(device.healthScore)}`}>
                          {device.healthScore}%
                        </span>
                        {device.healthScore >= 80 ? (
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Exceptions</span>
                      <Badge variant={device.exceptionCount > 10 ? 'destructive' : 'secondary'}>
                        {device.exceptionCount}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Ignition Events</span>
                      <span className="font-medium">{device.ignitionEvents}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Last Activity</span>
                      <span className="text-xs text-gray-500">
                        {new Date(device.lastActivity).toLocaleDateString()}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Performance Comparison Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Performance Comparison</CardTitle>
                <CardDescription>
                  Comparative analysis of key metrics across selected devices
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={comparisonData.devices}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="healthScore" fill="#2563EB" name="Health Score" />
                    <Bar dataKey="exceptionCount" fill="#EF4444" name="Exception Count" />
                    <Bar dataKey="ignitionEvents" fill="#10B981" name="Ignition Events" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="health" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Health Score Trends</CardTitle>
                <CardDescription>
                  Health score evolution over time for selected devices
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={comparisonData.timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    {selectedDevices.map((imei, index) => (
                      <Line
                        key={imei}
                        type="monotone"
                        dataKey={`health_${imei}`}
                        stroke={COLORS[index]}
                        strokeWidth={2}
                        name={availableDevices.find(d => d.imei === imei)?.name || imei}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="exceptions" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Exception Distribution</CardTitle>
                  <CardDescription>
                    Exception count comparison across devices
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={comparisonData.devices.map((device, index) => ({
                          name: device.name,
                          value: device.exceptionCount,
                          fill: COLORS[index]
                        }))}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {comparisonData.devices.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Exception Timeline</CardTitle>
                  <CardDescription>
                    Exception frequency over time
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={comparisonData.timeSeriesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      {selectedDevices.map((imei, index) => (
                        <Line
                          key={imei}
                          type="monotone"
                          dataKey={`exceptions_${imei}`}
                          stroke={COLORS[index]}
                          strokeWidth={2}
                          name={availableDevices.find(d => d.imei === imei)?.name || imei}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="ignition" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Ignition Activity Comparison</CardTitle>
                <CardDescription>
                  Ignition events and patterns across selected devices
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={comparisonData.devices}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="ignitionEvents" fill="#10B981" name="Total Ignition Events" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="correlation" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Cross-Device Correlation Analysis</CardTitle>
                <CardDescription>
                  Identify patterns and correlations between device behaviors
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {comparisonData.correlationData.map((correlation, index) => (
                    <div key={index} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium">{correlation.title}</h4>
                        <Badge variant={correlation.strength > 0.7 ? 'default' : 'secondary'}>
                          {correlation.strength > 0.7 ? 'Strong' : 'Moderate'} Correlation
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">{correlation.description}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${correlation.strength * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">
                          {(correlation.strength * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {selectedDevices.length < 2 && (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Select Devices to Compare
              </h3>
              <p className="text-gray-600">
                Choose at least 2 devices from the list above to start comparative analysis
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}