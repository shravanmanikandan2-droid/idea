import { createClient } from '@supabase/supabase-js';

// Try multiple ways to get the environment variables
const getEnv = (key: string) => {
  // @ts-ignore
  return import.meta.env[key] || 
         (typeof process !== 'undefined' ? process.env[key] : undefined) ||
         // @ts-ignore
         (typeof window !== 'undefined' ? window._env_?.[key] : undefined);
};

const rawUrl = getEnv('VITE_SUPABASE_URL');
const rawKey = getEnv('VITE_SUPABASE_ANON_KEY');

const cleanValue = (val: any) => {
  if (!val) return undefined;
  let s = String(val).trim();
  if (s === 'undefined' || s === 'null' || s === '') return undefined;
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s;
};

const supabaseUrl = cleanValue(rawUrl);
const supabaseAnonKey = cleanValue(rawKey);

if (typeof window !== 'undefined') {
  console.log('Supabase Config Check:', {
    urlSet: !!supabaseUrl,
    urlValid: supabaseUrl?.startsWith('https://'),
    keySet: !!supabaseAnonKey,
    origin: window.location.origin
  });
}

export const isSupabaseConfigured = () => {
  return !!supabaseUrl && supabaseUrl.startsWith('https://') && !!supabaseAnonKey;
};

export const supabase = createClient(
  isSupabaseConfigured() ? supabaseUrl! : 'https://bchuntzfagrdsiewyqwm.supabase.co',
  isSupabaseConfigured() ? supabaseAnonKey! : 'placeholder-key'
);
