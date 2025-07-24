import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, orderBy, limit, onSnapshot, getDocs, Timestamp, CollectionReference, DocumentData } from 'firebase/firestore';
import { correlationService } from './correlation';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDGl94SoCAlrtOxEYHADAcMjVGztoyw1Og",
  authDomain: "twtracking-ed046.firebaseapp.com",
  projectId: "twtracking-ed046",
  storageBucket: "twtracking-ed046.firebasestorage.app",
  messagingSenderId: "677023761996",
  appId: "1:677023761996:web:7dfff925ffb52d3659d6e9",
  measurementId: "G-4ZWF3ND1LG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

// Types for Firebase data
export interface ExceptionLog {
  id: string;
  createdAt: Timestamp;
  timestamp: string;
  details: string;
  deviceImei: string;
  main: string;
}

export interface IgnitionLog {
  id: string;
  createdAt: Timestamp;
  timestamp?: string;
  deviceImei?: string;
  imei?: string;
  message?: string;
  details?: string;
  logType?: string;
  ignitionStatus?: boolean;
  voltage?: number;
  address?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface DeviceStatus {
  imei: string;
  lastExceptionTime: Date | null;
  lastIgnitionTime: Date | null;
  recentExceptions: ExceptionLog[];
  recentIgnitions: IgnitionLog[];
  status: 'healthy' | 'warning' | 'critical';
  criticalExceptions: number;
}

// Firebase service class
export class FirebaseService {
  private static instance: FirebaseService;

  static getInstance(): FirebaseService {
    if (!FirebaseService.instance) {
      FirebaseService.instance = new FirebaseService();
    }
    return FirebaseService.instance;
  }

  // Get exception logs for a specific device
  subscribeToExceptionLogs(
    deviceImei: string, 
    callback: (logs: ExceptionLog[]) => void,
    limitCount: number = 50
  ): () => void {
    try {
      const exceptionLogsRef = collection(db, `devices/${deviceImei}/exception_logs`) as CollectionReference<DocumentData>;
      const q = query(exceptionLogsRef, orderBy('createdAt', 'desc'), limit(limitCount));
      
      return onSnapshot(q, (snapshot) => {
        const logs: ExceptionLog[] = [];
        const newLogs: ExceptionLog[] = [];
        
        snapshot.forEach((doc) => {
          const logData = {
            id: doc.id,
            ...doc.data()
          } as ExceptionLog;
          logs.push(logData);
          
          // Check if this is a new document (for correlation triggering)
          if (!doc.metadata.hasPendingWrites && doc.metadata.fromCache === false) {
            newLogs.push(logData);
          }
        });
        
        // Trigger event-driven correlation for ALL new exceptions
        // This will automatically discover new IMEIs and make API calls only when needed
        newLogs.forEach(log => {
          console.log(`Event-driven correlation triggered for exception: ${log.main} (${log.deviceImei})`);
          correlationService.correlateExceptionEventDriven(log).catch(error => {
            console.error('Event-driven correlation failed:', error);
          });
        });
        
        callback(logs);
      }, (error) => {
        console.error('Error subscribing to exception logs:', error);
        callback([]);
      });
    } catch (error) {
      console.error('Error setting up exception logs subscription:', error);
      return () => {};
    }
  }

  // Get ignition logs for a specific device
  subscribeToIgnitionLogs(
    deviceImei: string, 
    callback: (logs: IgnitionLog[]) => void,
    limitCount: number = 50
  ): () => void {
    try {
      const ignitionLogsRef = collection(db, `devices/${deviceImei}/ignition_logs`) as CollectionReference<DocumentData>;
      const q = query(ignitionLogsRef, orderBy('createdAt', 'desc'), limit(limitCount));
      
      return onSnapshot(q, (snapshot) => {
        const logs: IgnitionLog[] = [];
        snapshot.forEach((doc) => {
          logs.push({
            id: doc.id,
            ...doc.data()
          } as IgnitionLog);
        });
        callback(logs);
      }, (error) => {
        console.error('Error subscribing to ignition logs:', error);
        callback([]);
      });
    } catch (error) {
      console.error('Error setting up ignition logs subscription:', error);
      return () => {};
    }
  }

