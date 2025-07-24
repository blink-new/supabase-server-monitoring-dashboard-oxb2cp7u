import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Target server to monitor
    const targetServer = 'http://twca.trackingworld.com.pk:3000'
    
    console.log(`Checking health of: ${targetServer}`)
    
    let status = 'down'
    let responseTime = null
    let httpStatusCode = null
    let errorMessage = null

    const startTime = Date.now()

    try {
      // Attempt to ping the server with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

      const response = await fetch(targetServer, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Blink-Server-Monitor/1.0'
        }
      })

      clearTimeout(timeoutId)
      
      responseTime = Date.now() - startTime
      httpStatusCode = response.status

      if (response.ok) {
        status = responseTime > 5000 ? 'degraded' : 'up'
      } else {
        status = 'degraded'
        errorMessage = `HTTP ${response.status}: ${response.statusText}`
      }

      console.log(`Health check result: ${status}, Response time: ${responseTime}ms, Status: ${httpStatusCode}`)

    } catch (error) {
      responseTime = Date.now() - startTime
      status = 'down'
      
      if (error.name === 'AbortError') {
        errorMessage = 'Request timeout (>10s)'
      } else {
        errorMessage = error.message || 'Connection failed'
      }
      
      console.log(`Health check failed: ${errorMessage}`)
    }

    // Store the health check result in database
    const { data, error: dbError } = await supabase
      .from('server_health_checks')
      .insert({
        timestamp: new Date().toISOString(),
        status,
        response_time_ms: responseTime,
        http_status_code: httpStatusCode,
        error_message: errorMessage
      })
      .select()

    if (dbError) {
      console.error('Database error:', dbError)
      throw dbError
    }

    console.log('Health check stored successfully:', data)

    return new Response(
      JSON.stringify({
        success: true,
        result: {
          status,
          response_time_ms: responseTime,
          http_status_code: httpStatusCode,
          error_message: errorMessage,
          timestamp: new Date().toISOString()
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )

  } catch (error) {
    console.error('Function error:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})