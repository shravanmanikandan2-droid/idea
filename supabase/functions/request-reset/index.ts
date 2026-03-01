import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Check if user exists
    const { data: { users }, error: userError } = await supabaseClient.auth.admin.listUsers()
    
    if (userError) {
      throw userError
    }

    const user = users.find(u => u.email === email)

    if (!user) {
      // Return success even if user not found to prevent email enumeration
      return new Response(
        JSON.stringify({ message: 'If an account exists, a reset code has been sent.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // 1.5 Check rate limiting (e.g., max 1 request per minute)
    const { data: recentTokens } = await supabaseClient
      .from('password_reset_tokens')
      .select('created_at')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1)

    if (recentTokens?.[0]) {
      const lastRequestTime = new Date(recentTokens[0].created_at).getTime()
      const now = new Date().getTime()
      if (now - lastRequestTime < 60 * 1000) { // 1 minute
        return new Response(
          JSON.stringify({ error: 'rate_limited' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
        )
      }
    }

    // 2. Generate a 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString()

    // 3. Set expiry to 15 minutes from now
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 15)

    // 4. Save to database
    const { error: dbError } = await supabaseClient
      .from('password_reset_tokens')
      .insert({
        user_id: user.id,
        email: email,
        token: code,
        expires_at: expiresAt.toISOString(),
        attempts: 0
      })

    if (dbError) {
      throw dbError
    }

    // 5. Send email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY is not set')
    }

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`
      },
      body: JSON.stringify({
        from: 'IdeaConnect <noreply@ideaconnect.com>', // Replace with your verified domain
        to: [email],
        subject: 'Your Password Reset Code',
        html: `
          <div style="font-family: sans-serif; max-w: 600px; margin: 0 auto;">
            <h2>Password Reset Request</h2>
            <p>You requested to reset your password. Use the following 6-digit code to complete the process:</p>
            <div style="background-color: #f4f4f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
              <h1 style="font-size: 32px; letter-spacing: 4px; margin: 0; color: #4f46e5;">${code}</h1>
            </div>
            <p>This code will expire in 15 minutes.</p>
            <p>If you did not request this, please ignore this email.</p>
          </div>
        `
      })
    })

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text()
      console.error('Resend error:', errorData)
      throw new Error('Failed to send email')
    }

    return new Response(
      JSON.stringify({ message: 'Reset code sent successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
