import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Valida se as variáveis de ambiente foram configuradas corretamente
// (verifica se são não-vazias e não são os valores de placeholder do .env.example)
export const isSupabaseConfigured = 
  !!supabaseUrl && 
  supabaseUrl !== 'https://SUA_REF_DE_PROJETO.supabase.co' && 
  !!supabaseAnonKey;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : (null as any); // Mantém compatibilidade com tipos
