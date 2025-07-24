import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

interface Device {
  id: string;
  imei: string;
  name?: string;
  status?: string;
  lastSeen?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface LocationData {
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const API_BASE_URL = 'http://twca.trackingworld.com.pk:3000/api';
    
    console.log('Starting IMEI-only device inventory sync...');

    // Fetch devices from external API
    const devicesResponse = await fetch(`${API_BASE_URL}/devices`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!devicesResponse.ok) {
      throw new Error(`Failed to fetch devices: ${devicesResponse.status} ${devicesResponse.statusText}`);
    }

    const devicesApiResponse = await devicesResponse.json();
    
    if (!devicesApiResponse.success || !devicesApiResponse.data) {
      throw new Error(`API returned error: ${JSON.stringify(devicesApiResponse)}`);
    }
    
    const devices: Device[] = devicesApiResponse.data;
    console.log(`Fetched ${devices.length} devices from API - IMEI-only mode`);

    const syncResults = [];

    // Process each device - IMEI-only approach (no location fetching)
    for (const device of devices) {
      try {
        // IMEI-only mode: Store minimal device data without location calls
        // This dramatically reduces API calls and stays within free tier limits
        
        const lastActivity = device.lastSeen || device.updatedAt;
        
        // Default health score - will be updated by correlation with Firebase
        const healthScore = 50; // Neutral score until correlation determines actual health

        // Upsert device inventory record - IMEI-only data
        const deviceData = {
          imei: device.imei,
          name: device.name || null,
          status: device.status || 'discovered',
          last_seen_api: lastActivity ? new Date(lastActivity).toISOString() : null,
          is_active_api: false, // Will be determined by Firebase correlation
          location_count: 0, // Not fetched in IMEI-only mode
          health_score: healthScore,
          updated_at: new Date().toISOString()
        };

        const { error: upsertError } = await supabase
          .from('device_inventory')
          .upsert(deviceData, { onConflict: 'imei' });

        if (upsertError) {
          console.error(`Failed to upsert device ${device.imei}:`, upsertError);
          syncResults.push({
            imei: device.imei,
            status: 'error',
            error: upsertError.message
          });
        } else {
          console.log(`Successfully synced device ${device.imei} (IMEI-only)`);
          syncResults.push({
            imei: device.imei,
            status: 'success',
            mode: 'imei_only',
            healthScore
          });
        }

        // Add small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error processing device ${device.imei}:`, error);
        syncResults.push({
          imei: device.imei,
          status: 'error',
          error: error.message
        });
      }
    }

    // Log correlation entry for this sync
    const { error: logError } = await supabase
      .from('api_correlation_logs')
      .insert({
        imei: 'ALL_DEVICES',
        correlation_type: 'scheduled_check',
        api_response: {
          total_devices: devices.length,
          sync_results: syncResults
        },
        api_status: 'success',
        correlation_result: 'confirmed',
        notes: `Scheduled sync completed: ${syncResults.filter(r => r.status === 'success').length}/${devices.length} devices synced successfully`,
        created_at: new Date().toISOString()
      });

    if (logError) {
      console.error('Failed to log sync correlation:', logError);
    }

    const successCount = syncResults.filter(r => r.status === 'success').length;
    const errorCount = syncResults.filter(r => r.status === 'error').length;

    return new Response(
      JSON.stringify({
        success: true,
        message: `Device sync completed: ${successCount} successful, ${errorCount} errors`,
        total_devices: devices.length,
        successful_syncs: successCount,
        failed_syncs: errorCount,
        sync_results: syncResults,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Device sync failed:', error);

    // Try to log the failed sync
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      await supabase
        .from('api_correlation_logs')
        .insert({
          imei: 'ALL_DEVICES',
          correlation_type: 'scheduled_check',
          api_response: { error: error.message },
          api_status: 'error',
          correlation_result: 'no_data',
          notes: `Scheduled sync failed: ${error.message}`,
          created_at: new Date().toISOString()
        });
    } catch (logError) {
      console.error('Failed to log sync error:', logError);
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});