  // Parse timestamp from various formats
  parseTimestamp(timestamp: string | Timestamp): Date {
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate();
    }
    
    if (typeof timestamp === 'string') {
      // Handle DD/MM/YYYY HH:mm:ss.SSS format
      if (timestamp.includes('/')) {
        const [datePart, timePart] = timestamp.split(' ');
        const [day, month, year] = datePart.split('/');
        return new Date(`${year}-${month}-${day}T${timePart}`);
      }
      
      // Handle ISO format
      return new Date(timestamp);
    }
    
    return new Date();
  }

  // Determine device status based on recent logs
  calculateDeviceStatus(exceptionLogs: ExceptionLog[], ignitionLogs: IgnitionLog[]): DeviceStatus['status'] {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Check for critical exceptions in the last hour
    const recentCriticalExceptions = exceptionLogs.filter(log => {
      const logTime = this.parseTimestamp(log.createdAt);
      const mainText = (log.main || '').toLowerCase();
      return logTime > oneHourAgo && (
        mainText === 'server down' || 
        mainText.includes('critical') ||
        mainText.includes('error')
      );
    });

    if (recentCriticalExceptions.length > 0) {
      return 'critical';
    }

    // Check for warnings
    const recentWarnings = exceptionLogs.filter(log => {
      const logTime = this.parseTimestamp(log.createdAt);
      const mainText = (log.main || '').toLowerCase();
      return logTime > oneHourAgo && (
        mainText.includes('retry') ||
        mainText.includes('warning')
      );
    });

    if (recentWarnings.length > 2) {
      return 'warning';
    }

    return 'healthy';
  }

  // Discover all devices that have data in Firebase
  async discoverDevices(): Promise<string[]> {
    try {
      console.log('🔍 Starting comprehensive device discovery...');
      const deviceImeis: string[] = [];
      
      // Method 1: Try to get all documents in devices collection
      console.log('📋 Method 1: Querying devices collection...');
      const devicesRef = collection(db, 'devices');
      const snapshot = await getDocs(devicesRef);
      
      console.log(`📊 Found ${snapshot.size} documents in devices collection`);
      
      // Log each document found
      snapshot.docs.forEach(doc => {
        console.log(`📄 Document found: ${doc.id}, data:`, doc.data());
      });
      
      // Check each document and verify it has subcollections
      for (const doc of snapshot.docs) {
        const deviceId = doc.id;
        console.log(`🔍 Checking device: ${deviceId}`);
        
        try {
          // Check if this device has exception logs
          const exceptionLogsRef = collection(db, `devices/${deviceId}/exception_logs`);
          const exceptionSnapshot = await getDocs(exceptionLogsRef);
          
          if (!exceptionSnapshot.empty) {
            console.log(`✅ Device ${deviceId} has ${exceptionSnapshot.size} exception logs`);
            deviceImeis.push(deviceId);
          } else {
            console.log(`❌ Device ${deviceId} has no exception logs`);
          }
        } catch (error) {
          console.log(`⚠️ Error checking exception logs for device ${deviceId}:`, error);
        }
      }
      
      // Method 2: Try alternative approach - use collection group query
      if (deviceImeis.length === 0) {
        console.log('🔄 Method 2: Trying collection group query for exception_logs...');
        try {
          const { collectionGroup } = await import('firebase/firestore');
          const exceptionLogsGroup = collectionGroup(db, 'exception_logs');
          const exceptionSnapshot = await getDocs(exceptionLogsGroup);
          
          console.log(`📊 Found ${exceptionSnapshot.size} exception logs across all devices`);
          
          const foundImeis = new Set<string>();
          exceptionSnapshot.docs.forEach(doc => {
            const deviceImei = doc.data().deviceImei;
            if (deviceImei) {
              foundImeis.add(deviceImei);
              console.log(`🎯 Found IMEI from exception log: ${deviceImei}`);
            }
          });
          
          deviceImeis.push(...Array.from(foundImeis));
        } catch (error) {
          console.log('⚠️ Collection group query failed:', error);
        }
      }
      
      // Method 3: Try known device patterns
      if (deviceImeis.length === 0) {
        console.log('🔄 Method 3: Trying known device patterns...');
        const knownPatterns = [
          '865632050467004', // Known working device
          '865632050467005', // Potential pattern
          '865632050467006', // Potential pattern
          '865632050467007', // Potential pattern
        ];
        
        for (const deviceId of knownPatterns) {
          try {
            console.log(`🔍 Testing device pattern: ${deviceId}`);
            const exceptionLogsRef = collection(db, `devices/${deviceId}/exception_logs`);
            const exceptionSnapshot = await getDocs(exceptionLogsRef);
            if (!exceptionSnapshot.empty) {
              console.log(`✅ Pattern device ${deviceId} has ${exceptionSnapshot.size} exception logs`);
              deviceImeis.push(deviceId);
            } else {
              console.log(`❌ Pattern device ${deviceId} has no data`);
            }
          } catch (error) {
            console.log(`⚠️ Pattern device ${deviceId} error:`, error);
          }
        }
      }
      
      // Method 4: Manual device list (if you know specific IMEIs)
      if (deviceImeis.length === 0) {
        console.log('🔄 Method 4: Using manual device list...');
        // Add any specific IMEIs you know exist in your Firebase
        const manualDevices = [
          '865632050467004', // Keep the known working one
          // Add other IMEIs here if you know them
        ];
        
        for (const deviceId of manualDevices) {
          try {
            const exceptionLogsRef = collection(db, `devices/${deviceId}/exception_logs`);
            const exceptionSnapshot = await getDocs(exceptionLogsRef);
            if (!exceptionSnapshot.empty) {
              deviceImeis.push(deviceId);
            }
          } catch (error) {
            console.log(`⚠️ Manual device ${deviceId} not accessible`);
          }
        }
      }
      
      const uniqueDevices = [...new Set(deviceImeis)];
      console.log(`🎯 Final discovered devices (${uniqueDevices.length}):`, uniqueDevices);
      
      if (uniqueDevices.length === 0) {
        console.log('⚠️ No devices discovered, using ultimate fallback');
        return ['865632050467004'];
      }
      
      return uniqueDevices;
    } catch (error) {
      console.error('❌ Error in device discovery:', error);
      return ['865632050467004']; // Ultimate fallback
    }
  }

