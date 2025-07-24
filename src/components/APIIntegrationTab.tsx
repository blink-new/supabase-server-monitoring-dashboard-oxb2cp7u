import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  RefreshCw, 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock,
  Database,
  Zap,
  TrendingUp,
  MapPin
} from 'lucide-react';
import { correlationService, DeviceInventoryRecord, CorrelationLog } from '@/lib/correlation';
import { apiService } from '@/lib/api';

export function APIIntegrationTab() {
  const [deviceInventory, setDeviceInventory] = useState<DeviceInventoryRecord[]>([]);
  const [correlationLogs, setCorrelationLogs] = useState<CorrelationLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const [inventory, logs] = await Promise.all([
        correlationService.getDeviceInventory(),
        correlationService.getCorrelationLogs(20)
      ]);
      
      setDeviceInventory(inventory);
      setCorrelationLogs(logs);
    } catch (err) {
      console.error('Failed to load API integration data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Manual full sync (for initial setup or troubleshooting)
  const syncDeviceInventory = useCallback(async () => {
    try {
      setIsSyncing(true);
      setError(null);
      
      const result = await correlationService.manualFullSync();
      setLastSync(new Date());
      
      if (!result.success) {
        setError(result.message);
      }
      
      // Reload data after sync
      await loadData();
    } catch (err) {
      console.error('Manual sync failed:', err);
      setError('Manual sync failed. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  }, [loadData]);

  // Manual device check
  const manualDeviceCheck = useCallback(async (imei: string) => {
    try {
      await correlationService.manualDeviceCheck(imei);
      await loadData(); // Reload data after manual check
    } catch (err) {
      console.error(`Manual check failed for ${imei}:`, err);
      setError(`Manual check failed for ${imei}`);
    }
  }, [loadData]);

  useEffect(() => {
    loadData();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Calculate summary stats
  const summaryStats = React.useMemo(() => {
    const total = deviceInventory.length;
    const activeAPI = deviceInventory.filter(d => d.is_active_api).length;
    const activeFirebase = deviceInventory.filter(d => d.is_active_firebase).length;
    const healthy = deviceInventory.filter(d => d.health_score >= 80).length;
    const warning = deviceInventory.filter(d => d.health_score >= 50 && d.health_score < 80).length;
    const critical = deviceInventory.filter(d => d.health_score < 50).length;
    
    return { total, activeAPI, activeFirebase, healthy, warning, critical };
  }, [deviceInventory]);

  const getHealthBadge = (score: number) => {
    if (score >= 80) return <Badge className="bg-green-100 text-green-800">Healthy</Badge>;
    if (score >= 50) return <Badge className="bg-yellow-100 text-yellow-800">Warning</Badge>;
    return <Badge className="bg-red-100 text-red-800">Critical</Badge>;
  };

  const getCorrelationBadge = (result: string) => {
    switch (result) {
      case 'confirmed':
        return <Badge className="bg-green-100 text-green-800">Confirmed</Badge>;
      case 'conflicted':
        return <Badge className="bg-red-100 text-red-800">Conflicted</Badge>;
      case 'no_data':
        return <Badge className="bg-gray-100 text-gray-800">No Data</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800">Unknown</Badge>;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.round(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.round(diffMins / 60)}h ago`;
    return `${Math.round(diffMins / 1440)}d ago`;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center space-x-2">
            <RefreshCw className="h-6 w-6 animate-spin" />
            <span>Loading API integration data...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with sync controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">API Integration</h2>
          <p className="text-muted-foreground">
            Event-driven device monitoring - API calls triggered by Firebase exceptions only
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {lastSync && (
            <span className="text-sm text-muted-foreground">
              Last sync: {formatTimeAgo(lastSync.toISOString())}
            </span>
          )}
          <Button 
            onClick={syncDeviceInventory} 
            disabled={isSyncing}
            size="sm"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Manual Sync
              </>
            )}
          </Button>
        </div>
      </div>

      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Devices</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summaryStats.total}</div>
            <p className="text-xs text-muted-foreground">
              Tracked in inventory
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">API Active</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summaryStats.activeAPI}</div>
            <p className="text-xs text-muted-foreground">
              Active via API data
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Healthy Devices</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summaryStats.healthy}</div>
            <p className="text-xs text-muted-foreground">
              Health score ≥ 80%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Issues</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summaryStats.critical}</div>
            <p className="text-xs text-muted-foreground">
              Health score &lt; 50%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="inventory" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inventory">Device Inventory</TabsTrigger>
          <TabsTrigger value="correlation">Correlation Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Device Inventory</CardTitle>
              <CardDescription>
                Real-time device status combining API data and Firebase exceptions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {deviceInventory.length === 0 ? (
                <div className="text-center py-8">
                  <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No devices found. Devices will be automatically discovered when Firebase exceptions occur, or click "Manual Sync" for initial setup.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IMEI</TableHead>
                      <TableHead>Health Score</TableHead>
                      <TableHead>API Status</TableHead>
                      <TableHead>Firebase Status</TableHead>
                      <TableHead>Last Activity</TableHead>
                      <TableHead>Locations</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deviceInventory.map((device) => (
                      <TableRow key={device.id}>
                        <TableCell className="font-medium">
                          {device.imei}
                          {device.name && (
                            <div className="text-sm text-muted-foreground">{device.name}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Progress value={device.health_score} className="w-16" />
                            <span className="text-sm">{device.health_score}%</span>
                          </div>
                          {getHealthBadge(device.health_score)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {device.is_active_api ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                            <span className="text-sm">
                              {device.is_active_api ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          {device.last_seen_api && (
                            <div className="text-xs text-muted-foreground">
                              {formatTimeAgo(device.last_seen_api)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {device.is_active_firebase ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-600" />
                            )}
                            <span className="text-sm">
                              {device.is_active_firebase ? 'Active' : 'Issues'}
                            </span>
                          </div>
                          {device.last_exception_type && (
                            <div className="text-xs text-muted-foreground">
                              {device.last_exception_type}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">
                              {device.last_seen_api ? formatTimeAgo(device.last_seen_api) : 'Never'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{device.location_count}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => manualDeviceCheck(device.imei)}
                          >
                            <Zap className="h-3 w-3 mr-1" />
                            Check
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="correlation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Correlation Logs</CardTitle>
              <CardDescription>
                History of correlations between Firebase exceptions and API data
              </CardDescription>
            </CardHeader>
            <CardContent>
              {correlationLogs.length === 0 ? (
                <div className="text-center py-8">
                  <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No correlation logs yet. Logs will appear when exceptions are correlated with API data.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>IMEI</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>API Status</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {correlationLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div className="text-sm">{formatTimeAgo(log.created_at)}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              year: 'numeric', 
                              hour: 'numeric', 
                              minute: '2-digit', 
                              second: '2-digit', 
                              hour12: true 
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{log.imei}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {log.correlation_type.replace('_', ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {getCorrelationBadge(log.correlation_result)}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            className={
                              log.api_status === 'success' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }
                          >
                            {log.api_status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm max-w-md truncate" title={log.notes || ''}>
                            {log.notes || 'No notes'}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}