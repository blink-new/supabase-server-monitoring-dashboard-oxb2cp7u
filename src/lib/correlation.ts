// Correlation service to link Firebase exceptions with API data
// Optimized for free tier usage with smart triggering

import { supabase } from './supabase';
import { apiService, Device, DeviceDetails } from './api';
import { ExceptionLog } from './firebase';

export interface DeviceInventoryRecord {
  id: string;
  imei: string;
  name?: string;
  status?: string;
  last_seen_api?: string;
  last_seen_firebase?: string;
  is_active_api: boolean;
  is_active_firebase: boolean;
  location_count: number;
  exception_count: number;
  last_exception_type?: string;
  health_score: number;
  created_at: string;
  updated_at: string;
}

export interface CorrelationLog {
  id: string;
  imei: string;
  correlation_type: 'exception_triggered' | 'scheduled_check' | 'manual';
  firebase_exception_id?: string;
  api_response: any;
  api_status: 'success' | 'error' | 'timeout';
  correlation_result: 'confirmed' | 'conflicted' | 'no_data';
  notes?: string;
  created_at: string;
}

class CorrelationService {
  private knownIMEIs = new Set<string>();
  private lastIMEIRefresh = 0;
  private readonly IMEI_REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour

  // Load known IMEIs from database (called once per hour)
  private async refreshKnownIMEIs(): Promise<void> {
    const now = Date.now();
    if (now - this.lastIMEIRefresh < this.IMEI_REFRESH_INTERVAL) {
      return;
    }

    try {
      console.log('Refreshing known IMEIs from database...');
      const { data, error } = await supabase
        .from('device_inventory')
        .select('imei');

      if (error) {
        console.error('Failed to refresh known IMEIs:', error);
        return;
      }

      this.knownIMEIs.clear();
      data?.forEach(record => this.knownIMEIs.add(record.imei));
      this.lastIMEIRefresh = now;
      
      console.log(`Refreshed ${this.knownIMEIs.size} known IMEIs from database`);
    } catch (error) {
      console.error('Error refreshing known IMEIs:', error);
    }
  }

  // Check if IMEI is known (with automatic refresh)
  private async isIMEIKnown(imei: string): Promise<boolean> {
    await this.refreshKnownIMEIs();
    return this.knownIMEIs.has(imei);
  }

