import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Car, 
  Edit3, 
  Save, 
  X, 
  Search, 
  Filter,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Clock
} from 'lucide-react';
import { apiService } from '@/lib/api';
import { firebaseService } from '@/lib/firebase';
import { format } from 'date-fns';

interface Device {
  id: number;
  imei: string;
  name: string;
  phoneNo: string;
  emailAddress: string;
  createdAt: string;
  updatedAt: string;
}

interface DeviceWithStatus extends Device {
  nickname: string;
  status: 'active' | 'inactive' | 'issue';
  lastActivity: Date | null;
  recentExceptions: number;
  hondaModel: string;
}

// Honda model mapping
const HONDA_MODELS = {
  'A100': 'City',
  'B100': 'Civic', 
  'C100': 'HR-V',
  'HD5501': 'BR-V'
};

// Honda model presets for quick nickname assignment
const HONDA_PRESETS = [
  { model: 'City', prefix: 'Honda City' },
  { model: 'Civic', prefix: 'Honda Civic' },
  { model: 'HR-V', prefix: 'Honda HR-V' },
  { model: 'BR-V', prefix: 'Honda BR-V' }
];

export default function FleetManagement() {
  const [devices, setDevices] = useState<DeviceWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingDevice, setEditingDevice] = useState<string | null>(null);
  const [editNickname, setEditNickname] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Load nicknames from localStorage
  const loadNicknames = (): Record<string, string> => {
    try {
      const stored = localStorage.getItem('device-nicknames');
      return stored ? JSON.parse(stored) : {};
    } catch (error) {
      console.error('Error loading nicknames:', error);
      return {};
    }
  };

  // Save nickname to localStorage
  const saveNickname = (imei: string, nickname: string) => {
    try {
      const nicknames = loadNicknames();
      nicknames[imei] = nickname;
      localStorage.setItem('device-nicknames', JSON.stringify(nicknames));
    } catch (error) {
      console.error('Error saving nickname:', error);
    }
  };

  // Get Honda model from device name
  const getHondaModel = (deviceName: string): string => {
    for (const [code, model] of Object.entries(HONDA_MODELS)) {
      if (deviceName.includes(code)) {
        return model;
      }
    }
    return 'Unknown';
  };

  // Load devices from API and enhance with Firebase status
  const loadDevices = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load devices from API
      // Load devices from API with error handling
      let apiDevices: Device[] = [];
      try {
        apiDevices = await apiService.getAllDevices();
        console.log('📱 Loaded devices from API:', apiDevices.length);
      } catch (apiError) {
        console.error('Failed to load devices from API:', apiError);
        
        // Check if it's a mixed content error
        const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);
        if (errorMessage.includes('mixed content') || errorMessage.includes('blocked')) {
          setError('⚠️ API Access Blocked: The browser is blocking HTTP API calls from this HTTPS page due to security restrictions. To resolve this, the API server needs to support HTTPS, or you can access this dashboard via HTTP instead of HTTPS.');
        } else {
          setError('Failed to load device data from API. Please check your network connection and try again.');
        }
        return;
      }

      // Load nicknames from localStorage
      const nicknames = loadNicknames();

      // Get Firebase devices for status checking
      const firebaseDevices = await firebaseService.discoverDevices();
      console.log('🔥 Firebase devices found:', firebaseDevices.length);

      // Enhance devices with status and Firebase data
      const enhancedDevices: DeviceWithStatus[] = [];
      
      for (const device of apiDevices) {
        try {
          let status: 'active' | 'inactive' | 'issue' = 'inactive';
          let lastActivity: Date | null = null;
          let recentExceptions = 0;

          // Check if device exists in Firebase
          if (firebaseDevices.includes(device.imei)) {
            // Check recent ignition activity (last 2 hours)
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            
            try {
              const ignitionLogs = await firebaseService.getIgnitionLogs(device.imei);
              const recentIgnition = ignitionLogs.find(log => {
                const logTime = log.timestamp?.toDate?.() || new Date(log.timestamp);
                return logTime > twoHoursAgo;
              });

              if (recentIgnition) {
                status = 'active';
                lastActivity = recentIgnition.timestamp?.toDate?.() || new Date(recentIgnition.timestamp);
              }

              // Check for recent exceptions
              const exceptions = await firebaseService.getExceptionLogs(device.imei);
              recentExceptions = exceptions.filter(ex => {
                const exTime = ex.timestamp?.toDate?.() || new Date(ex.timestamp);
                return exTime > twoHoursAgo;
              }).length;

              if (recentExceptions > 0) {
                status = 'issue';
              }

            } catch (fbError) {
              console.error(`Error checking Firebase data for ${device.imei}:`, fbError);
            }
          }

          const hondaModel = getHondaModel(device.name);
          const nickname = nicknames[device.imei] || '';

          enhancedDevices.push({
            ...device,
            nickname,
            status,
            lastActivity,
            recentExceptions,
            hondaModel
          });

        } catch (deviceError) {
          console.error(`Error processing device ${device.imei}:`, deviceError);
          
          // Add device with minimal data if processing fails
          enhancedDevices.push({
            ...device,
            nickname: nicknames[device.imei] || '',
            status: 'inactive',
            lastActivity: null,
            recentExceptions: 0,
            hondaModel: getHondaModel(device.name)
          });
        }
      }

      setDevices(enhancedDevices);
      setLastUpdate(new Date());
      console.log('✅ Fleet management loaded:', enhancedDevices.length, 'devices');

    } catch (error) {
      console.error('Error loading devices:', error);
      setError('Failed to load device data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Start editing nickname
  const startEditing = (device: DeviceWithStatus) => {
    setEditingDevice(device.imei);
    setEditNickname(device.nickname || `Honda ${device.hondaModel} - `);
  };

  // Save nickname
  const saveDeviceNickname = (imei: string) => {
    saveNickname(imei, editNickname);
    setDevices(prev => 
      prev.map(device => 
        device.imei === imei 
          ? { ...device, nickname: editNickname }
          : device
      )
    );
    setEditingDevice(null);
    setEditNickname('');
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingDevice(null);
    setEditNickname('');
  };

  // Apply Honda preset
  const applyHondaPreset = (device: DeviceWithStatus, preset: typeof HONDA_PRESETS[0]) => {
    const nickname = `${preset.prefix} - Owner Name`;
    setEditNickname(nickname);
  };

  // Filter devices
  const filteredDevices = devices.filter(device => {
    const matchesSearch = 
      device.imei.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.nickname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.hondaModel.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || device.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case 'issue':
        return <Badge className="bg-red-100 text-red-800">Issue</Badge>;
      default:
        return <Badge variant="secondary">Inactive</Badge>;
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'issue':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  useEffect(() => {
    loadDevices();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const deviceStats = {
    total: devices.length,
    withNicknames: devices.filter(d => d.nickname).length,
    active: devices.filter(d => d.status === 'active').length,
    withIssues: devices.filter(d => d.status === 'issue').length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
        <span className="ml-2 text-lg">Loading Honda fleet...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="max-w-md mx-auto">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          {error}
          <Button onClick={loadDevices} className="ml-2" size="sm">
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
          <h1 className="text-2xl font-bold text-gray-900">Fleet Management</h1>
          <p className="text-sm text-gray-500">
            Manage Honda vehicle nicknames and monitor fleet status
          </p>
        </div>
        <Button onClick={loadDevices} disabled={loading} className="w-fit">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Fleet Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Fleet</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{deviceStats.total}</div>
            <p className="text-xs text-gray-500">Honda vehicles</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">With Nicknames</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{deviceStats.withNicknames}</div>
            <p className="text-xs text-gray-500">Custom names</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Now</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{deviceStats.active}</div>
            <p className="text-xs text-gray-500">Recent activity</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">With Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{deviceStats.withIssues}</div>
            <p className="text-xs text-gray-500">Need attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by IMEI, name, nickname, or Honda model..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="issue">With Issues</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Device Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5 text-blue-500" />
            <CardTitle>Honda Fleet ({filteredDevices.length})</CardTitle>
          </div>
          <CardDescription>
            Last updated: {format(lastUpdate, 'MMM dd, yyyy hh:mm:ss a')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredDevices.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Car className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>No devices found matching your criteria</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>IMEI</TableHead>
                    <TableHead>Honda Model</TableHead>
                    <TableHead>Device Name</TableHead>
                    <TableHead>Nickname</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDevices.map((device) => (
                    <TableRow key={device.imei} className="hover:bg-gray-50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(device.status)}
                          {getStatusBadge(device.status)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                          {device.imei}
                        </code>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          Honda {device.hondaModel}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{device.name}</TableCell>
                      <TableCell>
                        {editingDevice === device.imei ? (
                          <div className="space-y-2">
                            <Input
                              value={editNickname}
                              onChange={(e) => setEditNickname(e.target.value)}
                              placeholder="Enter nickname..."
                              className="w-full"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveDeviceNickname(device.imei);
                                if (e.key === 'Escape') cancelEditing();
                              }}
                            />
                            <div className="flex flex-wrap gap-1">
                              {HONDA_PRESETS.map((preset) => (
                                <Button
                                  key={preset.model}
                                  size="sm"
                                  variant="outline"
                                  onClick={() => applyHondaPreset(device, preset)}
                                  className="text-xs h-6"
                                >
                                  {preset.model}
                                </Button>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => saveDeviceNickname(device.imei)}
                                className="h-7"
                              >
                                <Save className="h-3 w-3 mr-1" />
                                Save
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={cancelEditing}
                                className="h-7"
                              >
                                <X className="h-3 w-3 mr-1" />
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className={device.nickname ? 'font-medium' : 'text-gray-400 italic'}>
                              {device.nickname || 'No nickname set'}
                            </span>
                            {device.nickname && (
                              <Badge variant="secondary" className="text-xs">
                                Custom
                              </Badge>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {device.lastActivity ? (
                          <div className="text-sm">
                            <div>{format(device.lastActivity, 'MMM dd, hh:mm a')}</div>
                            {device.recentExceptions > 0 && (
                              <Badge variant="destructive" className="text-xs mt-1">
                                {device.recentExceptions} exceptions
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">No recent activity</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingDevice === device.imei ? null : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => startEditing(device)}
                            className="h-7"
                          >
                            <Edit3 className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}