import { createClient } from '@supabase/supabase-js';

function readEnvValue(...keys) {
  for (const key of keys) {
    if (!key) continue;

    if (typeof window !== 'undefined') {
      const fromWindow = window[key] ?? window[`__${key}__`];
      if (typeof fromWindow === 'string' && fromWindow.trim()) {
        return fromWindow.trim();
      }
    }

    try {
      if (typeof import.meta !== 'undefined' && import.meta.env) {
        const fromImportMeta = import.meta.env[key];
        if (typeof fromImportMeta === 'string' && fromImportMeta.trim()) {
          return fromImportMeta.trim();
        }
      }
    } catch (error) {
      // Accessing import.meta can throw in non-module environments; ignore.
    }

    if (typeof globalThis !== 'undefined') {
      const fromGlobal = globalThis[key] ?? globalThis[`__${key}__`];
      if (typeof fromGlobal === 'string' && fromGlobal.trim()) {
        return fromGlobal.trim();
      }
    }

    if (typeof process !== 'undefined' && process.env) {
      const fromProcess = process.env[key];
      if (typeof fromProcess === 'string' && fromProcess.trim()) {
        return fromProcess.trim();
      }
    }
  }

  return '';
}

const SUPABASE_URL = readEnvValue(
  'VITE_SUPABASE_URL',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL'
);
const SUPABASE_ANON_KEY = readEnvValue(
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY'
);

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Supabase credentials are not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
