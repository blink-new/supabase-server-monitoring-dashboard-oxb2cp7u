import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  AlertTriangle, 
  Power, 
  Search, 
  Filter,
  RefreshCw,
  Download,
  Clock,
  FileText,
  Zap
} from 'lucide-react';
import { firebaseService } from '@/lib/firebase';
import { format } from 'date-fns';
import { parseTimestamp, formatTimestamp } from '@/lib/timestamp-utils';

interface ExceptionLog {
  id: string;
  imei: string;
  type: string;
  message: string;
  timestamp: any;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface IgnitionLog {
  id: string;
  imei: string;
  status: 'on' | 'off';
  timestamp: any;
  location?: string;
}

export default function LogsHistory() {
  const [exceptionLogs, setExceptionLogs] = useState<ExceptionLog[]>([]);
  const [ignitionLogs, setIgnitionLogs] = useState<IgnitionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [imeiFilter, setImeiFilter] = useState<string>('all');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [availableImeis, setAvailableImeis] = useState<string[]>([]);

  // Determine severity from exception type and message
  const getSeverity = (type?: string, message?: string): 'critical' | 'high' | 'medium' | 'low' => {
    const text = `${type} ${message}`.toLowerCase();
    
    if (text.includes('critical') || text.includes('server down') || text.includes('offline')) {
      return 'critical';
    }
    if (text.includes('error') || text.includes('failed') || text.includes('timeout')) {
      return 'high';
    }
    if (text.includes('warning') || text.includes('slow') || text.includes('retry')) {
      return 'medium';
    }
    return 'low';
  };

  // Load exception logs from Firebase
  const loadExceptionLogs = async () => {
    try {
      const devices = await firebaseService.discoverDevices();
      console.log('📋 Loading exception logs for devices:', devices);
      
      const allExceptions: ExceptionLog[] = [];
      
      for (const deviceId of devices) {
        try {
          const exceptions = await firebaseService.getExceptionLogs(deviceId);
          
          const deviceExceptions = exceptions.map((ex, index) => {
            console.log(`🔍 Exception timestamp debug for ${deviceId}:`, {
              timestamp: ex.timestamp,
              timestampType: typeof ex.timestamp,
              createdAt: ex.createdAt,
              createdAtType: typeof ex.createdAt
            });
            
            return {
              id: `${deviceId}-${ex.timestamp || Date.now()}-${index}`,
              imei: deviceId,
              type: ex.main || 'Exception',
              message: ex.details || 'No message',
              timestamp: ex.timestamp || ex.createdAt, // Use createdAt as fallback
              severity: getSeverity(ex.main, ex.details)
            };
          });
          
          allExceptions.push(...deviceExceptions);
        } catch (error) {
          console.error(`Error loading exceptions for device ${deviceId}:`, error);
        }
      }
      
      // Sort by timestamp (most recent first) and limit to last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentExceptions = allExceptions
        .filter(ex => {
          const exTime = parseTimestamp(ex.timestamp);
          return exTime > sevenDaysAgo;
        })
        .sort((a, b) => {
          const timeA = parseTimestamp(a.timestamp);
          const timeB = parseTimestamp(b.timestamp);
          return timeB.getTime() - timeA.getTime();
        })
        .slice(0, 500); // Limit to 500 most recent
      
      setExceptionLogs(recentExceptions);
      console.log('🚨 Exception logs loaded:', recentExceptions.length);
      
    } catch (error) {
      console.error('Error loading exception logs:', error);
      setError('Failed to load exception logs');
    }
  };

  // Load ignition logs from Firebase
  const loadIgnitionLogs = async () => {
    try {
      const devices = await firebaseService.discoverDevices();
      console.log('🔥 Loading ignition logs for devices:', devices);
      
      const allIgnition: IgnitionLog[] = [];
      
      for (const deviceId of devices) {
        try {
          const ignitionData = await firebaseService.getIgnitionLogs(deviceId);
          
          const deviceIgnition = ignitionData.map((ig, index) => {
            console.log(`🔍 Ignition timestamp debug for ${deviceId}:`, {
              timestamp: ig.timestamp,
              timestampType: typeof ig.timestamp,
              createdAt: ig.createdAt,
              createdAtType: typeof ig.createdAt
            });
            
            return {
              id: `${deviceId}-${ig.timestamp || Date.now()}-${index}`,
              imei: deviceId,
              status: ig.ignitionStatus ? 'on' : 'off',
              timestamp: ig.timestamp || ig.createdAt, // Use createdAt as fallback
              location: ig.address || undefined
            };
          });
          
          allIgnition.push(...deviceIgnition);
        } catch (error) {
          console.error(`Error loading ignition for device ${deviceId}:`, error);
        }
      }
      
      // Sort by timestamp (most recent first) and limit to last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentIgnition = allIgnition
        .filter(ig => {
          const igTime = parseTimestamp(ig.timestamp);
          return igTime > sevenDaysAgo;
        })
        .sort((a, b) => {
          const timeA = parseTimestamp(a.timestamp);
          const timeB = parseTimestamp(b.timestamp);
          return timeB.getTime() - timeA.getTime();
        })
        .slice(0, 500); // Limit to 500 most recent
      
      setIgnitionLogs(recentIgnition);
      console.log('⚡ Ignition logs loaded:', recentIgnition.length);
      
    } catch (error) {
      console.error('Error loading ignition logs:', error);
      setError('Failed to load ignition logs');
    }
  };

  // Get severity badge
  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <Badge className="bg-red-100 text-red-800">Critical</Badge>;
      case 'high':
        return <Badge className="bg-orange-100 text-orange-800">High</Badge>;
      case 'medium':
        return <Badge className="bg-yellow-100 text-yellow-800">Medium</Badge>;
      default:
        return <Badge variant="secondary">Low</Badge>;
    }
  };

  // Get ignition status badge
  const getIgnitionBadge = (status: string) => {
    return status === 'on' 
      ? <Badge className="bg-green-100 text-green-800">ON</Badge>
      : <Badge className="bg-gray-100 text-gray-800">OFF</Badge>;
  };

  // Filter exception logs
  const filteredExceptionLogs = exceptionLogs.filter(log => {
    const matchesSearch = 
      log.imei.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.message.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSeverity = severityFilter === 'all' || log.severity === severityFilter;
    const matchesImei = imeiFilter === 'all' || log.imei === imeiFilter;

    return matchesSearch && matchesSeverity && matchesImei;
  });

  // Filter ignition logs
  const filteredIgnitionLogs = ignitionLogs.filter(log => {
    const matchesSearch = 
      log.imei.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.status.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesImei = imeiFilter === 'all' || log.imei === imeiFilter;

    return matchesSearch && matchesImei;
  });

  // Export logs as JSON
  const exportLogs = (type: 'exceptions' | 'ignition') => {
    const data = type === 'exceptions' ? filteredExceptionLogs : filteredIgnitionLogs;
    const filename = `${type}-logs-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Load all data
  const loadAllData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Get available IMEIs first
      const devices = await firebaseService.discoverDevices();
      setAvailableImeis(devices);
      
      // Load both exception and ignition logs
      await Promise.all([
        loadExceptionLogs(),
        loadIgnitionLogs()
      ]);
      
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error loading logs:', error);
      setError('Failed to load logs data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
    
    // Set up real-time subscriptions
    const unsubscribeExceptions = firebaseService.subscribeToExceptions((deviceId, exceptions) => {
      const newExceptions = exceptions.slice(0, 5).map((ex, index) => ({
        id: `${deviceId}-${ex.timestamp || Date.now()}-${index}-rt`,
        imei: deviceId,
        type: ex.main || 'Exception',
        message: ex.details || 'No message',
        timestamp: ex.timestamp,
        severity: getSeverity(ex.main, ex.details)
      }));
      
      setExceptionLogs(prev => {
        const updated = [...newExceptions, ...prev];
        return updated
          .sort((a, b) => {
            const timeA = parseTimestamp(a.timestamp);
            const timeB = parseTimestamp(b.timestamp);
            return timeB.getTime() - timeA.getTime();
          })
          .slice(0, 500);
      });
    });

    const unsubscribeIgnition = firebaseService.subscribeToIgnition((deviceId, ignitionData) => {
      const newIgnition = ignitionData.slice(0, 5).map((ig, index) => ({
        id: `${deviceId}-${ig.timestamp || Date.now()}-${index}-rt`,
        imei: deviceId,
        status: ig.ignitionStatus ? 'on' : 'off',
        timestamp: ig.timestamp,
        location: ig.address || undefined
      }));
      
      setIgnitionLogs(prev => {
        const updated = [...newIgnition, ...prev];
        return updated
          .sort((a, b) => {
            const timeA = parseTimestamp(a.timestamp);
            const timeB = parseTimestamp(b.timestamp);
            return timeB.getTime() - timeA.getTime();
          })
          .slice(0, 500);
      });
    });

    return () => {
      unsubscribeExceptions();
      unsubscribeIgnition();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-lg">Loading logs history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="max-w-md mx-auto">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {error}
          <Button onClick={loadAllData} className="ml-2" size="sm">
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Logs &amp; History</h1>
          <p className="text-sm text-gray-500">
            Firebase exception and ignition logs (last 7 days)
          </p>
        </div>
        <Button onClick={loadAllData} disabled={loading} className="w-fit">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search logs by IMEI, type, message, or status..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <Select value={imeiFilter} onValueChange={setImeiFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All IMEIs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All IMEIs</SelectItem>
                  {availableImeis.map(imei => (
                    <SelectItem key={imei} value={imei}>
                      {imei}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={severityFilter} onValueChange={setSeverityFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="All Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Logs Tabs */}
      <Tabs defaultValue="exceptions" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="exceptions" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Exception Logs ({filteredExceptionLogs.length})
          </TabsTrigger>
          <TabsTrigger value="ignition" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Ignition Logs ({filteredIgnitionLogs.length})
          </TabsTrigger>
        </TabsList>

        {/* Exception Logs Tab */}
        <TabsContent value="exceptions">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-red-500" />
                  <CardTitle>Exception Logs</CardTitle>
                  <Badge variant="outline">{filteredExceptionLogs.length}</Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => exportLogs('exceptions')}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </div>
              <CardDescription>
                Firebase exception logs - ground truth data for operations
                <br />
                Last updated: {format(lastUpdate, 'MMM dd, yyyy hh:mm:ss a')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredExceptionLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No exception logs found matching your criteria</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>IMEI</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExceptionLogs.slice(0, 100).map((log, index) => (
                        <TableRow key={`exception-${log.imei}-${formatTimestamp(log.timestamp, 'yyyy-MM-dd-HH-mm-ss')}-${index}`} className="hover:bg-gray-50">
                          <TableCell className="font-mono text-sm">
                            {formatTimestamp(log.timestamp, 'MMM dd, hh:mm:ss a')}
                          </TableCell>
                          <TableCell>
                            <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                              {log.imei}
                            </code>
                          </TableCell>
                          <TableCell>
                            {getSeverityBadge(log.severity)}
                          </TableCell>
                          <TableCell className="font-medium">{log.type}</TableCell>
                          <TableCell className="max-w-md truncate" title={log.message}>
                            {log.message}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filteredExceptionLogs.length > 100 && (
                    <p className="text-sm text-gray-500 text-center mt-4">
                      Showing first 100 of {filteredExceptionLogs.length} logs
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Ignition Logs Tab */}
        <TabsContent value="ignition">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Power className="h-5 w-5 text-green-500" />
                  <CardTitle>Ignition Logs</CardTitle>
                  <Badge variant="outline">{filteredIgnitionLogs.length}</Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => exportLogs('ignition')}
                  className="flex items-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </div>
              <CardDescription>
                Firebase ignition logs - vehicle on/off status tracking
                <br />
                Last updated: {format(lastUpdate, 'MMM dd, yyyy hh:mm:ss a')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {filteredIgnitionLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Power className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No ignition logs found matching your criteria</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>IMEI</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Location</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredIgnitionLogs.slice(0, 100).map((log, index) => (
                        <TableRow key={`ignition-${log.imei}-${formatTimestamp(log.timestamp, 'yyyy-MM-dd-HH-mm-ss')}-${index}`} className="hover:bg-gray-50">
                          <TableCell className="font-mono text-sm">
                            {formatTimestamp(log.timestamp, 'MMM dd, hh:mm:ss a')}
                          </TableCell>
                          <TableCell>
                            <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                              {log.imei}
                            </code>
                          </TableCell>
                          <TableCell>
                            {getIgnitionBadge(log.status)}
                          </TableCell>
                          <TableCell className="text-sm text-gray-600">
                            {log.location || 'Not available'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {filteredIgnitionLogs.length > 100 && (
                    <p className="text-sm text-gray-500 text-center mt-4">
                      Showing first 100 of {filteredIgnitionLogs.length} logs
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Exceptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{exceptionLogs.length}</div>
            <p className="text-xs text-gray-500">Last 7 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Critical Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-800">
              {exceptionLogs.filter(log => log.severity === 'critical').length}
            </div>
            <p className="text-xs text-gray-500">Need attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Ignition Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{ignitionLogs.length}</div>
            <p className="text-xs text-gray-500">Last 7 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Devices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{availableImeis.length}</div>
            <p className="text-xs text-gray-500">With Firebase data</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}