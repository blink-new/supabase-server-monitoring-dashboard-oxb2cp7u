import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Power, PowerOff, MapPin, Battery, Clock, Smartphone, AlertTriangle } from 'lucide-react';
import { firebaseService, IgnitionLog } from '@/lib/firebase';
import { format } from 'date-fns';

export function IgnitionMonitoringTab() {
  const [ignitionLogs, setIgnitionLogs] = useState<Record<string, IgnitionLog[]>>({});
  const [discoveredDevices, setDiscoveredDevices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatTimestamp = useCallback((timestamp: string | any): string => {
    try {
      const date = firebaseService.parseTimestamp(timestamp);
      return format(date, 'MMM dd, yyyy hh:mm:ss a');
    } catch (error) {
      return 'Invalid date';
    }
  }, []);

  const getIgnitionIcon = useCallback((log: IgnitionLog) => {
    if (log.logType === 'acc_on' || log.ignitionStatus === true) {
      return <Power className="h-4 w-4 text-green-600" />;
    }
    if (log.logType === 'acc_off' || log.ignitionStatus === false) {
      return <PowerOff className="h-4 w-4 text-red-600" />;
    }
    return <Clock className="h-4 w-4 text-gray-600" />;
  }, []);

  const getIgnitionStatus = useCallback((log: IgnitionLog): string => {
    if (log.logType === 'acc_on' || log.ignitionStatus === true) {
      return 'ON';
    }
    if (log.logType === 'acc_off' || log.ignitionStatus === false) {
      return 'OFF';
    }
    const message = (log.message || '').toUpperCase();
    if (message.includes('ACC_ON')) {
      return 'ON';
    }
    if (message.includes('ACC_OFF')) {
      return 'OFF';
    }
    return 'UNKNOWN';
  }, []);

  const getStatusBadge = useCallback((log: IgnitionLog) => {
    const status = getIgnitionStatus(log);
    if (status === 'ON') {
      return <Badge className="bg-green-100 text-green-800">Ignition ON</Badge>;
    }
    if (status === 'OFF') {
      return <Badge className="bg-red-100 text-red-800">Ignition OFF</Badge>;
    }
    return <Badge variant="outline">Unknown</Badge>;
  }, [getIgnitionStatus]);

  const getDeviceIgnitionSummary = useCallback((logs: IgnitionLog[]) => {
    if (logs.length === 0) return { status: 'unknown', lastChange: null, totalEvents: 0 };

    const latestLog = logs[0];
    const status = getIgnitionStatus(latestLog);
    const lastChange = firebaseService.parseTimestamp(latestLog.createdAt);
    const totalEvents = logs.length;

    return { status, lastChange, totalEvents };
  }, [getIgnitionStatus]);

  useEffect(() => {
    const unsubscribeFunctions: (() => void)[] = [];
    
    const setupIgnitionMonitoring = async () => {
      try {
        setLoading(true);
        setError(null);

        // Discover all devices in Firebase
        const devices = await firebaseService.discoverDevices();
        setDiscoveredDevices(devices);
        console.log(`Setting up ignition monitoring for ${devices.length} discovered devices:`, devices);

        for (const deviceImei of devices) {
          // Subscribe to ignition logs
          const unsubscribeIgnition = firebaseService.subscribeToIgnitionLogs(
            deviceImei,
            (logs) => {
              setIgnitionLogs(prev => ({
                ...prev,
                [deviceImei]: logs
              }));
            }
          );

          unsubscribeFunctions.push(unsubscribeIgnition);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error setting up ignition monitoring:', err);
        setError('Failed to connect to Firebase. Please check your connection.');
        setLoading(false);
      }
    };

    setupIgnitionMonitoring();

    return () => {
      unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded"></div>
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

  // Calculate summary statistics
  const allLogs = Object.values(ignitionLogs).flat();
  const onEvents = allLogs.filter(log => getIgnitionStatus(log) === 'ON').length;
  const offEvents = allLogs.filter(log => getIgnitionStatus(log) === 'OFF').length;
  const totalEvents = allLogs.length;

  return (
    <div className="space-y-6">
      {/* Ignition Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ignition ON Events</CardTitle>
            <Power className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{onEvents}</div>
            <p className="text-xs text-muted-foreground">
              Total ignition ON events
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ignition OFF Events</CardTitle>
            <PowerOff className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{offEvents}</div>
            <p className="text-xs text-muted-foreground">
              Total ignition OFF events
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{totalEvents}</div>
            <p className="text-xs text-muted-foreground">
              All ignition events recorded
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Device Ignition Status */}
      <Card>
        <CardHeader>
          <CardTitle>Device Ignition Status</CardTitle>
          <CardDescription>
            Current ignition status for all monitored devices
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {discoveredDevices.map((imei) => {
              const logs = ignitionLogs[imei] || [];
              const summary = getDeviceIgnitionSummary(logs);
              
              return (
                <div key={imei} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-5 w-5 text-gray-600" />
                    <div>
                      <div className="font-medium">IMEI: {imei}</div>
                      <div className="text-sm text-gray-600">
                        Last Change: {summary.lastChange ? formatTimestamp(summary.lastChange) : 'Never'}
                      </div>
                      <div className="text-sm text-gray-600">
                        Total Events: {summary.totalEvents}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {logs.length > 0 && getIgnitionIcon(logs[0])}
                    <div className="text-right">
                      <div className="font-medium capitalize">
                        {summary.status}
                      </div>
                      {logs.length > 0 && getStatusBadge(logs[0])}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Recent Ignition Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Ignition Logs</CardTitle>
          <CardDescription>
            Latest ignition events from all monitored devices
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {discoveredDevices.map((imei) => {
              const logs = ignitionLogs[imei] || [];
              
              if (logs.length === 0) {
                return (
                  <div key={imei} className="text-center py-8 text-gray-500">
                    <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No ignition logs found for IMEI: {imei}</p>
                  </div>
                );
              }

              return (
                <div key={imei}>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Smartphone className="h-4 w-4" />
                    IMEI: {imei}
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Voltage</TableHead>
                        <TableHead>Location</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.slice(0, 10).map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-sm">
                            {log.timestamp ? formatTimestamp(log.timestamp) : formatTimestamp(log.createdAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getIgnitionIcon(log)}
                              {getStatusBadge(log)}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-md">
                            {log.message || log.details || 'No message'}
                          </TableCell>
                          <TableCell>
                            {log.voltage ? (
                              <div className="flex items-center gap-1">
                                <Battery className="h-3 w-3" />
                                {log.voltage}V
                              </div>
                            ) : (
                              <span className="text-gray-400">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {log.location ? (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                <span className="text-xs">
                                  {log.location.latitude.toFixed(4)}, {log.location.longitude.toFixed(4)}
                                </span>
                              </div>
                            ) : log.address ? (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                <span className="text-xs">{log.address}</span>
                              </div>
                            ) : (
                              <span className="text-gray-400">N/A</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}