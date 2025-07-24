import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Car, 
  Server, 
  Activity,
  RefreshCw,
  Bell
} from 'lucide-react';
import { firebaseService } from '@/lib/firebase';
import { format } from 'date-fns';
import { parseTimestamp, formatTimestamp } from '@/lib/timestamp-utils';

interface CriticalAlert {
  id: string;
  imei: string;
  type: string;
  message: string;
  timestamp: any;
  severity: 'critical' | 'high' | 'medium';
  acknowledged: boolean;
}

interface FleetSummary {
  total: number;
  active: number;
  withIssues: number;
  offline: number;
}

interface ServerStatus {
  status: 'up' | 'down' | 'degraded';
  responseTime: number;
  lastCheck: Date;
}

export default function OperationsDashboard() {
  const [criticalAlerts, setCriticalAlerts] = useState<CriticalAlert[]>([]);
  const [fleetSummary, setFleetSummary] = useState<FleetSummary>({
    total: 0,
    active: 0,
    withIssues: 0,
    offline: 0
  });
  const [serverStatus, setServerStatus] = useState<ServerStatus>({
    status: 'up',
    responseTime: 0,
    lastCheck: new Date()
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Load critical alerts from Firebase
  const loadCriticalAlerts = async () => {
    try {
      const devices = await firebaseService.discoverDevices();
      console.log('🎯 Loading critical alerts for devices:', devices);
      
      const allAlerts: CriticalAlert[] = [];
      
      for (const deviceId of devices) {
        try {
          const exceptions = await firebaseService.getExceptionLogs(deviceId);
          
          // Filter for critical exceptions only
          const criticalExceptions = exceptions
            .filter(ex => 
              ex.main?.toLowerCase().includes('critical') ||
              ex.main?.toLowerCase().includes('server down') ||
              ex.main?.toLowerCase().includes('offline') ||
              ex.details?.toLowerCase().includes('critical')
            )
            .slice(0, 5) // Latest 5 per device
            .map(ex => ({
              id: `${deviceId}-${ex.timestamp}`,
              imei: deviceId,
              type: ex.main || 'Exception',
              message: ex.details || 'Critical issue detected',
              timestamp: ex.timestamp,
              severity: 'critical' as const,
              acknowledged: false
            }));
          
          allAlerts.push(...criticalExceptions);
        } catch (error) {
          console.error(`Error loading alerts for device ${deviceId}:`, error);
        }
      }
      
      // Sort by timestamp (most recent first) and limit to 10
      const sortedAlerts = allAlerts
        .sort((a, b) => {
          const timeA = parseTimestamp(a.timestamp);
          const timeB = parseTimestamp(b.timestamp);
          return timeB.getTime() - timeA.getTime();
        })
        .slice(0, 10);
      
      setCriticalAlerts(sortedAlerts);
      console.log('🚨 Critical alerts loaded:', sortedAlerts.length);
      
    } catch (error) {
      console.error('Error loading critical alerts:', error);
    }
  };

  // Load fleet summary
  const loadFleetSummary = async () => {
    try {
      const devices = await firebaseService.discoverDevices();
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      let active = 0;
      let withIssues = 0;
      
      for (const deviceId of devices) {
        try {
          // Check recent activity (ignition logs)
          const ignitionLogs = await firebaseService.getIgnitionLogs(deviceId);
          const recentIgnition = ignitionLogs.find(log => {
            const logTime = parseTimestamp(log.timestamp);
            return logTime > oneHourAgo;
          });
          
          if (recentIgnition) {
            active++;
          }
          
          // Check for recent exceptions
          const exceptions = await firebaseService.getExceptionLogs(deviceId);
          const recentExceptions = exceptions.filter(ex => {
            const exTime = parseTimestamp(ex.timestamp);
            return exTime > oneHourAgo;
          });
          
          if (recentExceptions.length > 0) {
            withIssues++;
          }
          
        } catch (error) {
          console.error(`Error checking device ${deviceId}:`, error);
        }
      }
      
      setFleetSummary({
        total: devices.length,
        active,
        withIssues,
        offline: devices.length - active
      });
      
    } catch (error) {
      console.error('Error loading fleet summary:', error);
    }
  };

  // Check server status
  const checkServerStatus = async () => {
    try {
      const startTime = Date.now();
      const response = await fetch('http://twca.trackingworld.com.pk:3000/api/devices', {
        method: 'HEAD',
        mode: 'no-cors'
      });
      const responseTime = Date.now() - startTime;
      
      setServerStatus({
        status: 'up',
        responseTime,
        lastCheck: new Date()
      });
      
    } catch (error) {
      console.error('Server health check failed:', error);
      setServerStatus({
        status: 'down',
        responseTime: 0,
        lastCheck: new Date()
      });
    }
  };

  // Acknowledge alert
  const acknowledgeAlert = (alertId: string) => {
    setCriticalAlerts(prev => 
      prev.map(alert => 
        alert.id === alertId 
          ? { ...alert, acknowledged: true }
          : alert
      )
    );
  };

  // Refresh all data
  const refreshData = async () => {
    setLoading(true);
    await Promise.all([
      loadCriticalAlerts(),
      loadFleetSummary(),
      checkServerStatus()
    ]);
    setLastUpdate(new Date());
    setLoading(false);
  };

  useEffect(() => {
    refreshData();
    
    // Set up real-time subscriptions for critical alerts
    const unsubscribe = firebaseService.subscribeToExceptions((deviceId, exceptions) => {
      const criticalExceptions = exceptions
        .filter(ex => 
          ex.main?.toLowerCase().includes('critical') ||
          ex.main?.toLowerCase().includes('server down') ||
          ex.main?.toLowerCase().includes('offline') ||
          ex.details?.toLowerCase().includes('critical')
        )
        .slice(0, 2)
        .map(ex => ({
          id: `${deviceId}-${ex.timestamp}`,
          imei: deviceId,
          type: ex.main || 'Exception',
          message: ex.details || 'Critical issue detected',
          timestamp: ex.timestamp,
          severity: 'critical' as const,
          acknowledged: false
        }));
      
      if (criticalExceptions.length > 0) {
        setCriticalAlerts(prev => {
          const updated = [...criticalExceptions, ...prev];
          return updated
            .sort((a, b) => {
              const timeA = parseTimestamp(a.timestamp);
              const timeB = parseTimestamp(b.timestamp);
              return timeB.getTime() - timeA.getTime();
            })
            .slice(0, 10);
        });
      }
    });

    // Refresh server status every 30 seconds
    const serverInterval = setInterval(checkServerStatus, 30000);
    
    return () => {
      unsubscribe();
      clearInterval(serverInterval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unacknowledgedAlerts = criticalAlerts.filter(alert => !alert.acknowledged);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operations Dashboard</h1>
          <p className="text-sm text-gray-500">
            Last updated: {format(lastUpdate, 'MMM dd, yyyy hh:mm:ss a')}
          </p>
        </div>
        <Button onClick={refreshData} disabled={loading} className="w-fit">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Critical Alerts */}
      <Card className="border-red-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <CardTitle className="text-red-700">Critical Alerts</CardTitle>
              {unacknowledgedAlerts.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {unacknowledgedAlerts.length}
                </Badge>
              )}
            </div>
            <Bell className="h-4 w-4 text-red-500" />
          </div>
          <CardDescription>
            Firebase exceptions requiring immediate attention
          </CardDescription>
        </CardHeader>
        <CardContent>
          {criticalAlerts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
              <p>No critical alerts at this time</p>
            </div>
          ) : (
            <div className="space-y-3">
              {criticalAlerts.slice(0, 5).map((alert) => (
                <Alert key={alert.id} className={`${alert.acknowledged ? 'opacity-60' : ''}`}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {alert.imei}
                          </Badge>
                          <Badge variant="destructive" className="text-xs">
                            {alert.type}
                          </Badge>
                        </div>
                        <p className="text-sm">{alert.message}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {formatTimestamp(alert.timestamp, 'MMM dd, hh:mm:ss a')}
                        </p>
                      </div>
                      {!alert.acknowledged && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="ml-2"
                        >
                          Acknowledge
                        </Button>
                      )}
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
              {criticalAlerts.length > 5 && (
                <p className="text-sm text-gray-500 text-center">
                  +{criticalAlerts.length - 5} more alerts
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Server Status */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Server Status</CardTitle>
              <Server className="h-4 w-4 text-gray-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {serverStatus.status === 'up' ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500" />
              )}
              <span className="font-semibold capitalize">{serverStatus.status}</span>
            </div>
            {serverStatus.status === 'up' && (
              <p className="text-xs text-gray-500 mt-1">
                Response: {serverStatus.responseTime}ms
              </p>
            )}
            <p className="text-xs text-gray-500">
              Last check: {format(serverStatus.lastCheck, 'hh:mm:ss a')}
            </p>
          </CardContent>
        </Card>

        {/* Fleet Summary */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Total Fleet</CardTitle>
              <Car className="h-4 w-4 text-gray-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fleetSummary.total}</div>
            <p className="text-xs text-gray-500">Honda vehicles</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Active Vehicles</CardTitle>
              <Activity className="h-4 w-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{fleetSummary.active}</div>
            <p className="text-xs text-gray-500">Recent activity</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">With Issues</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{fleetSummary.withIssues}</div>
            <p className="text-xs text-gray-500">Need attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Timeline */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-gray-500" />
            <CardTitle>Recent Critical Events</CardTitle>
          </div>
          <CardDescription>
            Latest critical events from your Honda fleet
          </CardDescription>
        </CardHeader>
        <CardContent>
          {criticalAlerts.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Clock className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>No recent critical events</p>
            </div>
          ) : (
            <div className="space-y-4">
              {criticalAlerts.slice(0, 8).map((alert, index) => (
                <div key={alert.id} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-2 h-2 bg-red-500 rounded-full mt-2"></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">
                        {alert.imei}
                      </Badge>
                      <span className="text-sm font-medium">{alert.type}</span>
                    </div>
                    <p className="text-sm text-gray-600">{alert.message}</p>
                    <p className="text-xs text-gray-500">
                      {formatTimestamp(alert.timestamp, 'MMM dd, yyyy hh:mm:ss a')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}