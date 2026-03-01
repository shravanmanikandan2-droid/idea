export async function requestPasswordReset(email: string) {
  // Generate a random 6-digit code
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  console.log(`Generated reset code for ${email}: ${code}`);

  // In a real application, you would store this code in your database
  // associated with the user's email and an expiration time.
  // Example:
  // await supabase.from('password_resets').insert({ email, code, expires_at: new Date(Date.now() + 15 * 60000) });

  try {
    // Request to send the email with the code
    // This could be a call to your backend API, a Supabase Edge Function, or an email service (Resend, SendGrid, etc.)
    const response = await fetch('/api/send-reset-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: email,
        code: code,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to send reset email');
    }

    const data = await response.json();
    return { success: true, message: 'Reset email sent successfully' };
  } catch (error) {
    console.error('Error requesting password reset:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
