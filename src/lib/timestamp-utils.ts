import { Timestamp } from 'firebase/firestore';

/**
 * Centralized timestamp parsing utility to handle all Firebase timestamp formats
 * and prevent "Invalid time value" errors throughout the application
 */

export type TimestampInput = Timestamp | string | Date | number | null | undefined;

/**
 * Safely parse any timestamp format into a valid Date object
 * @param timestamp - Any timestamp format from Firebase or other sources
 * @returns Valid Date object or current date as fallback
 */
export function parseTimestamp(timestamp: TimestampInput): Date {
  // Handle null/undefined
  if (!timestamp) {
    console.warn('parseTimestamp: Received null/undefined timestamp, using current date');
    return new Date();
  }

  try {
    // Handle Firebase Timestamp objects
    if (timestamp instanceof Timestamp) {
      return timestamp.toDate();
    }

    // Handle objects with toDate method (Firebase Timestamp-like)
    if (typeof timestamp === 'object' && timestamp !== null && 'toDate' in timestamp && typeof timestamp.toDate === 'function') {
      return timestamp.toDate();
    }

    // Handle Firebase Timestamp objects with seconds and nanoseconds
    if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in timestamp && 'nanoseconds' in timestamp) {
      const seconds = (timestamp as any).seconds;
      const nanoseconds = (timestamp as any).nanoseconds || 0;
      return new Date(seconds * 1000 + nanoseconds / 1000000);
    }

    // Handle Date objects
    if (timestamp instanceof Date) {
      if (isNaN(timestamp.getTime())) {
        console.warn('parseTimestamp: Invalid Date object, using current date');
        return new Date();
      }
      return timestamp;
    }

    // Handle numbers (Unix timestamps)
    if (typeof timestamp === 'number') {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        console.warn('parseTimestamp: Invalid number timestamp, using current date');
        return new Date();
      }
      return date;
    }

    // Handle string timestamps
    if (typeof timestamp === 'string') {
      // Handle DD/MM/YYYY HH:mm:ss.SSS format (Firebase format)
      if (timestamp.includes('/') && timestamp.includes(' ')) {
        const [datePart, timePart] = timestamp.split(' ');
        if (datePart && timePart) {
          const [day, month, year] = datePart.split('/');
          if (day && month && year) {
            // Create ISO format: YYYY-MM-DDTHH:mm:ss.SSS
            const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${timePart}`;
            const date = new Date(isoString);
            if (!isNaN(date.getTime())) {
              return date;
            }
          }
        }
      }

      // Handle ISO format and other standard formats
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date;
      }

      console.warn(`parseTimestamp: Could not parse string timestamp "${timestamp}", using current date`);
      return new Date();
    }

    // Fallback for unknown types
    console.warn(`parseTimestamp: Unknown timestamp type "${typeof timestamp}", using current date`);
    return new Date();

  } catch (error) {
    console.error('parseTimestamp: Error parsing timestamp:', error, 'Input:', timestamp);
    return new Date();
  }
}

/**
 * Safely format a timestamp for display with error handling
 * @param timestamp - Any timestamp format
 * @param formatString - date-fns format string
 * @returns Formatted date string or fallback
 */
export function formatTimestamp(timestamp: TimestampInput, formatString: string = 'MMM dd, yyyy hh:mm:ss a'): string {
  try {
    // Handle undefined, null, or invalid timestamps early
    if (!timestamp || timestamp === 'undefined' || timestamp === 'null') {
      console.log('formatTimestamp: No timestamp provided, returning "No date"');
      return 'No date';
    }
    
    console.log('formatTimestamp: Input:', timestamp, 'Type:', typeof timestamp);
    
    const date = parseTimestamp(timestamp);
    console.log('formatTimestamp: Parsed date:', date, 'Valid:', !isNaN(date.getTime()));
    
    // Double-check the parsed date is valid
    if (isNaN(date.getTime())) {
      console.warn('formatTimestamp: Parsed date is invalid, returning "Invalid date"');
      return 'Invalid date';
    }
    
    // Import format dynamically to avoid circular dependencies
    const { format } = require('date-fns');
    const result = format(date, formatString);
    console.log('formatTimestamp: Formatted result:', result);
    return result;
  } catch (error) {
    console.error('formatTimestamp: Error formatting timestamp:', error, 'Input:', timestamp);
    return 'Invalid date';
  }
}

/**
 * Check if a timestamp is valid
 * @param timestamp - Any timestamp format
 * @returns boolean indicating if timestamp is valid
 */
export function isValidTimestamp(timestamp: TimestampInput): boolean {
  if (!timestamp) return false;
  
  try {
    const date = parseTimestamp(timestamp);
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}

/**
 * Get time ago string (e.g., "2 hours ago")
 * @param timestamp - Any timestamp format
 * @returns Human readable time ago string
 */
export function getTimeAgo(timestamp: TimestampInput): string {
  try {
    const date = parseTimestamp(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    if (diffMs < 0) return 'In the future';
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return formatTimestamp(timestamp, 'MMM dd, yyyy');
  } catch (error) {
    console.error('getTimeAgo: Error calculating time ago:', error);
    return 'Unknown time';
  }
}