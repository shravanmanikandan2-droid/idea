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
    const { email, otp, new_password } = await req.json()

    if (!email || !otp || !new_password) {
      return new Response(
        JSON.stringify({ error: 'Email, otp, and new_password are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Find the token
    const { data: resetTokens, error: fetchError } = await supabaseClient
      .from('password_reset_tokens')
      .select('*')
      .eq('email', email)
      .eq('token', otp)
      .order('created_at', { ascending: false })
      .limit(1)

    if (fetchError) {
      throw fetchError
    }

    const resetToken = resetTokens?.[0]

    if (!resetToken) {
      // Increment attempts for the latest token for this email (if any)
      const { data: latestTokens } = await supabaseClient
        .from('password_reset_tokens')
        .select('*')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1)

      if (latestTokens?.[0]) {
        const latestToken = latestTokens[0]
        if (latestToken.attempts >= 3) {
          return new Response(
            JSON.stringify({ error: 'Too many failed attempts. Please request a new code.' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
          )
        }
        await supabaseClient
          .from('password_reset_tokens')
          .update({ attempts: latestToken.attempts + 1 })
          .eq('id', latestToken.id)
      }

      return new Response(
        JSON.stringify({ error: 'invalid_otp' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 2. Check expiry
    const now = new Date()
    const expiresAt = new Date(resetToken.expires_at)

    if (now > expiresAt) {
      return new Response(
        JSON.stringify({ error: 'expired' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 3. Check attempts
    if (resetToken.attempts >= 3) {
      return new Response(
        JSON.stringify({ error: 'Too many failed attempts. Please request a new code.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // 4. Update password
    const { error: updateError } = await supabaseClient.auth.admin.updateUserById(
      resetToken.user_id,
      { password: new_password }
    )

    if (updateError) {
      throw updateError
    }

    // 5. Delete the token (and any other tokens for this user)
    await supabaseClient
      .from('password_reset_tokens')
      .delete()
      .eq('user_id', resetToken.user_id)

    return new Response(
      JSON.stringify({ message: 'Password updated successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
