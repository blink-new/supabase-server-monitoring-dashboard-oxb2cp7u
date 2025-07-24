import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Edit3, Save, X, Smartphone, AlertCircle, Users, Phone, Calendar, Clock } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

interface Device {
  id: number;
  imei: string;
  name: string;
  phoneNo: string;
  emailAddress: string;
  createdAt: string;
  updatedAt: string;
}

interface ApiResponse {
  success: boolean;
  data: Device[];
}

const DeviceManagement: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nicknames, setNicknames] = useState<Record<string, string>>({});
  const [editingImei, setEditingImei] = useState<string | null>(null);
  const [tempNickname, setTempNickname] = useState('');
  const isMobile = useIsMobile();

  // Load nicknames from localStorage on component mount
  useEffect(() => {
    const savedNicknames = localStorage.getItem('deviceNicknames');
    if (savedNicknames) {
      try {
        setNicknames(JSON.parse(savedNicknames));
      } catch (error) {
        console.error('Error parsing saved nicknames:', error);
      }
    }
  }, []);

  // Fetch devices from API
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('http://twca.trackingworld.com.pk:3000/api/devices');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result: ApiResponse = await response.json();
        
        if (!result.success) {
          throw new Error('API returned unsuccessful response');
        }

        if (!Array.isArray(result.data)) {
          throw new Error('Invalid response format: data is not an array');
        }

        setDevices(result.data);
        console.log(`✅ Loaded ${result.data.length} devices from API`);
        
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(`Failed to fetch devices: ${errorMessage}`);
        console.error('Error fetching devices:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDevices();
  }, []);

  // Save nicknames to localStorage whenever nicknames state changes
  const saveNicknamesToStorage = (newNicknames: Record<string, string>) => {
    localStorage.setItem('deviceNicknames', JSON.stringify(newNicknames));
  };

  // Start editing a nickname
  const startEditing = (imei: string, currentNickname: string) => {
    setEditingImei(imei);
    setTempNickname(currentNickname);
  };

  // Save nickname
  const saveNickname = (imei: string) => {
    const newNicknames = {
      ...nicknames,
      [imei]: tempNickname.trim()
    };
    
    setNicknames(newNicknames);
    saveNicknamesToStorage(newNicknames);
    setEditingImei(null);
    setTempNickname('');
    
    console.log(`💾 Saved nickname for ${imei}: "${tempNickname.trim()}"`);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingImei(null);
    setTempNickname('');
  };

  // Get display name (nickname if exists, otherwise device name)
  const getDisplayName = (device: Device): string => {
    return nicknames[device.imei] || device.name;
  };

  // Format date for display
  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  // Mobile card component for individual devices
  const DeviceCard: React.FC<{ device: Device }> = ({ device }) => (
    <Card className="w-full">
      <CardContent className="p-4">
        <div className="space-y-3">
          {/* Header with IMEI and Custom badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Smartphone className="h-4 w-4 text-gray-500" />
              <span className="font-mono text-sm font-medium">{device.imei}</span>
            </div>
            {nicknames[device.imei] && (
              <Badge variant="outline" className="text-xs">
                Custom
              </Badge>
            )}
          </div>

          {/* Device Name */}
          <div>
            <p className="text-sm text-gray-500">Device Name</p>
            <p className="font-medium">{device.name}</p>
          </div>

          {/* Nickname Section */}
          <div>
            <p className="text-sm text-gray-500">Nickname</p>
            {editingImei === device.imei ? (
              <div className="flex items-center space-x-2 mt-1">
                <Input
                  value={tempNickname}
                  onChange={(e) => setTempNickname(e.target.value)}
                  placeholder="Enter nickname..."
                  className="h-8 text-sm flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      saveNickname(device.imei);
                    } else if (e.key === 'Escape') {
                      cancelEditing();
                    }
                  }}
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={() => saveNickname(device.imei)}
                  className="h-8 px-2"
                >
                  <Save className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={cancelEditing}
                  className="h-8 px-2"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between mt-1">
                <span className={`${nicknames[device.imei] ? 'text-blue-600 font-medium' : 'text-gray-500 italic'}`}>
                  {nicknames[device.imei] || 'No nickname set'}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => startEditing(device.imei, nicknames[device.imei] || '')}
                  className="h-8 px-2"
                >
                  <Edit3 className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>

          {/* Additional Info */}
          <div className="grid grid-cols-2 gap-4 pt-2 border-t">
            <div className="flex items-center space-x-2">
              <Phone className="h-3 w-3 text-gray-400" />
              <span className="text-xs text-gray-600">{device.phoneNo || 'N/A'}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Calendar className="h-3 w-3 text-gray-400" />
              <span className="text-xs text-gray-600">{formatDate(device.createdAt)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex items-center space-x-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="text-lg">Loading devices...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardContent className="py-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (devices.length === 0) {
    return (
      <Card className="w-full">
        <CardContent className="flex items-center justify-center py-12">
          <div className="text-center">
            <Smartphone className="h-12 w-12 mx-auto text-gray-400 mb-4" />
            <p className="text-lg text-gray-600">No devices found</p>
            <p className="text-sm text-gray-500">Check your API connection or try refreshing the page</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
          <div className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <CardTitle className="text-lg sm:text-xl">Device Management</CardTitle>
          </div>
          <Badge variant="secondary" className="flex items-center space-x-1 w-fit">
            <Smartphone className="h-3 w-3" />
            <span>{devices.length} Devices</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {/* Mobile Layout */}
        {isMobile ? (
          <div className="space-y-4">
            {devices.map((device) => (
              <DeviceCard key={device.id} device={device} />
            ))}
          </div>
        ) : (
          /* Desktop Table Layout */
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[180px]">IMEI</TableHead>
                  <TableHead className="min-w-[150px]">Device Name</TableHead>
                  <TableHead className="min-w-[200px]">Nickname</TableHead>
                  <TableHead className="min-w-[120px]">Phone</TableHead>
                  <TableHead className="min-w-[100px]">Created</TableHead>
                  <TableHead className="min-w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((device) => (
                  <TableRow key={device.id} className="hover:bg-gray-50">
                    <TableCell className="font-mono text-sm">
                      {device.imei}
                    </TableCell>
                    <TableCell className="font-medium">
                      {device.name}
                    </TableCell>
                    <TableCell>
                      {editingImei === device.imei ? (
                        <div className="flex items-center space-x-2 min-w-[200px]">
                          <Input
                            value={tempNickname}
                            onChange={(e) => setTempNickname(e.target.value)}
                            placeholder="Enter nickname..."
                            className="h-8 text-sm flex-1"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                saveNickname(device.imei);
                              } else if (e.key === 'Escape') {
                                cancelEditing();
                              }
                            }}
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={() => saveNickname(device.imei)}
                            className="h-8 px-2 shrink-0"
                          >
                            <Save className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={cancelEditing}
                            className="h-8 px-2 shrink-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between min-w-[200px]">
                          <span className={`${nicknames[device.imei] ? 'text-blue-600 font-medium' : 'text-gray-500 italic'} truncate mr-2`}>
                            {nicknames[device.imei] || 'No nickname set'}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEditing(device.imei, nicknames[device.imei] || '')}
                            className="h-8 px-2 shrink-0"
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {device.phoneNo || 'N/A'}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {formatDate(device.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-1">
                        {nicknames[device.imei] && (
                          <Badge variant="outline" className="text-xs">
                            Custom
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        
        {/* Summary Information */}
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-gray-500" />
              <span><span className="font-medium">Total Devices:</span> {devices.length}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Edit3 className="h-4 w-4 text-gray-500" />
              <span><span className="font-medium">With Nicknames:</span> {Object.keys(nicknames).filter(imei => nicknames[imei]).length}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-gray-500" />
              <span><span className="font-medium">Last Updated:</span> {new Date().toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default DeviceManagement;