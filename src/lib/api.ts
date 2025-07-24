// API service for interacting with the vehicle tracking server
// Optimized for free tier usage with smart caching and minimal calls

// Handle mixed content security by detecting protocol and providing fallbacks
const getApiBaseUrl = () => {
  // For HTTPS environments, we need to handle mixed content security
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    console.warn('Mixed content detected: HTTPS page trying to access HTTP API');
    // In production, the API should be HTTPS. For now, we'll try the HTTP endpoint
    // but provide better error handling
    return 'http://twca.trackingworld.com.pk:3000/api';
  }
  return 'http://twca.trackingworld.com.pk:3000/api';
};

const API_BASE_URL = getApiBaseUrl();

export interface Device {
  id: string;
  imei: string;
  name?: string;
  status?: string;
  lastSeen?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DeviceIMEI {
  imei: string;
  last_seen?: string;
  discovered_at: string;
}

export interface LocationData {
  id: string;
  imei: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  speed?: number;
  heading?: number;
  accuracy?: number;
  address?: string;
}

export interface DeviceDetails extends Device {
  locations?: LocationData[];
  config?: any;
  totalLocations?: number;
}

class APIService {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

  private isCacheValid(key: string): boolean {
    const cached = this.cache.get(key);
    if (!cached) return false;
    return Date.now() - cached.timestamp < this.CACHE_DURATION;
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  private getCache(key: string): any {
    const cached = this.cache.get(key);
    return cached?.data;
  }

  private async makeRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      // Handle mixed content security errors specifically
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        console.error(`Mixed content security error for ${endpoint}:`, error);
        throw new Error('API request blocked by browser security (mixed content). The API server needs to support HTTPS.');
      }
      
      console.error(`API request error for ${endpoint}:`, error);
      throw error;
    }
  }

  // Get all devices - cached for 30 minutes to optimize free tier usage
  async getAllDevices(): Promise<Device[]> {
    const cacheKey = 'all-devices';
    
    if (this.isCacheValid(cacheKey)) {
      return this.getCache(cacheKey);
    }

    try {
      const response = await this.makeRequest<{ success: boolean; data: Device[] }>('/devices');
      const devices = response.success ? response.data : [];
      this.setCache(cacheKey, devices);
      return devices;
    } catch (error) {
      console.error('Failed to fetch devices:', error);
      // Return cached data if available, even if expired
      const cached = this.getCache(cacheKey);
      return cached || [];
    }
  }

  // Get IMEI list only - optimized for minimal data usage
  async getDeviceIMEIs(): Promise<DeviceIMEI[]> {
    const cacheKey = 'device-imeis';
    
    if (this.isCacheValid(cacheKey)) {
      return this.getCache(cacheKey);
    }

    try {
      const response = await this.makeRequest<{ success: boolean; data: Device[] }>('/devices');
      const devices = response.success ? response.data : [];
      
      // Extract only IMEI and minimal metadata
      const imeiList: DeviceIMEI[] = devices.map(device => ({
        imei: device.imei,
        last_seen: device.lastSeen || device.updatedAt,
        discovered_at: new Date().toISOString()
      }));
      
      this.setCache(cacheKey, imeiList);
      return imeiList;
    } catch (error) {
      console.error('Failed to fetch device IMEIs:', error);
      // Return cached data if available, even if expired
      const cached = this.getCache(cacheKey);
      return cached || [];
    }
  }

  // Get specific device details - called only when needed (exception-triggered)
  async getDeviceByImei(imei: string): Promise<DeviceDetails | null> {
    const cacheKey = `device-${imei}`;
    
    if (this.isCacheValid(cacheKey)) {
      return this.getCache(cacheKey);
    }

    try {
      const device = await this.makeRequest<DeviceDetails>(`/devices/${imei}`);
      this.setCache(cacheKey, device);
      return device;
    } catch (error) {
      console.error(`Failed to fetch device ${imei}:`, error);
      return null;
    }
  }

  // Get device locations - called only for problem investigation
  async getDeviceLocations(imei: string, limit: number = 10): Promise<LocationData[]> {
    const cacheKey = `locations-${imei}-${limit}`;
    
    if (this.isCacheValid(cacheKey)) {
      return this.getCache(cacheKey);
    }

    try {
      const locations = await this.makeRequest<LocationData[]>(`/devices/${imei}/locations?limit=${limit}`);
      this.setCache(cacheKey, locations);
      return locations;
    } catch (error) {
      console.error(`Failed to fetch locations for device ${imei}:`, error);
      return [];
    }
  }

  // Get recent location activity across all devices - called every 15 minutes
  async getRecentLocations(limit: number = 50): Promise<LocationData[]> {
    const cacheKey = `recent-locations-${limit}`;
    
    if (this.isCacheValid(cacheKey)) {
      return this.getCache(cacheKey);
    }

    try {
      const locations = await this.makeRequest<LocationData[]>(`/location?limit=${limit}`);
      this.setCache(cacheKey, locations);
      return locations;
    } catch (error) {
      console.error('Failed to fetch recent locations:', error);
      return [];
    }
  }

  // Check if device is active based on recent location data
  isDeviceActive(locations: LocationData[], thresholdMinutes: number = 30): boolean {
    if (!locations || locations.length === 0) return false;
    
    const latestLocation = locations[0];
    if (!latestLocation?.timestamp) return false;
    
    const locationTime = new Date(latestLocation.timestamp);
    const now = new Date();
    const diffMinutes = (now.getTime() - locationTime.getTime()) / (1000 * 60);
    
    return diffMinutes <= thresholdMinutes;
  }

  // Get device activity status
  async getDeviceActivityStatus(imei: string): Promise<{
    isActive: boolean;
    lastActivity: string | null;
    locationCount: number;
  }> {
    try {
      const locations = await this.getDeviceLocations(imei, 5);
      const isActive = this.isDeviceActive(locations);
      const lastActivity = locations.length > 0 ? locations[0].timestamp : null;
      
      return {
        isActive,
        lastActivity,
        locationCount: locations.length
      };
    } catch (error) {
      console.error(`Failed to get activity status for device ${imei}:`, error);
      return {
        isActive: false,
        lastActivity: null,
        locationCount: 0
      };
    }
  }

  // Clear cache (useful for forcing refresh)
  clearCache(): void {
    this.cache.clear();
  }

  // Get cache stats for debugging
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

export const apiService = new APIService();