import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { AlertTriangle, CheckCircle, XCircle, Clock, Smartphone, Eye, Download } from 'lucide-react';
import { firebaseService, ExceptionLog, DeviceStatus } from '../lib/firebase';
import { AnalyticsService, AnalyticsFilters } from '../lib/analytics';
import { AdvancedFilters } from './AdvancedFilters';
import { DeviceDetailModal } from './DeviceDetailModal';
import { format } from 'date-fns';

export function ExceptionMonitoringTab() {
  const [deviceStatuses, setDeviceStatuses] = useState<Record<string, DeviceStatus>>({});
  const [allExceptions, setAllExceptions] = useState<ExceptionLog[]>([]);
  const [filteredExceptions, setFilteredExceptions] = useState<any[]>([]);
  const [availableImeis, setAvailableImeis] = useState<string[]>([]);
  const [discoveredDevices, setDiscoveredDevices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [filters, setFilters] = useState<AnalyticsFilters>({});

  const formatTimestamp = useCallback((timestamp: string | any): string => {
    try {
      const date = firebaseService.parseTimestamp(timestamp);
      return format(date, 'MMM dd, yyyy hh:mm:ss a');
    } catch (error) {
      return 'Invalid date';
    }
  }, []);

  const getStatusColor = useCallback((status: DeviceStatus['status']) => {
    switch (status) {
      case 'healthy': return 'bg-green-500';
      case 'warning': return 'bg-yellow-500';
      case 'critical': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  }, []);

  const getStatusIcon = useCallback((status: DeviceStatus['status']) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'critical': return <XCircle className="h-4 w-4 text-red-600" />;
      default: return <Clock className="h-4 w-4 text-gray-600" />;
    }
  }, []);

  const getSeverityBadge = useCallback((main: string | undefined) => {
    const mainText = (main || '').toLowerCase();
    if (mainText === 'server down' || mainText.includes('critical')) {
      return <Badge variant="destructive">Critical</Badge>;
    }
    if (mainText.includes('retry') || mainText.includes('warning')) {
      return <Badge variant="secondary">Warning</Badge>;
    }
    return <Badge variant="outline">Info</Badge>;
  }, []);

  // Helper function to determine severity
  const getSeverityFromExceptionType = useCallback((exceptionType: string): string => {
    const type = exceptionType.toLowerCase();
    if (type.includes('critical') || type.includes('server down') || type.includes('offline')) {
      return 'critical';
    } else if (type.includes('warning') || type.includes('degraded') || type.includes('retry')) {
      return 'warning';
    } else {
      return 'info';
    }
  }, []);

  // Handle filter changes
  const handleFiltersChange = useCallback(async (newFilters: AnalyticsFilters) => {
    setFilters(newFilters);
    try {
      // Convert Firebase exceptions to display format for filtering
      const displayExceptions = allExceptions.map(exception => ({
        id: exception.id,
        imei: exception.deviceImei,
        exception_type: exception.main || 'Unknown',
        correlation_result: exception.details || 'No details available',
        created_at: exception.createdAt?.toDate()?.toISOString() || exception.timestamp || new Date().toISOString(),
        timestamp: exception.timestamp,
        main: exception.main,
        details: exception.details
      }));

      // Apply client-side filtering
      let filtered = displayExceptions;

      // Date range filter
      if (newFilters.dateRange) {
        filtered = filtered.filter(log => {
          const logDate = new Date(log.created_at);
          return logDate >= newFilters.dateRange!.start && logDate <= newFilters.dateRange!.end;
        });
      }

      // IMEI filter
      if (newFilters.imeis && newFilters.imeis.length > 0) {
        filtered = filtered.filter(log => newFilters.imeis!.includes(log.imei));
      }

      // Search query filter
      if (newFilters.searchQuery) {
        const query = newFilters.searchQuery.toLowerCase();
        filtered = filtered.filter(log => 
          log.exception_type.toLowerCase().includes(query) ||
          log.correlation_result.toLowerCase().includes(query) ||
          log.imei.toLowerCase().includes(query)
        );
      }

      // Severity filter
      if (newFilters.severityLevels && newFilters.severityLevels.length > 0) {
        filtered = filtered.filter(log => {
          const severity = getSeverityFromExceptionType(log.exception_type);
          return newFilters.severityLevels!.includes(severity);
        });
      }

      setFilteredExceptions(filtered);
    } catch (error) {
      console.error('Error filtering exceptions:', error);
    }
  }, [allExceptions, getSeverityFromExceptionType]);

  // Load all exceptions and set up real-time subscriptions
  useEffect(() => {
    const unsubscribeFunctions: (() => void)[] = [];
    
    const setupExceptionMonitoring = async () => {
      try {
        setLoading(true);
        setError(null);

        // Discover all devices in Firebase
        const devices = await firebaseService.discoverDevices();
        setDiscoveredDevices(devices);
        console.log(`Setting up monitoring for ${devices.length} discovered devices:`, devices);

        // Load initial data
        const exceptions = await firebaseService.getExceptionLogs();
        setAllExceptions(exceptions);

        // Get unique IMEIs
        const imeis = [...new Set(exceptions.map(e => e.deviceImei).filter(Boolean))];
        setAvailableImeis(imeis);

        // Convert Firebase exceptions to display format for filtering
        const displayExceptions = exceptions.map(exception => ({
          id: exception.id,
          imei: exception.deviceImei,
          exception_type: exception.main || 'Unknown',
          correlation_result: exception.details || 'No details available',
          created_at: exception.createdAt?.toDate()?.toISOString() || exception.timestamp || new Date().toISOString(),
          timestamp: exception.timestamp,
          main: exception.main,
          details: exception.details
        }));
        
        setFilteredExceptions(displayExceptions);

        // Set up real-time subscriptions for all discovered devices
        for (const deviceImei of devices) {
          const unsubscribeExceptions = firebaseService.subscribeToExceptionLogs(
            deviceImei,
            (logs) => {
              // Update device status
              setDeviceStatuses(prev => {
                const ignitionLogs = []; // We'll get these from ignition tab
                const deviceStatus = firebaseService.getDeviceStatus(deviceImei, logs, ignitionLogs);
                return {
                  ...prev,
                  [deviceImei]: deviceStatus
                };
              });

              // Update all exceptions
              setAllExceptions(prev => {
                const otherExceptions = prev.filter(e => e.deviceImei !== deviceImei);
                return [...otherExceptions, ...logs].sort((a, b) => {
                  const aTime = new Date(a.timestamp || a.createdAt?.toDate()).getTime();
                  const bTime = new Date(b.timestamp || b.createdAt?.toDate()).getTime();
                  return bTime - aTime;
                });
              });

              // Update filtered data with new Firebase data
              const updatedDisplayExceptions = logs.map(exception => ({
                id: exception.id,
                imei: exception.deviceImei,
                exception_type: exception.main || 'Unknown',
                correlation_result: exception.details || 'No details available',
                created_at: exception.createdAt?.toDate()?.toISOString() || exception.timestamp || new Date().toISOString(),
                timestamp: exception.timestamp,
                main: exception.main,
                details: exception.details
              }));
              
              setFilteredExceptions(prev => {
                const otherExceptions = prev.filter(e => e.imei !== deviceImei);
                return [...otherExceptions, ...updatedDisplayExceptions].sort((a, b) => {
                  const aTime = new Date(a.created_at).getTime();
                  const bTime = new Date(b.created_at).getTime();
                  return bTime - aTime;
                });
              });
            }
          );

          unsubscribeFunctions.push(unsubscribeExceptions);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error setting up exception monitoring:', err);
        setError('Failed to connect to Firebase. Please check your connection.');
        setLoading(false);
      }
    };

    setupExceptionMonitoring();

    return () => {
      unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    };
  }, []); // Remove handleFiltersChange dependency since we're not using it anymore

  const acknowledgeAlert = useCallback((deviceImei: string) => {
    // TODO: Implement alert acknowledgment in Supabase
    console.log(`Acknowledging alerts for device: ${deviceImei}`);
  }, []);

  const exportExceptions = useCallback(async () => {
    try {
      const count = await AnalyticsService.exportFilteredData(filters, 'exceptions');
      console.log(`Exported ${count} exception records`);
    } catch (error) {
      console.error('Error exporting exceptions:', error);
    }
  }, [filters]);

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

  const criticalDevices = Object.values(deviceStatuses).filter(d => d.status === 'critical');
  const warningDevices = Object.values(deviceStatuses).filter(d => d.status === 'warning');
  const healthyDevices = Object.values(deviceStatuses).filter(d => d.status === 'healthy');

  return (
    <div className="space-y-6">
      {/* Device Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Devices</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{criticalDevices.length}</div>
            <p className="text-xs text-muted-foreground">
              Devices with critical exceptions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warning Devices</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{warningDevices.length}</div>
            <p className="text-xs text-muted-foreground">
              Devices with warnings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Healthy Devices</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{healthyDevices.length}</div>
            <p className="text-xs text-muted-foreground">
              Devices operating normally
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Critical Alerts */}
      {criticalDevices.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800 flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Critical Alerts
            </CardTitle>
            <CardDescription className="text-red-700">
              Devices requiring immediate attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {criticalDevices.map((device) => (
                <div key={device.imei} className="flex items-center justify-between p-3 bg-white rounded-lg border border-red-200">
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-5 w-5 text-red-600" />
                    <div>
                      <div className="font-medium">IMEI: {device.imei}</div>
                      <div className="text-sm text-gray-600">
                        Last Exception: {device.lastExceptionTime ? formatTimestamp(device.lastExceptionTime) : 'Never'}
                      </div>
                      <div className="text-sm text-red-600">
                        {device.criticalExceptions} critical exceptions
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setSelectedDevice(device.imei)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Details
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => acknowledgeAlert(device.imei)}
                    >
                      Acknowledge
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Advanced Filters */}
      <AdvancedFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        availableImeis={availableImeis}
      />

      {/* Exception Logs Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Exception Logs</CardTitle>
              <CardDescription>
                {filteredExceptions.length} exceptions found
              </CardDescription>
            </div>
            <Button variant="outline" onClick={exportExceptions} disabled={filteredExceptions.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredExceptions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No exception logs found matching your filters</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>IMEI</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredExceptions.map((log, index) => (
                  <TableRow key={`${log.imei}-${index}`}>
                    <TableCell className="font-mono text-sm">
                      {format(new Date(log.created_at), 'MMM dd, yyyy hh:mm:ss a')}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {log.imei}
                    </TableCell>
                    <TableCell>
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                        {log.exception_type || 'Unknown'}
                      </code>
                    </TableCell>
                    <TableCell>
                      {getSeverityBadge(log.exception_type)}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="truncate" title={log.correlation_result || 'No details available'}>
                        {log.correlation_result || 'No details available'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedDevice(log.imei)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Device Detail Modal */}
      <DeviceDetailModal
        isOpen={!!selectedDevice}
        onClose={() => setSelectedDevice(null)}
        imei={selectedDevice}
      />
    </div>
  );
}