  // Get all exception logs for initial loading
  async getExceptionLogs(deviceImei?: string): Promise<ExceptionLog[]> {
    try {
      if (deviceImei) {
        // Get logs for specific device
        const exceptionLogsRef = collection(db, `devices/${deviceImei}/exception_logs`) as CollectionReference<DocumentData>;
        const q = query(exceptionLogsRef, orderBy('createdAt', 'desc'), limit(50));
        
        const snapshot = await getDocs(q);
        const logs: ExceptionLog[] = [];
        
        snapshot.forEach((doc) => {
          logs.push({
            id: doc.id,
            ...doc.data()
          } as ExceptionLog);
        });
        
        return logs;
      } else {
        // Dynamically discover all devices and get their logs
        const discoveredDevices = await this.discoverDevices();
        const allLogs: ExceptionLog[] = [];
        
        for (const imei of discoveredDevices) {
          try {
            const deviceLogs = await this.getExceptionLogs(imei);
            allLogs.push(...deviceLogs);
          } catch (error) {
            console.error(`Error fetching logs for device ${imei}:`, error);
          }
        }
        
        // Sort all logs by timestamp
        return allLogs.sort((a, b) => {
          const aTime = new Date(a.timestamp || a.createdAt?.toDate()).getTime();
          const bTime = new Date(b.timestamp || b.createdAt?.toDate()).getTime();
          return bTime - aTime;
        });
      }
    } catch (error) {
      console.error('Error fetching exception logs:', error);
      return [];
    }
  }