  // Update device inventory record
  private async updateDeviceInventory(device: Device): Promise<void> {
    try {
      // Get activity status from API
      const activityStatus = await apiService.getDeviceActivityStatus(device.imei);
      
      // Calculate health score based on activity
      const healthScore = this.calculateHealthScore(activityStatus.isActive, activityStatus.locationCount);
      
      const deviceData = {
        imei: device.imei,
        name: device.name || null,
        status: device.status || 'unknown',
        last_seen_api: activityStatus.lastActivity ? new Date(activityStatus.lastActivity).toISOString() : null,
        is_active_api: activityStatus.isActive,
        location_count: activityStatus.locationCount,
        health_score: healthScore,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('device_inventory')
        .upsert(deviceData, { onConflict: 'imei' });

      if (error) {
        console.error(`Failed to update device inventory for ${device.imei}:`, error);
      }
    } catch (error) {
      console.error(`Error updating device inventory for ${device.imei}:`, error);
    }
  }

  // Event-driven correlation - triggered by Firebase exceptions only
  async correlateExceptionEventDriven(exceptionLog: ExceptionLog): Promise<void> {
    if (!exceptionLog.deviceImei) {
      console.log('Exception log missing deviceImei, skipping correlation');
      return;
    }

    try {
      console.log(`Event-driven correlation for device ${exceptionLog.deviceImei}: ${exceptionLog.main}`);
      
      // Check if this IMEI is known in our system
      const isKnown = await this.isIMEIKnown(exceptionLog.deviceImei);
      
      let correlationResult: 'confirmed' | 'conflicted' | 'no_data' = 'no_data';
      let apiResponse: any = null;
      let notes = '';
      
      if (!isKnown) {
        // NEW IMEI DISCOVERED - Always fetch API data for new devices
        console.log(`🆕 New IMEI discovered: ${exceptionLog.deviceImei} - fetching API data...`);
        
        try {
          const deviceDetails = await apiService.getDeviceByImei(exceptionLog.deviceImei);
          const activityStatus = await apiService.getDeviceActivityStatus(exceptionLog.deviceImei);
          
          apiResponse = { device: deviceDetails, activity: activityStatus };
          correlationResult = deviceDetails ? 'confirmed' : 'no_data';
          notes = deviceDetails 
            ? `New IMEI discovered - device found in API and added to inventory`
            : `New IMEI discovered - device not found in API`;
            
          // Add new device to inventory
          if (deviceDetails) {
            await this.updateDeviceInventory(deviceDetails);
            this.knownIMEIs.add(exceptionLog.deviceImei); // Update local cache
          }
          
        } catch (error) {
          apiResponse = { error: error.message };
          correlationResult = 'no_data';
          notes = `New IMEI discovered - API call failed: ${error.message}`;
        }
        
      } else {
        // KNOWN IMEI - Only make API call for critical exceptions
        const isCritical = this.isCriticalException(exceptionLog);
        
        if (isCritical) {
          console.log(`🚨 Critical exception for known IMEI ${exceptionLog.deviceImei} - fetching API data...`);
          
          try {
            const deviceDetails = await apiService.getDeviceByImei(exceptionLog.deviceImei);
            const activityStatus = await apiService.getDeviceActivityStatus(exceptionLog.deviceImei);
            
            apiResponse = { device: deviceDetails, activity: activityStatus };
            correlationResult = this.determineCorrelationResult(exceptionLog, deviceDetails, activityStatus);
            notes = this.generateCorrelationNotes(exceptionLog, deviceDetails, activityStatus);
            
          } catch (error) {
            apiResponse = { error: error.message };
            correlationResult = 'no_data';
            notes = `Critical exception for known IMEI - API call failed: ${error.message}`;
          }
          
        } else {
          // Non-critical exception for known IMEI - no API call needed
          apiResponse = { cached_status: 'known_imei_non_critical' };
          correlationResult = 'confirmed';
          notes = `Non-critical exception for known IMEI - no API call made (event-driven optimization)`;
        }
      }
      
      // Log the correlation
      await this.logCorrelation({
        imei: exceptionLog.deviceImei,
        correlation_type: 'exception_triggered',
        firebase_exception_id: exceptionLog.id,
        api_response: apiResponse,
        api_status: apiResponse?.error ? 'error' : (apiResponse ? 'success' : 'no_data'),
        correlation_result: correlationResult,
        notes
      });

      // Always update device inventory with Firebase data
      await this.updateDeviceWithFirebaseData(exceptionLog.deviceImei, exceptionLog);
      
    } catch (error) {
      console.error(`Event-driven correlation failed for device ${exceptionLog.deviceImei}:`, error);
      
      // Log the failed correlation
      await this.logCorrelation({
        imei: exceptionLog.deviceImei,
        correlation_type: 'exception_triggered',
        firebase_exception_id: exceptionLog.id,
        api_response: { error: error.message },
        api_status: 'error',
        correlation_result: 'no_data',
        notes: `Event-driven correlation failed: ${error.message}`
      });
    }
  }

  // Legacy method - kept for backward compatibility but not used in event-driven mode
  async correlateException(exceptionLog: ExceptionLog): Promise<void> {
    if (!exceptionLog.deviceImei) {
      console.log('Exception log missing deviceImei, skipping correlation');
      return;
    }

    try {
      console.log(`Correlating exception for device ${exceptionLog.deviceImei} (IMEI-only mode)`);
      
      // First check if IMEI exists in our inventory (from periodic sync)
      const { data: inventoryData, error: inventoryError } = await supabase
        .from('device_inventory')
        .select('*')
        .eq('imei', exceptionLog.deviceImei)
        .single();
      
      let correlationResult: 'confirmed' | 'conflicted' | 'no_data' = 'no_data';
      let apiResponse: any = null;
      let notes = '';
      
      if (inventoryError || !inventoryData) {
        // IMEI not in inventory - only fetch API data for critical exceptions
        const isCritical = this.isCriticalException(exceptionLog);
        
        if (isCritical) {
          console.log(`Critical exception for unknown IMEI ${exceptionLog.deviceImei}, fetching API details...`);
          const deviceDetails = await apiService.getDeviceByImei(exceptionLog.deviceImei);
          const activityStatus = await apiService.getDeviceActivityStatus(exceptionLog.deviceImei);
          
          apiResponse = { device: deviceDetails, activity: activityStatus };
          correlationResult = deviceDetails ? 'confirmed' : 'no_data';
          notes = deviceDetails 
            ? `Critical exception for unknown IMEI - device found in API`
            : `Critical exception for unknown IMEI - device not found in API`;
        } else {
          apiResponse = { inventory_status: 'not_found' };
          correlationResult = 'no_data';
          notes = `Non-critical exception for unknown IMEI - no API call made (IMEI-only optimization)`;
        }
      } else {
        // IMEI exists in inventory - use cached data for correlation
        apiResponse = { inventory: inventoryData };
        correlationResult = 'confirmed';
        notes = `Exception for known device in inventory (last seen: ${inventoryData.last_seen_api || 'unknown'})`;
      }
      
      // Log the correlation
      await this.logCorrelation({
        imei: exceptionLog.deviceImei,
        correlation_type: 'exception_triggered',
        firebase_exception_id: exceptionLog.id,
        api_response: apiResponse,
        api_status: apiResponse ? 'success' : 'no_data',
        correlation_result: correlationResult,
        notes
      });

      // Update device inventory with Firebase data
      await this.updateDeviceWithFirebaseData(exceptionLog.deviceImei, exceptionLog);
      
    } catch (error) {
      console.error(`Correlation failed for device ${exceptionLog.deviceImei}:`, error);
      
      // Log the failed correlation
      await this.logCorrelation({
        imei: exceptionLog.deviceImei,
        correlation_type: 'exception_triggered',
        firebase_exception_id: exceptionLog.id,
        api_response: { error: error.message },
        api_status: 'error',
        correlation_result: 'no_data',
        notes: `Correlation failed: ${error.message}`
      });
    }
  }

  // Check if exception is critical enough to warrant API call
  private isCriticalException(exceptionLog: ExceptionLog): boolean {
    const main = (exceptionLog.main || '').toLowerCase();
    return main.includes('server') || 
           main.includes('critical') || 
           main.includes('down') ||
           main.includes('offline');
  }

  // Determine correlation result based on Firebase and API data
  private determineCorrelationResult(
    exceptionLog: ExceptionLog,
    deviceDetails: DeviceDetails | null,
    activityStatus: any
  ): 'confirmed' | 'conflicted' | 'no_data' {
    if (!deviceDetails) {
      return 'no_data';
    }

    const exceptionType = (exceptionLog.main || '').toLowerCase();
    
    // If Firebase shows "server down" but API shows device is active, it's conflicted
    if (exceptionType.includes('server') && exceptionType.includes('down')) {
      return activityStatus.isActive ? 'conflicted' : 'confirmed';
    }
    
    // If Firebase shows device issues and API shows inactive, it's confirmed
    if (exceptionType.includes('device') || exceptionType.includes('connection')) {
      return !activityStatus.isActive ? 'confirmed' : 'conflicted';
    }
    
    // Default to confirmed if we have data
    return 'confirmed';
  }

  // Generate human-readable correlation notes
  private generateCorrelationNotes(
    exceptionLog: ExceptionLog,
    deviceDetails: DeviceDetails | null,
    activityStatus: any
  ): string {
    const notes = [];
    
    notes.push(`Firebase Exception: ${exceptionLog.main || 'Unknown'}`);
    
    if (deviceDetails) {
      notes.push(`API Device Status: ${deviceDetails.status || 'Unknown'}`);
      notes.push(`API Activity: ${activityStatus.isActive ? 'Active' : 'Inactive'}`);
      notes.push(`Recent Locations: ${activityStatus.locationCount}`);
      
      if (activityStatus.lastActivity) {
        const lastActivity = new Date(activityStatus.lastActivity);
        const minutesAgo = Math.round((Date.now() - lastActivity.getTime()) / (1000 * 60));
        notes.push(`Last Activity: ${minutesAgo} minutes ago`);
      }
    } else {
      notes.push('API: Device not found or API unavailable');
    }
    
    return notes.join(' | ');
  }

  // Update device inventory with Firebase exception data
  private async updateDeviceWithFirebaseData(imei: string, exceptionLog: ExceptionLog): Promise<void> {
    try {
      const { error } = await supabase
        .from('device_inventory')
        .upsert({
          imei,
          last_seen_firebase: new Date().toISOString(),
          is_active_firebase: false, // Exception indicates problem
          last_exception_type: exceptionLog.main || 'Unknown',
          updated_at: new Date().toISOString()
        }, { onConflict: 'imei' });

      if (error) {
        console.error(`Failed to update device with Firebase data for ${imei}:`, error);
      }
    } catch (error) {
      console.error(`Error updating device with Firebase data for ${imei}:`, error);
    }
  }

  // Log correlation attempt
  private async logCorrelation(correlationData: Omit<CorrelationLog, 'id' | 'created_at'>): Promise<void> {
    try {
      const { error } = await supabase
        .from('api_correlation_logs')
        .insert({
          ...correlationData,
          created_at: new Date().toISOString()
        });

      if (error) {
        console.error('Failed to log correlation:', error);
      }
    } catch (error) {
      console.error('Error logging correlation:', error);
    }
  }

  // Calculate health score based on various factors
  private calculateHealthScore(isActive: boolean, locationCount: number): number {
    let score = 100;
    
    // Deduct points for inactivity
    if (!isActive) {
      score -= 50;
    }
    
    // Deduct points for low location count
    if (locationCount === 0) {
      score -= 30;
    } else if (locationCount < 3) {
      score -= 15;
    }
    
    return Math.max(0, score);
  }

  // Get device inventory for dashboard
  async getDeviceInventory(): Promise<DeviceInventoryRecord[]> {
    try {
      const { data, error } = await supabase
        .from('device_inventory')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Failed to fetch device inventory:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching device inventory:', error);
      return [];
    }
  }

  // Get recent correlation logs
  async getCorrelationLogs(limit: number = 50): Promise<CorrelationLog[]> {
    try {
      const { data, error } = await supabase
        .from('api_correlation_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Failed to fetch correlation logs:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching correlation logs:', error);
      return [];
    }
  }

  // Manual full sync (for initial setup or troubleshooting only)
  async manualFullSync(): Promise<{ success: boolean; message: string; devices: number }> {
    try {
      console.log('🔄 Manual full sync initiated - fetching all devices from API...');
      const devices = await apiService.getAllDevices();
      
      let successCount = 0;
      let errorCount = 0;
      
      for (const device of devices) {
        try {
          await this.updateDeviceInventory(device);
          this.knownIMEIs.add(device.imei); // Update local cache
          successCount++;
        } catch (error) {
          console.error(`Failed to sync device ${device.imei}:`, error);
          errorCount++;
        }
      }
      
      // Log the manual sync
      await this.logCorrelation({
        imei: 'ALL_DEVICES',
        correlation_type: 'manual',
        api_response: {
          total_devices: devices.length,
          successful_syncs: successCount,
          failed_syncs: errorCount
        },
        api_status: 'success',
        correlation_result: 'confirmed',
        notes: `Manual full sync: ${successCount}/${devices.length} devices synced successfully`
      });
      
      return {
        success: true,
        message: `Manual sync completed: ${successCount} successful, ${errorCount} errors`,
        devices: devices.length
      };
      
    } catch (error) {
      console.error('Manual full sync failed:', error);
      return {
        success: false,
        message: `Manual sync failed: ${error.message}`,
        devices: 0
      };
    }
  }

  // Manual device check (for testing or troubleshooting)
  async manualDeviceCheck(imei: string): Promise<void> {
    try {
      const deviceDetails = await apiService.getDeviceByImei(imei);
      const activityStatus = await apiService.getDeviceActivityStatus(imei);
      
      await this.logCorrelation({
        imei,
        correlation_type: 'manual',
        api_response: {
          device: deviceDetails,
          activity: activityStatus
        },
        api_status: deviceDetails ? 'success' : 'error',
        correlation_result: deviceDetails ? 'confirmed' : 'no_data',
        notes: `Manual check: Device ${deviceDetails ? 'found' : 'not found'}, Activity: ${activityStatus.isActive ? 'Active' : 'Inactive'}`
      });

      if (deviceDetails) {
        await this.updateDeviceInventory(deviceDetails);
        this.knownIMEIs.add(imei); // Update local cache
      }
    } catch (error) {
      console.error(`Manual device check failed for ${imei}:`, error);
    }
  }
}

export const correlationService = new CorrelationService();