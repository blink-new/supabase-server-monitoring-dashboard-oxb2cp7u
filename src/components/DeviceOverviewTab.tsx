import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Smartphone, Power, PowerOff, AlertTriangle, CheckCircle, XCircle, Clock, Activity } from 'lucide-react';
import { firebaseService, ExceptionLog, IgnitionLog, DeviceStatus } from '@/lib/firebase';
import { format } from 'date-fns';

interface DeviceOverview {
  imei: string;
  status: DeviceStatus['status'];
  lastExceptionTime: Date | null;
  lastIgnitionTime: Date | null;
  ignitionStatus: 'ON' | 'OFF' | 'UNKNOWN';
  recentExceptions: number;
  criticalExceptions: number;
  ignitionEvents: number;
  healthScore: number;
}

export function DeviceOverviewTab() {
  const [deviceOverviews, setDeviceOverviews] = useState<Record<string, DeviceOverview>>({});
  const [discoveredDevices, setDiscoveredDevices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatTimestamp = useCallback((timestamp: Date | null): string => {
    if (!timestamp) return 'Never';
    return format(timestamp, 'MMM dd, yyyy hh:mm:ss a');
  }, []);

  const getStatusColor = useCallback((status: DeviceStatus['status']) => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-50 border-green-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  }, []);

  const getStatusIcon = useCallback((status: DeviceStatus['status']) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'critical': return <XCircle className="h-5 w-5 text-red-600" />;
      default: return <Clock className="h-5 w-5 text-gray-600" />;
    }
  }, []);

  const getIgnitionIcon = useCallback((status: string) => {
    switch (status) {
      case 'ON': return <Power className="h-4 w-4 text-green-600" />;
      case 'OFF': return <PowerOff className="h-4 w-4 text-red-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  }, []);

  const calculateHealthScore = useCallback((exceptionLogs: ExceptionLog[], ignitionLogs: IgnitionLog[]): number => {
    let score = 100;
    
    // Deduct points for critical exceptions
    const criticalExceptions = exceptionLogs.filter(log => {
      const mainText = (log.main || '').toLowerCase();
      return mainText === 'server down' || mainText.includes('critical');
    }).length;
    score -= criticalExceptions * 20;
    
    // Deduct points for warnings
    const warnings = exceptionLogs.filter(log => {
      const mainText = (log.main || '').toLowerCase();
      return mainText.includes('retry') || mainText.includes('warning');
    }).length;
    score -= warnings * 5;
    
    // Deduct points for recent exceptions (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentExceptions = exceptionLogs.filter(log => {
      const logTime = firebaseService.parseTimestamp(log.createdAt);
      return logTime > oneHourAgo;
    }).length;
    score -= recentExceptions * 10;
    
    // Bonus points for recent ignition activity (shows device is active)
    if (ignitionLogs.length > 0) {
      const lastIgnition = firebaseService.parseTimestamp(ignitionLogs[0].createdAt);
      const hoursSinceLastIgnition = (Date.now() - lastIgnition.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastIgnition < 24) {
        score += 5;
      }
    }
    
    return Math.max(0, Math.min(100, score));
  }, []);

  const getIgnitionStatus = useCallback((logs: IgnitionLog[]): 'ON' | 'OFF' | 'UNKNOWN' => {
    if (logs.length === 0) return 'UNKNOWN';
    
    const latestLog = logs[0];
    if (latestLog.logType === 'acc_on' || latestLog.ignitionStatus === true) {
      return 'ON';
    }
    if (latestLog.logType === 'acc_off' || latestLog.ignitionStatus === false) {
      return 'OFF';
    }
    if (latestLog.message?.includes('ACC_ON')) {
      return 'ON';
    }
    if (latestLog.message?.includes('ACC_OFF')) {
      return 'OFF';
    }
    return 'UNKNOWN';
  }, []);

  useEffect(() => {
    const unsubscribeFunctions: (() => void)[] = [];
    const deviceData: Record<string, { exceptions: ExceptionLog[], ignitions: IgnitionLog[] }> = {};
    
    const updateDeviceOverview = (imei: string) => {
      const data = deviceData[imei];
      if (!data) return;
      
      const { exceptions, ignitions } = data;
      const deviceStatus = firebaseService.getDeviceStatus(imei, exceptions, ignitions);
      const ignitionStatus = getIgnitionStatus(ignitions);
      const healthScore = calculateHealthScore(exceptions, ignitions);
      
      const overview: DeviceOverview = {
        imei,
        status: deviceStatus.status,
        lastExceptionTime: deviceStatus.lastExceptionTime,
        lastIgnitionTime: deviceStatus.lastIgnitionTime,
        ignitionStatus,
        recentExceptions: exceptions.length,
        criticalExceptions: deviceStatus.criticalExceptions,
        ignitionEvents: ignitions.length,
        healthScore
      };
      
      setDeviceOverviews(prev => ({
        ...prev,
        [imei]: overview
      }));
    };
    
    const setupDeviceMonitoring = async () => {
      try {
        setLoading(true);
        setError(null);

        // Discover all devices in Firebase
        const devices = await firebaseService.discoverDevices();
        setDiscoveredDevices(devices);
        console.log(`Setting up device overview for ${devices.length} discovered devices:`, devices);

        for (const deviceImei of devices) {
          deviceData[deviceImei] = { exceptions: [], ignitions: [] };
          
          // Subscribe to exception logs
          const unsubscribeExceptions = firebaseService.subscribeToExceptionLogs(
            deviceImei,
            (logs) => {
              deviceData[deviceImei].exceptions = logs;
              updateDeviceOverview(deviceImei);
            }
          );

          // Subscribe to ignition logs
          const unsubscribeIgnition = firebaseService.subscribeToIgnitionLogs(
            deviceImei,
            (logs) => {
              deviceData[deviceImei].ignitions = logs;
              updateDeviceOverview(deviceImei);
            }
          );

          unsubscribeFunctions.push(unsubscribeExceptions, unsubscribeIgnition);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error setting up device monitoring:', err);
        setError('Failed to connect to Firebase. Please check your connection.');
        setLoading(false);
      }
    };

    setupDeviceMonitoring();

    return () => {
      unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    };
  }, [getIgnitionStatus, calculateHealthScore]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const overviews = Object.values(deviceOverviews);
  const healthyDevices = overviews.filter(d => d.status === 'healthy').length;
  const warningDevices = overviews.filter(d => d.status === 'warning').length;
  const criticalDevices = overviews.filter(d => d.status === 'critical').length;
  const averageHealthScore = overviews.length > 0 
    ? Math.round(overviews.reduce((sum, d) => sum + d.healthScore, 0) / overviews.length)
    : 0;

  return (
    <div className="space-y-6">
      {/* Fleet Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
            <Smartphone className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{discoveredDevices.length}</div>
            <p className="text-xs text-muted-foreground">
              Discovered devices
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Healthy</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{healthyDevices}</div>
            <p className="text-xs text-muted-foreground">
              Operating normally
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Issues</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{warningDevices + criticalDevices}</div>
            <p className="text-xs text-muted-foreground">
              Require attention
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fleet Health</CardTitle>
            <Activity className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{averageHealthScore}%</div>
            <Progress value={averageHealthScore} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Device Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {discoveredDevices.map((imei) => {
          const overview = deviceOverviews[imei];
          
          if (!overview) {
            return (
              <Card key={imei} className="border-gray-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5" />
                    IMEI: {imei}
                  </CardTitle>
                  <CardDescription>Loading device data...</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="animate-pulse space-y-2">
                    <div className="h-4 bg-gray-200 rounded"></div>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  </div>
                </CardContent>
              </Card>
            );
          }

          return (
            <Card key={imei} className={`border-2 ${getStatusColor(overview.status)}`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5" />
                    <span className="text-sm">IMEI: {imei}</span>
                  </div>
                  {getStatusIcon(overview.status)}
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <Badge variant={overview.status === 'healthy' ? 'default' : overview.status === 'warning' ? 'secondary' : 'destructive'}>
                    {overview.status.toUpperCase()}
                  </Badge>
                  <span>Health: {overview.healthScore}%</span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Health Score */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Health Score</span>
                    <span>{overview.healthScore}%</span>
                  </div>
                  <Progress value={overview.healthScore} className="h-2" />
                </div>

                {/* Ignition Status */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Ignition Status</span>
                  <div className="flex items-center gap-2">
                    {getIgnitionIcon(overview.ignitionStatus)}
                    <Badge variant={overview.ignitionStatus === 'ON' ? 'default' : 'secondary'}>
                      {overview.ignitionStatus}
                    </Badge>
                  </div>
                </div>

                {/* Statistics */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="font-medium text-red-600">{overview.criticalExceptions}</div>
                    <div className="text-gray-600">Critical Issues</div>
                  </div>
                  <div>
                    <div className="font-medium text-blue-600">{overview.ignitionEvents}</div>
                    <div className="text-gray-600">Ignition Events</div>
                  </div>
                </div>

                {/* Last Activity */}
                <div className="space-y-2 text-xs text-gray-600">
                  <div>
                    <span className="font-medium">Last Exception:</span>
                    <br />
                    {formatTimestamp(overview.lastExceptionTime)}
                  </div>
                  <div>
                    <span className="font-medium">Last Ignition:</span>
                    <br />
                    {formatTimestamp(overview.lastIgnitionTime)}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Critical Alerts Summary */}
      {criticalDevices > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800 flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Critical Devices Requiring Immediate Attention
            </CardTitle>
            <CardDescription className="text-red-700">
              {criticalDevices} device{criticalDevices > 1 ? 's' : ''} with critical issues
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {overviews
                .filter(d => d.status === 'critical')
                .map((device) => (
                  <div key={device.imei} className="flex items-center justify-between p-3 bg-white rounded-lg border border-red-200">
                    <div className="flex items-center gap-3">
                      <XCircle className="h-4 w-4 text-red-600" />
                      <div>
                        <div className="font-medium">IMEI: {device.imei}</div>
                        <div className="text-sm text-red-600">
                          {device.criticalExceptions} critical exception{device.criticalExceptions > 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    <Badge variant="destructive">
                      Health: {device.healthScore}%
                    </Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}