  // Get comprehensive device status
  getDeviceStatus(
    imei: string,
    exceptionLogs: ExceptionLog[],
    ignitionLogs: IgnitionLog[]
  ): DeviceStatus {
    const lastExceptionTime = exceptionLogs.length > 0 
      ? this.parseTimestamp(exceptionLogs[0].createdAt)
      : null;
    
    const lastIgnitionTime = ignitionLogs.length > 0
      ? this.parseTimestamp(ignitionLogs[0].createdAt)
      : null;

    const criticalExceptions = exceptionLogs.filter(log => {
      const mainText = (log.main || '').toLowerCase();
      return mainText === 'server down' || 
             mainText.includes('critical');
    }).length;

    return {
      imei,
      lastExceptionTime,
      lastIgnitionTime,
      recentExceptions: exceptionLogs.slice(0, 10),
      recentIgnitions: ignitionLogs.slice(0, 10),
      status: this.calculateDeviceStatus(exceptionLogs, ignitionLogs),
      criticalExceptions
    };
  }

  // Subscribe to exceptions for all devices (for OperationsDashboard compatibility)
  subscribeToExceptions(callback: (deviceId: string, exceptions: ExceptionLog[]) => void): () => void {
    const unsubscribeFunctions: (() => void)[] = [];
    let isSetup = false;
    
    // Setup subscriptions asynchronously but return unsubscribe function immediately
    const setupSubscriptions = async () => {
      try {
        if (isSetup) return;
        isSetup = true;
        
        console.log('🔄 Setting up exception subscriptions for all devices...');
        const devices = await this.discoverDevices();
        console.log(`📡 Setting up subscriptions for ${devices.length} devices:`, devices);
        
        devices.forEach(deviceId => {
          const unsubscribe = this.subscribeToExceptionLogs(deviceId, (logs) => {
            callback(deviceId, logs);
          });
          unsubscribeFunctions.push(unsubscribe);
        });
        
        console.log('✅ Exception subscriptions setup complete');
      } catch (error) {
        console.error('❌ Error setting up exception subscriptions:', error);
      }
    };

    // Start setup immediately but don't wait for it
    setupSubscriptions();

    return () => {
      console.log('🔌 Unsubscribing from all exception subscriptions');
      unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    };
  }

  // Subscribe to ignition logs for all devices (for LogsHistory compatibility)
  subscribeToIgnition(callback: (deviceId: string, ignitionData: IgnitionLog[]) => void): () => void {
    const unsubscribeFunctions: (() => void)[] = [];
    let isSetup = false;
    
    // Setup subscriptions asynchronously but return unsubscribe function immediately
    const setupSubscriptions = async () => {
      try {
        if (isSetup) return;
        isSetup = true;
        
        console.log('🔄 Setting up ignition subscriptions for all devices...');
        const devices = await this.discoverDevices();
        console.log(`🔥 Setting up ignition subscriptions for ${devices.length} devices:`, devices);
        
        devices.forEach(deviceId => {
          const unsubscribe = this.subscribeToIgnitionLogs(deviceId, (logs) => {
            callback(deviceId, logs);
          });
          unsubscribeFunctions.push(unsubscribe);
        });
        
        console.log('✅ Ignition subscriptions setup complete');
      } catch (error) {
        console.error('❌ Error setting up ignition subscriptions:', error);
      }
    };

    // Start setup immediately but don't wait for it
    setupSubscriptions();

    return () => {
      console.log('🔌 Unsubscribing from all ignition subscriptions');
      unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
    };
  }

  // Get ignition logs for a specific device (async version for compatibility)
  async getIgnitionLogs(deviceImei: string): Promise<IgnitionLog[]> {
    try {
      const ignitionLogsRef = collection(db, `devices/${deviceImei}/ignition_logs`) as CollectionReference<DocumentData>;
      const q = query(ignitionLogsRef, orderBy('createdAt', 'desc'), limit(50));
      
      const snapshot = await getDocs(q);
      const logs: IgnitionLog[] = [];
      
      snapshot.forEach((doc) => {
        logs.push({
          id: doc.id,
          ...doc.data()
        } as IgnitionLog);
      });
      
      return logs;
    } catch (error) {
      console.error(`Error fetching ignition logs for device ${deviceImei}:`, error);
      return [];
    }
  }
}

export const firebaseService = FirebaseService.getInstance();